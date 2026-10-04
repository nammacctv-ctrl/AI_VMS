-- 0004: orders, order events, IMEI-aware services.

ALTER TABLE services ADD COLUMN input_kind text NOT NULL DEFAULT 'text'
  CHECK (input_kind IN ('text','imei','serial'));

CREATE TABLE orders (
  seq             bigint GENERATED ALWAYS AS IDENTITY,
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  user_id         uuid NOT NULL,
  service_id      uuid NOT NULL,
  -- snapshots: later catalog edits must never change what an order cost
  service_name    text NOT NULL,
  input           text NOT NULL CHECK (length(input) BETWEEN 1 AND 200),
  reference       text NOT NULL CHECK (length(reference) BETWEEN 1 AND 100),
  price_minor     bigint NOT NULL CHECK (price_minor >= 0),
  cost_minor      bigint NOT NULL CHECK (cost_minor >= 0),
  supplier_id     uuid NOT NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  result          text CHECK (length(result) <= 2000),
  failure_reason  text CHECK (length(failure_reason) <= 500),
  charge_tx_id    uuid NOT NULL,
  refund_tx_id    uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  UNIQUE (tenant_id, user_id, reference),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, user_id)     REFERENCES users (tenant_id, id),
  FOREIGN KEY (tenant_id, service_id)  REFERENCES services (tenant_id, id),
  FOREIGN KEY (tenant_id, supplier_id) REFERENCES suppliers (tenant_id, id),
  FOREIGN KEY (tenant_id, charge_tx_id) REFERENCES ledger_transactions (tenant_id, id),
  FOREIGN KEY (tenant_id, refund_tx_id) REFERENCES ledger_transactions (tenant_id, id)
);
CREATE INDEX orders_tenant_seq_idx ON orders (tenant_id, seq DESC);
CREATE INDEX orders_user_seq_idx   ON orders (tenant_id, user_id, seq DESC);
CREATE INDEX orders_status_idx     ON orders (tenant_id, status, seq);
CREATE INDEX orders_dup_idx        ON orders (tenant_id, user_id, service_id, input);

CREATE TABLE order_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  order_id    uuid NOT NULL,
  from_status text,
  to_status   text NOT NULL,
  actor       text NOT NULL,
  note        text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, order_id) REFERENCES orders (tenant_id, id)
);
CREATE INDEX order_events_order_idx ON order_events (tenant_id, order_id, id);

CREATE TRIGGER order_events_no_change BEFORE UPDATE OR DELETE ON order_events
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();

-- The database itself enforces the state machine and freezes what was charged.
CREATE OR REPLACE FUNCTION orders_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id <> OLD.user_id OR NEW.service_id <> OLD.service_id OR NEW.service_name <> OLD.service_name
     OR NEW.input <> OLD.input OR NEW.reference <> OLD.reference OR NEW.price_minor <> OLD.price_minor
     OR NEW.cost_minor <> OLD.cost_minor OR NEW.supplier_id <> OLD.supplier_id OR NEW.charge_tx_id <> OLD.charge_tx_id
     OR NEW.tenant_id <> OLD.tenant_id THEN
    RAISE EXCEPTION 'order details are immutable';
  END IF;
  IF OLD.status IN ('completed','failed') AND (NEW.status <> OLD.status OR NEW.refund_tx_id IS DISTINCT FROM OLD.refund_tx_id) THEN
    RAISE EXCEPTION 'order is already %', OLD.status;
  END IF;
  IF NEW.status <> OLD.status AND NOT (
       (OLD.status = 'pending'    AND NEW.status IN ('processing','failed'))
    OR (OLD.status = 'processing' AND NEW.status IN ('completed','failed'))) THEN
    RAISE EXCEPTION 'illegal order transition % -> %', OLD.status, NEW.status;
  END IF;
  IF NEW.status = 'failed' AND NEW.refund_tx_id IS NULL THEN
    RAISE EXCEPTION 'a failed order must be refunded';
  END IF;
  IF NEW.status <> 'failed' AND NEW.refund_tx_id IS NOT NULL THEN
    RAISE EXCEPTION 'only failed orders are refunded';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER orders_guard_trg BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_guard();

CREATE OR REPLACE FUNCTION orders_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'orders cannot be deleted'; END $$;
CREATE TRIGGER orders_no_delete_trg BEFORE DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_no_delete();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orders','order_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant())', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON orders TO panel_app;
GRANT SELECT, INSERT ON order_events TO panel_app;
