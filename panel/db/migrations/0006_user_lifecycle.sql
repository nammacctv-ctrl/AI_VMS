-- 0006: removing a person disables them (history must survive); admins can reset access.

ALTER TABLE users ADD COLUMN disabled_at timestamptz;

-- An invite can now also reset or restore an EXISTING person (new password, 2FA cleared).
ALTER TABLE user_invites ADD COLUMN reset_user_id uuid;
ALTER TABLE user_invites ADD CONSTRAINT user_invites_reset_fk
  FOREIGN KEY (tenant_id, reset_user_id) REFERENCES users (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE user_invites DROP CONSTRAINT user_invites_role_check;
ALTER TABLE user_invites ADD CONSTRAINT user_invites_role_check CHECK (role IN ('owner','admin','support','reseller'));
-- A brand-new owner can never be invited; only an existing owner can have access reset.
ALTER TABLE user_invites ADD CONSTRAINT user_invites_owner_only_reset CHECK (role <> 'owner' OR reset_user_id IS NOT NULL);

-- People are never deleted by the app: orders, credit and the audit trail refer to them.
REVOKE DELETE ON users FROM panel_app;
