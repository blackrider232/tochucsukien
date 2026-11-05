-- 202611041600_core_system_actor.sql
-- A scheduled job (the RSVP sync cron) runs commands with no person behind it.
-- The app runs them as the job's system actor over the service role, and these
-- two functions are its only ways into the audit log. Only the service role
-- executes either.
--
-- sce_tcsk_audit_system writes a command's row as 'system:<job>' with a null
-- actor id, only for a (command, permission) pair tcsk.system_grants() lists for
-- the job, never for a core command, and on an existing, live event when the
-- permission is event scoped. The action and entity checks are the command writer's (202611041350).
--
-- tcsk.system_grants() is that table: SYSTEM_JOBS (src/core/permissions) as rows.
-- Changing a job's commands or window ships a NEW migration that replaces this
-- function; check:contract fails while the latest definition differs from
-- SYSTEM_JOBS. No role holds these permissions (0004 grants none to a system job).
--
-- sce_tcsk_start_system_run claims the job's replay window under an advisory
-- lock and audits the start; a second start inside the window returns false.
-- Idempotent: create or replace, grants re-applied.

create or replace function tcsk.system_grants()
returns table (job text, label text, command text, perm text, min_interval_seconds integer)
language sql immutable set search_path = '' as $$
  select * from (values
      ('rsvp-sync', 'Đồng bộ Google Form RSVP tự động', 'comms.syncForm', 'comms.rsvp.manage', 240),
      ('rsvp-sync', 'Đồng bộ Google Form RSVP tự động', 'guests.applyRsvp', 'guests.write', 240),
      ('rsvp-sync', 'Đồng bộ Google Form RSVP tự động', 'guests.upsertMany', 'guests.write', 240),
      ('rsvp-sync', 'Đồng bộ Google Form RSVP tự động', 'venue.releaseGuestSeat', 'venue.seating.write', 240)
  ) g(job, label, command, perm, min_interval_seconds)
$$;
revoke all on function tcsk.system_grants() from public, anon, authenticated;

create or replace function public.sce_tcsk_audit_system(
  job text, command text, perm text, action text, summary text,
  event_id uuid default null, entity text default null, entity_id text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  feature text := split_part(command, '.', 1);
  clean_action text := tcsk.audit_text(action);
  clean_entity text := tcsk.audit_text(entity);
  perm_scope text;
  allowed boolean;
begin
  if job is null or command is null or perm is null or clean_action is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from tcsk.system_grants() g
                  where g.job = sce_tcsk_audit_system.job and g.command = sce_tcsk_audit_system.command and g.perm = sce_tcsk_audit_system.perm) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if clean_action !~ '^[0-9A-Za-zÀ-ÃÈ-ÊÌÍÒ-ÕÙÚÝà-ãè-êìíò-õùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ /().,:;''"&+%#?!-]+$'
     or clean_entity !~ '^[A-Za-z0-9_.-]+$' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(feature in ('', 'core') or split_part(command, '.', 2) = '' or split_part(perm, '.', 1) <> feature
     or coalesce(lower(clean_entity), '') in ('profile', 'backup', 'settings', 'holidays')
     or lower(clean_action) in (select lower(a) from unnest(array[
          'CẬP NHẬT THAM SỐ HỆ THỐNG', 'CẬP NHẬT NGÀY NGHỈ LỄ', 'CẬP NHẬT HỒ SƠ', 'PHÂN QUYỀN TÀI KHOẢN', 'CHUYỂN PHÒNG BAN',
          'DUYỆT/MỞ KHÓA TÀI KHOẢN', 'KHÓA TÀI KHOẢN', 'TẠO TÀI KHOẢN', 'TẠO BẢN SAO LƯU', 'KHÔI PHỤC SAO LƯU',
          'TẢI BẢN SAO LƯU', 'KHỞI TẠO QUẢN TRỊ VIÊN', 'CHẠY TÁC VỤ HỆ THỐNG']) a), true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select rp.scope into perm_scope from public.sce_tcsk_role_permissions rp where rp.permission = sce_tcsk_audit_system.perm limit 1;
  if sce_tcsk_audit_system.event_id is null then
    allowed := perm_scope = 'global';
  else
    allowed := perm_scope = 'event' and exists (select 1 from public.sce_tcsk_events e
                                                 where e.id = sce_tcsk_audit_system.event_id and e.deleted_at is null);
  end if;
  if not coalesce(allowed, false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.sce_tcsk_audit_logs (actor_id, actor_email, action, summary, event_id, entity, entity_id)
  values (null, 'system:' || sce_tcsk_audit_system.job, left(clean_action, 120), left(sce_tcsk_audit_system.summary, 2000),
          sce_tcsk_audit_system.event_id, clean_entity, sce_tcsk_audit_system.entity_id);
end $$;

create or replace function public.sce_tcsk_start_system_run(job text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  job_label text;
  window_seconds integer;
begin
  select max(g.label), max(g.min_interval_seconds) into job_label, window_seconds
    from tcsk.system_grants() g where g.job = sce_tcsk_start_system_run.job;
  if window_seconds is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('sce_tcsk_start_system_run:' || sce_tcsk_start_system_run.job));
  if exists (select 1 from public.sce_tcsk_audit_logs l
              where l.actor_id is null and l.actor_email = 'system:' || sce_tcsk_start_system_run.job
                and l.action = 'CHẠY TÁC VỤ HỆ THỐNG' and l.created_at > now() - make_interval(secs => window_seconds)) then
    return false;
  end if;
  insert into public.sce_tcsk_audit_logs (actor_id, actor_email, action, summary, event_id, entity, entity_id)
  values (null, 'system:' || sce_tcsk_start_system_run.job, 'CHẠY TÁC VỤ HỆ THỐNG', 'Bắt đầu: ' || job_label, null, 'system_job', sce_tcsk_start_system_run.job);
  return true;
end $$;

revoke all on function public.sce_tcsk_audit_system(text, text, text, text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.sce_tcsk_audit_system(text, text, text, text, text, uuid, text, text) to service_role;
revoke all on function public.sce_tcsk_start_system_run(text) from public, anon, authenticated;
grant execute on function public.sce_tcsk_start_system_run(text) to service_role;
