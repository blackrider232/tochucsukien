-- 202611041300_core_table_privileges.sql
-- Supabase's default privileges grant ALL on every new table to anon,
-- authenticated and service_role. tcsk.register_table and 0001 revoke anon and
-- grant authenticated SELECT/INSERT/UPDATE/DELETE for RLS to decide, but never
-- took back TRUNCATE (which RLS does not see), REFERENCES or TRIGGER. This
-- revokes them on every sce_tcsk_ table and view, and stops the default
-- privileges of the migration role from granting them on tables created later.
-- Idempotent: revokes only.

do $$
declare t regclass;
begin
  for t in
    select c.oid::regclass from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p') and c.relname like 'sce\_tcsk\_%'
  loop
    execute format('revoke truncate, references, trigger on %s from authenticated', t);
    execute format('revoke all on %s from anon', t);
  end loop;
end $$;

alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;
alter default privileges in schema public revoke all on tables from anon;
