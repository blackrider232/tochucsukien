-- 202611041320_comms_deliveries_imported_only_by_import.sql
-- comms only (sce:owner=comms tables). Idempotent.
--
-- `imported` exempts a 'sent' row from the Gmail-evidence check, because the
-- old app's rows carry none. Only the import script (service role, which
-- bypasses RLS) may write such a row: an officer with comms.send writing to
-- the table directly can no longer mark a row imported, so every row an
-- officer writes as sent carries Gmail's message id and a time.
drop policy if exists sce_comms_not_imported_insert on public.sce_tcsk_email_deliveries;
create policy sce_comms_not_imported_insert on public.sce_tcsk_email_deliveries
  as restrictive for insert to authenticated with check (not imported);
drop policy if exists sce_comms_not_imported_update on public.sce_tcsk_email_deliveries;
create policy sce_comms_not_imported_update on public.sce_tcsk_email_deliveries
  as restrictive for update to authenticated using (true) with check (not imported);
