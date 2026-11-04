-- 202611041450_reports_vn_day.sql
-- The Hà Nội day of an instant, as one function the issue trigger calls. The
-- trigger used to work the day out inline from now(), so a test could not pin
-- it: a trigger that took the UTC day instead only differed from 17:00 to
-- 24:00 UTC and passed the suite the rest of the day. sql.test.ts now checks
-- the function at fixed instants and swaps it for a stub to prove the trigger
-- takes its day from it.
-- The trigger body is 202611041440's with the day taken from the helper.
-- Idempotent: create or replace.

create or replace function tcsk.reports_vn_day(ts timestamptz) returns date
language sql immutable set search_path = '' as $$
  select (ts at time zone 'Asia/Ho_Chi_Minh')::date
$$;

create or replace function tcsk.reports_issue_stamp() returns trigger
language plpgsql set search_path = '' as $$
declare
  ev record;
  today date := tcsk.reports_vn_day(now());
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
