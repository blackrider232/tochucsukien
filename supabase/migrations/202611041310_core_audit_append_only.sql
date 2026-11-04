-- 202611041310_core_audit_append_only.sql
-- The audit log was append-only only through grants, which the table owner and
-- the service role (bypassrls, default ALL) do not need. These triggers refuse
-- every UPDATE, DELETE and TRUNCATE whoever runs it. Nothing in the app edits
-- or removes audit rows: restore leaves the table out (tcsk.backup_tables).
-- Idempotent: create or replace, drop trigger if exists.

create or replace function tcsk.audit_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'sce_tcsk_audit_logs is append-only' using errcode = '42501';
end $$;
revoke all on function tcsk.audit_append_only() from public, anon, authenticated;

drop trigger if exists sce_tcsk_audit_no_change on public.sce_tcsk_audit_logs;
create trigger sce_tcsk_audit_no_change before update or delete on public.sce_tcsk_audit_logs
  for each row execute function tcsk.audit_append_only();
drop trigger if exists sce_tcsk_audit_no_truncate on public.sce_tcsk_audit_logs;
create trigger sce_tcsk_audit_no_truncate before truncate on public.sce_tcsk_audit_logs
  for each statement execute function tcsk.audit_append_only();

revoke update, delete, truncate on public.sce_tcsk_audit_logs from authenticated, service_role;
