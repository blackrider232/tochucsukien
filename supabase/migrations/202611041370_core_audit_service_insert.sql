-- 202611041370_core_audit_service_insert.sql
-- The service role kept Supabase's default INSERT on sce_tcsk_audit_logs, so
-- anything holding the service key could insert a row with any actor and any
-- action, past every check of sce_tcsk_audit_command. The writer runs with
-- owner rights and needs no grant of its caller; the service role keeps only
-- EXECUTE on it (and SELECT on the table).
-- Idempotent: revokes only.

revoke insert on public.sce_tcsk_audit_logs from service_role;
