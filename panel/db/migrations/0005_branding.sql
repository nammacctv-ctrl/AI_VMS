-- 0005: per-panel branding: versioned themes, one logo per panel, safer tenant updates.

ALTER TABLE themes ADD COLUMN created_by text NOT NULL DEFAULT '';
ALTER TABLE themes ADD COLUMN note text NOT NULL DEFAULT '' CHECK (length(note) <= 200);

-- At most one published theme per panel.
CREATE UNIQUE INDEX themes_one_published ON themes (tenant_id) WHERE published;

-- A theme version is history: only the "published" flag may ever change.
CREATE OR REPLACE FUNCTION themes_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.document IS DISTINCT FROM OLD.document OR NEW.version <> OLD.version
     OR NEW.tenant_id <> OLD.tenant_id OR NEW.created_by <> OLD.created_by OR NEW.note <> OLD.note THEN
    RAISE EXCEPTION 'theme versions are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER themes_guard_trg BEFORE UPDATE ON themes FOR EACH ROW EXECUTE FUNCTION themes_guard();
CREATE OR REPLACE FUNCTION themes_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'theme versions cannot be deleted'; END $$;
CREATE TRIGGER themes_no_delete_trg BEFORE DELETE ON themes FOR EACH ROW EXECUTE FUNCTION themes_no_delete();

REVOKE UPDATE, DELETE ON themes FROM panel_app;
GRANT UPDATE (published) ON themes TO panel_app;

CREATE TABLE tenant_logos (
  tenant_id    uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('image/png','image/jpeg','image/webp')),
  data         bytea NOT NULL CHECK (octet_length(data) BETWEEN 1 AND 204800),
  sha256       text NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tenant_logos ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_logos FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_logos
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_logos TO panel_app;

-- The app may rename a panel, but never change its address, plan or status.
REVOKE UPDATE ON tenants FROM panel_app;
GRANT UPDATE (name) ON tenants TO panel_app;
