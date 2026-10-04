-- 0001_init: tenancy, themes, audit, double-entry ledger. All tenant data is
-- protected by row-level security (default deny, forced for table owners).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Restricted application role. Deployments give it a login and password.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'panel_app') THEN
    CREATE ROLE panel_app NOLOGIN NOBYPASSRLS;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

-- ---------------------------------------------------------------- tenants
CREATE TABLE tenants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])$'),
  name       text NOT NULL,
  plan       text NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter','pro','business')),
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_domains (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  domain     text NOT NULL UNIQUE CHECK (domain = lower(domain)),
  verified   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------- themes
CREATE TABLE themes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  version    integer NOT NULL,
  document   jsonb NOT NULL,
  published  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, version)
);

-- ------------------------------------------------------------------ audit
CREATE TABLE audit_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor      text NOT NULL,
  action     text NOT NULL,
  detail     jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------- ledger
CREATE TABLE ledger_accounts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code       text NOT NULL,
  currency   char(3) NOT NULL DEFAULT 'INR',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id)
);

CREATE TABLE ledger_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  currency        char(3) NOT NULL DEFAULT 'INR',
  memo            text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (tenant_id, id)
);

-- Amounts are signed integer minor units (paise). Sum per transaction is 0.
CREATE TABLE ledger_entries (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  transaction_id uuid NOT NULL,
  account_id     uuid NOT NULL,
  amount_minor   bigint NOT NULL CHECK (amount_minor <> 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, transaction_id) REFERENCES ledger_transactions (tenant_id, id),
  FOREIGN KEY (tenant_id, account_id)     REFERENCES ledger_accounts (tenant_id, id)
);
CREATE INDEX ledger_entries_account_idx ON ledger_entries (tenant_id, account_id);

-- Append-only: block UPDATE/DELETE on ledger tables, even for owners.
CREATE OR REPLACE FUNCTION ledger_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger tables are append-only (%)', TG_TABLE_NAME;
END $$;

CREATE TRIGGER ledger_entries_no_change BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();
CREATE TRIGGER ledger_transactions_no_change BEFORE UPDATE OR DELETE ON ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();

-- Every transaction must balance to zero, checked at commit.
CREATE OR REPLACE FUNCTION ledger_check_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE total bigint;
BEGIN
  SELECT coalesce(sum(amount_minor), 0) INTO total
    FROM ledger_entries WHERE tenant_id = NEW.tenant_id AND transaction_id = NEW.transaction_id;
  IF total <> 0 THEN
    RAISE EXCEPTION 'ledger transaction % is unbalanced (sum %)', NEW.transaction_id, total;
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER ledger_entries_balanced AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_check_balanced();

-- A transaction needs at least two entries; checked at commit.
CREATE OR REPLACE FUNCTION ledger_check_has_entries() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM ledger_entries
        WHERE tenant_id = NEW.tenant_id AND transaction_id = NEW.id) < 2 THEN
    RAISE EXCEPTION 'ledger transaction % needs at least two entries', NEW.id;
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER ledger_transactions_has_entries AFTER INSERT ON ledger_transactions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_check_has_entries();

-- --------------------------------------------------- row-level security
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenant_domains','themes','audit_log',
                           'ledger_accounts','ledger_transactions','ledger_entries']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- tenants/tenant_domains are not forced: the SECURITY DEFINER platform
    -- functions run as the owner and must see them. The app role is not the
    -- owner, so RLS still applies to it everywhere.
    IF t <> 'tenant_domains' THEN
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    END IF;
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant())', t);
  END LOOP;
END $$;

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenants
  USING (id = app_current_tenant()) WITH CHECK (id = app_current_tenant());

-- ----------------------------------- platform-level operations (no tenant yet)
-- Resolve a request host to a tenant before any tenant context exists.
CREATE OR REPLACE FUNCTION platform_resolve_tenant(p_slug text, p_domain text)
RETURNS TABLE (id uuid, slug text, name text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.slug, t.name FROM tenants t
   WHERE t.status = 'active'
     AND ( (p_slug IS NOT NULL AND t.slug = p_slug)
        OR (p_domain IS NOT NULL AND EXISTS (
              SELECT 1 FROM tenant_domains d
               WHERE d.tenant_id = t.id AND d.domain = p_domain AND d.verified)) )
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION platform_create_tenant(p_slug text, p_name text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_id uuid;
BEGIN
  INSERT INTO tenants (slug, name) VALUES (p_slug, p_name) RETURNING id INTO new_id;
  RETURN new_id;
END $$;

REVOKE ALL ON FUNCTION platform_resolve_tenant(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform_create_tenant(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_resolve_tenant(text, text) TO panel_app;
GRANT EXECUTE ON FUNCTION platform_create_tenant(text, text) TO panel_app;
GRANT EXECUTE ON FUNCTION app_current_tenant() TO panel_app;

-- Least privilege for the app role: no UPDATE/DELETE on append-only tables.
GRANT USAGE ON SCHEMA public TO panel_app;
GRANT SELECT, UPDATE ON tenants TO panel_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_domains, themes TO panel_app;
GRANT SELECT, INSERT ON audit_log, ledger_accounts, ledger_transactions, ledger_entries TO panel_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO panel_app;
