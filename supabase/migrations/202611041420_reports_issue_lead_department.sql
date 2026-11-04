-- 202611041420_reports_issue_lead_department.sql
-- Decision 17: the head of the event's lead department signs the daily report,
-- so only the lead department may issue it. The insert policy 0002 registered
-- (tcsk.has_event_perm) also let a supporting department's head issue a report
-- signed with the lead department head's title. Supporting departments keep
-- reading the reports and editing the other report tables. A soft-deleted
-- event takes no new report. The command checks the same rule
-- (server/command-kit.ts, issueReports).
-- Idempotent: create or replace, drop and create the policy.

create or replace function tcsk.reports_can_issue(eid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sce_tcsk_events e
     where e.id = eid
       and e.deleted_at is null
       and tcsk.can_on_departments('reports.issue', e.department, '{}')
  )
$$;

drop policy if exists sce_insert on public.sce_tcsk_daily_reports;
create policy sce_insert on public.sce_tcsk_daily_reports for insert to authenticated with check (tcsk.reports_can_issue(event_id));
