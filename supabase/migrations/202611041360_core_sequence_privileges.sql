-- 202611041360_core_sequence_privileges.sql
-- Supabase's default privileges grant ALL on every new sequence to anon and
-- authenticated, and 202611041300 covered tables only. With UPDATE on
-- sce_tcsk_audit_logs_id_seq a signed-in user could setval it back to 1, and
-- the next audited call then failed on audit_logs_pkey. Only owner-rights
-- functions draw these ids, so the API roles lose every privilege on the
-- sce_tcsk_ sequences. The project is shared with other apps, so the default
-- privileges of the migration role take only what no app needs: everything
-- from anon, setval (UPDATE) from authenticated.
-- Idempotent: revokes only.

do $$
declare s regclass;
begin
  for s in
    select c.oid::regclass from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'S' and c.relname like 'sce\_tcsk\_%'
  loop
    execute format('revoke all on sequence %s from anon, authenticated', s);
  end loop;
end $$;

alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke update on sequences from authenticated;
