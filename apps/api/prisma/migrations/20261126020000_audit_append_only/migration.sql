-- Audit trails are append-only for the application role (constitution VII).
-- 1) The app role can no longer rewrite or erase history.
--    Conditional so environments with a differently named app role do not fail the deploy.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'noah_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON "audit_logs" FROM noah_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON "staff_auth_audits" FROM noah_app;
  END IF;
END
$$;

-- 2) Deleting a tenant must not erase its audit trail: drop the cascading FK
--    (tenant_id is kept and still enforced by RLS).
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_tenant_id_fkey";

-- 3) Defence in depth: reject UPDATE/DELETE on audit_logs for every role except the owner
--    running explicit maintenance (session_replication_role = replica disables the trigger).
CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_no_update_delete ON "audit_logs";
CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();
