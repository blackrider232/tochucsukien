-- 202611041440_reports_issue_restore.sql
-- Core's restore runs as a signed-in admin, so auth.uid() is set, and reinserts
-- the daily reports before the events (relname order). The issue trigger of
-- 202611041410 ignored sce.restoring: it found no event and raised forbidden,
-- which rolled the whole restore back, and with the order fixed it would still
-- have restamped every report's date, time, issuer, signer and T-n with the
-- restorer's. A restore keeps the stored values, as tcsk.stamp does, so the
-- trigger now returns the new row as it is while sce.restoring is on.
-- Idempotent: create or replace.

create or replace function tcsk.reports_issue_stamp() returns trigger
language plpgsql set search_path = '' as $$
declare
  ev record;
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if auth.uid() is null or coalesce(current_setting('sce.restoring', true), '') = 'on' then
    return new;
  end if;
  new.issued_by := auth.uid();
  new.issued_at := now();
  new.report_date := today;
  select e.name, e.event_date, e.department into ev from public.sce_tcsk_events e where e.id = new.event_id;
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  new.event_name := ev.name;
  new.event_date := ev.event_date;
  new.signatory_title := tcsk.reports_signer_title(ev.department);
  new.workdays_to_event := tcsk.reports_workdays_to_event(ev.event_date, today);
  return new;
end $$;
