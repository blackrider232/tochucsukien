-- 0006_core_soft_delete_visibility.sql
-- Whoever may soft-delete an event (progress.delete: admin and leader for all
-- events, dept_leader for its lead department) can read it while it is
-- deleted, so the inverse command finds the row to restore. Without this a
-- non-admin could not soft-delete at all: an UPDATE also checks the new row
-- against the SELECT policy, and the deleted row failed it.
-- Child tables keep tcsk.has_event_perm from 0002: the rows of a deleted
-- event stay readable to admin only.

drop policy if exists sce_read on public.sce_tcsk_events;
create policy sce_read on public.sce_tcsk_events for select to authenticated using (
  case when deleted_at is null
       then tcsk.can_on_departments('progress.read', department, supporting_departments)
       else tcsk.can_on_departments('progress.delete', department, '{}')
  end);
