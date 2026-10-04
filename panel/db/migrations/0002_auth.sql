-- 0002_auth: users, sessions, atomic tenant signup.

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email           text NOT NULL CHECK (email = lower(email) AND length(email) <= 254),
  password_hash   text NOT NULL,
  role            text NOT NULL CHECK (role IN ('owner','admin','support','reseller')),
  totp_secret_enc text,
  totp_enabled    boolean NOT NULL DEFAULT false,
  totp_last_step  bigint,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email),
  UNIQUE (tenant_id, id)
);

CREATE TABLE sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  user_id      uuid NOT NULL,
  token_hash   text NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX sessions_user_idx ON sessions (tenant_id, user_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','sessions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant())', t);
  END LOOP;
END $$;

-- Create a tenant and its first owner in one atomic step (no tenant context yet).
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
  PERFORM set_config('app.tenant_id', '', true);
  RETURN new_id;
END $$;

REVOKE ALL ON FUNCTION platform_signup_tenant(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_signup_tenant(text, text, text, text) TO panel_app;

GRANT SELECT, INSERT, UPDATE ON users TO panel_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO panel_app;
