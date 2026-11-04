-- 202611041410_reports_issue_derived.sql
-- A user session could insert an issued report straight through PostgREST and
-- choose the event name, the event date, the signer title and T-n it shows.
-- The issue trigger now derives all four from the event row and the holiday
-- calendar, as it already stamped the issuer, the issue time and the VN day.
-- The figures cannot be recomputed here (they are the progress, guests and
-- venue features' selectors); whoever inserts them is on the row as issued_by.
-- T-n is the signed count of working days in [today, T0), the count of
-- workdaysToEvent in src/features/reports/domain/figures.ts; the signer title is
-- signerTitle in domain/report.ts. sql.test.ts checks both against the app.
-- An event the caller cannot see is refused. The import (service role, no
-- auth.uid()) keeps the legacy values.
-- Idempotent: create or replace.

create or replace function tcsk.reports_workdays_to_event(event_date date, today date) returns integer
language sql stable set search_path = '' as $$
  select (case when today <= event_date then 1 else -1 end) * count(*)::integer
    from generate_series(least(today, event_date), greatest(today, event_date) - 1, interval '1 day') as g(d)
    left join public.sce_tcsk_holidays h on h.holiday_date = g.d::date
   where coalesce(h.kind = 'compensatory_workday', extract(isodow from g.d) < 6)
$$;

create or replace function tcsk.reports_signer_title(department text) returns text
language sql immutable set search_path = '' as $$
  select case
           when btrim(coalesce(department, '')) = '' then 'TRƯỞNG PHÒNG PHỤ TRÁCH'
           when lower(btrim(department)) like 'phòng %' then 'TRƯỞNG ' || upper(btrim(department))
           else 'TRƯỞNG PHÒNG ' || upper(btrim(department))
         end
$$;

create or replace function tcsk.reports_issue_stamp() returns trigger
language plpgsql set search_path = '' as $$
declare
  ev record;
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if auth.uid() is null then
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
