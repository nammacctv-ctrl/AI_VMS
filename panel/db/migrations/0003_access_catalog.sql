-- 0003: staff invites, API keys, append-only audit log, service catalog.

-- ------------------------------------------------------- customer groups
CREATE TABLE customer_groups (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name               text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  default_markup_bps integer NOT NULL DEFAULT 0 CHECK (default_markup_bps BETWEEN 0 AND 100000),
  is_default         boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name),
  UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX customer_groups_one_default ON customer_groups (tenant_id) WHERE is_default;

ALTER TABLE users ADD COLUMN customer_group_id uuid;
ALTER TABLE users ADD FOREIGN KEY (tenant_id, customer_group_id)
  REFERENCES customer_groups (tenant_id, id);

-- ----------------------------------------------------------------- invites
CREATE TABLE user_invites (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email             text NOT NULL CHECK (email = lower(email)),
  role              text NOT NULL CHECK (role IN ('admin','support','reseller')),
  customer_group_id uuid,
  token_hash        text NOT NULL UNIQUE,
  invited_by        uuid NOT NULL,
  expires_at        timestamptz NOT NULL,
  accepted_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, customer_group_id) REFERENCES customer_groups (tenant_id, id)
);

-- ---------------------------------------------------------------- API keys
CREATE TABLE api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  user_id      uuid NOT NULL,
  name         text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  prefix       text NOT NULL,
  secret_hash  text NOT NULL,
  scopes       text[] NOT NULL,
  expires_at   timestamptz,
  revoked_at   timestamptz,
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, prefix),
  FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------- catalog
CREATE TABLE suppliers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  kind       text NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual')),
  enabled    boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name),
  UNIQUE (tenant_id, id)
);

-- cost_minor is what the tenant pays the supplier, in paise. Never shown to resellers.
CREATE TABLE services (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  supplier_id   uuid NOT NULL,
  external_ref  text NOT NULL CHECK (length(external_ref) BETWEEN 1 AND 100),
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 150),
  category      text NOT NULL DEFAULT 'general' CHECK (length(category) BETWEEN 1 AND 60),
  cost_minor    bigint NOT NULL CHECK (cost_minor >= 0 AND cost_minor <= 1000000000000),
  currency      char(3) NOT NULL DEFAULT 'INR',
  delivery_time text NOT NULL DEFAULT '' CHECK (length(delivery_time) <= 60),
  enabled       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, supplier_id, external_ref),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, supplier_id) REFERENCES suppliers (tenant_id, id)
);

CREATE TABLE price_overrides (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  group_id          uuid NOT NULL,
  service_id        uuid NOT NULL,
  markup_bps        integer CHECK (markup_bps BETWEEN 0 AND 100000),
  fixed_price_minor bigint CHECK (fixed_price_minor >= 0 AND fixed_price_minor <= 1000000000000),
  CHECK ((markup_bps IS NULL) <> (fixed_price_minor IS NULL)),
  UNIQUE (tenant_id, group_id, service_id),
  FOREIGN KEY (tenant_id, group_id)   REFERENCES customer_groups (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, service_id) REFERENCES services (tenant_id, id) ON DELETE CASCADE
);

-- -------------------------------------------------- RLS on all new tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customer_groups','user_invites','api_keys','suppliers','services','price_overrides']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant())', t);
  END LOOP;
END $$;

-- ------------------------------------------------- audit log is append-only
CREATE TRIGGER audit_log_no_change BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();

-- ------------------- every tenant gets a default customer group at signup
CREATE OR REPLACE FUNCTION platform_signup_tenant(
  p_slug text, p_name text, p_email text, p_password_hash text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_id uuid;
BEGIN
  INSERT INTO tenants (slug, name) VALUES (p_slug, p_name) RETURNING id INTO new_id;
  PERFORM set_config('app.tenant_id', new_id::text, true);
  INSERT INTO users (tenant_id, email, password_hash, role)
    VALUES (new_id, lower(p_email), p_password_hash, 'owner');
  INSERT INTO customer_groups (tenant_id, name, default_markup_bps, is_default)
    VALUES (new_id, 'Standard', 2000, true);
  PERFORM set_config('app.tenant_id', '', true);
  RETURN new_id;
END $$;

-- Backfill: tenants that signed up before this migration.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM tenants LOOP
    PERFORM set_config('app.tenant_id', r.id::text, true);
    INSERT INTO customer_groups (tenant_id, name, default_markup_bps, is_default)
      VALUES (r.id, 'Standard', 2000, true) ON CONFLICT DO NOTHING;
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON customer_groups, suppliers, services, price_overrides TO panel_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_invites TO panel_app;
GRANT SELECT, INSERT, UPDATE ON api_keys TO panel_app;
GRANT DELETE ON users TO panel_app;
