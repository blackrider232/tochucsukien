-- 202611041610_core_system_run_claims.sql
-- Follow-up to 202611041600_core_system_actor.sql (not edited). Two changes.
--
-- 1. The replay window of a scheduled job is claimed with one atomic upsert on
--    tcsk.system_runs (one row per job), not by an advisory lock around a read of
--    the audit log. Two instances that start together contend for the job's row:
--    the second waits for the first to commit, then sees the new start and gets
--    false. The lock no longer has to be there for the claim to be exclusive, and
--    verify-sql can test the predicate (PGlite has one connection, so it cannot
--    race two callers). The start is still audited, once per claim, and a
--    refused start writes nothing. The table is reachable only through
--    sce_tcsk_start_system_run: RLS on, no policy, no grant.
--
-- 2. The human command writer (sce_tcsk_audit_command) refuses the action
--    'CHẠY TÁC VỤ HỆ THỐNG' too. Only sce_tcsk_start_system_run writes it, as
--    system:<job>. A human row with that action could not hold the replay
--    window any more (the window is tcsk.system_runs), but it would read like a
--    job start in the audit log. The body is 202611041350's with that one
--    action added to the core list. memoryDb's writer (src/core/db/memory.ts)
--    keeps its own list.
--
-- Idempotent: create if not exists, create or replace, grants re-applied.

create table if not exists tcsk.system_runs (
  job text primary key,
  started_at timestamptz not null
);
alter table tcsk.system_runs enable row level security;
revoke all on table tcsk.system_runs from public, anon, authenticated, service_role;

create or replace function public.sce_tcsk_start_system_run(job text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  job_label text;
  window_seconds integer;
  claimed text;
begin
  select max(g.label), max(g.min_interval_seconds) into job_label, window_seconds
    from tcsk.system_grants() g where g.job = sce_tcsk_start_system_run.job;
  if window_seconds is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- A start takes the job's row only when the last start is older than the window; a concurrent second start waits on
  -- the row lock and then fails this predicate.
  insert into tcsk.system_runs as r (job, started_at) values (sce_tcsk_start_system_run.job, now())
    on conflict on constraint system_runs_pkey do update set started_at = excluded.started_at
      where r.started_at <= now() - make_interval(secs => window_seconds)
    returning r.job into claimed;
  if claimed is null then
    return false;
  end if;
  insert into public.sce_tcsk_audit_logs (actor_id, actor_email, action, summary, event_id, entity, entity_id)
  values (null, 'system:' || sce_tcsk_start_system_run.job, 'CHẠY TÁC VỤ HỆ THỐNG', 'Bắt đầu: ' || job_label, null, 'system_job', sce_tcsk_start_system_run.job);
  return true;
end $$;
revoke all on function public.sce_tcsk_start_system_run(text) from public, anon, authenticated;
grant execute on function public.sce_tcsk_start_system_run(text) to service_role;

create or replace function public.sce_tcsk_audit_command(
  actor_id uuid, actor_aal text, command text, perm text, action text, summary text,
  event_id uuid default null, entity text default null, entity_id text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  feature text := split_part(command, '.', 1);
  clean_action text := tcsk.audit_text(action);
  clean_entity text := tcsk.audit_text(entity);
  actor record;
  rule record;
  ev record;
  allowed boolean;
begin
  if actor_id is null or actor_aal is null or command is null or perm is null or clean_action is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if clean_action !~ '^[0-9A-Za-zÀ-ÃÈ-ÊÌÍÒ-ÕÙÚÝà-ãè-êìíò-õùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ /().,:;''"&+%#?!-]+$'
     or clean_entity !~ '^[A-Za-z0-9_.-]+$' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(feature in ('', 'core') or split_part(command, '.', 2) = '' or actor_aal not in ('aal1', 'aal2')
     or (split_part(perm, '.', 1) <> feature and (command, perm) not in (('directory.importToEvent', 'guests.write')))
     or coalesce(lower(clean_entity), '') in ('profile', 'backup', 'settings', 'holidays')
     or lower(clean_action) in (select lower(a) from unnest(array[
          'CẬP NHẬT THAM SỐ HỆ THỐNG', 'CẬP NHẬT NGÀY NGHỈ LỄ', 'CẬP NHẬT HỒ SƠ', 'PHÂN QUYỀN TÀI KHOẢN', 'CHUYỂN PHÒNG BAN',
          'DUYỆT/MỞ KHÓA TÀI KHOẢN', 'KHÓA TÀI KHOẢN', 'TẠO TÀI KHOẢN', 'TẠO BẢN SAO LƯU', 'KHÔI PHỤC SAO LƯU',
          'TẢI BẢN SAO LƯU', 'KHỞI TẠO QUẢN TRỊ VIÊN', 'CHẠY TÁC VỤ HỆ THỐNG']) a), true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select p.role, p.department, p.email into actor
    from public.sce_tcsk_profiles p where p.id = sce_tcsk_audit_command.actor_id and p.status = 'active';
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- tcsk.aal_ok() and tcsk.grant_for(), for this actor instead of the JWT's.
  if actor_aal <> 'aal2' and (actor.role in ('admin', 'leader')
      or exists (select 1 from auth.mfa_factors f where f.user_id = sce_tcsk_audit_command.actor_id and f.status = 'verified')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select rp.scope, case when rp.requires_aal2 and actor_aal <> 'aal2' then 'none' else rp.grant_level end as level into rule
    from public.sce_tcsk_role_permissions rp where rp.permission = perm and rp.role = actor.role;
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if sce_tcsk_audit_command.event_id is null then
    allowed := rule.scope = 'global' and rule.level = 'all';
  else
    select e.department, e.supporting_departments into ev from public.sce_tcsk_events e where e.id = sce_tcsk_audit_command.event_id;
    allowed := found and rule.scope = 'event' and (rule.level = 'all' or (rule.level = 'department' and actor.department is not null
               and (actor.department = ev.department or actor.department = any(coalesce(ev.supporting_departments, '{}')))));
  end if;
  if not coalesce(allowed, false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.sce_tcsk_audit_logs (actor_id, actor_email, action, summary, event_id, entity, entity_id)
  values (sce_tcsk_audit_command.actor_id, actor.email, left(clean_action, 120), left(summary, 2000),
          sce_tcsk_audit_command.event_id, clean_entity, sce_tcsk_audit_command.entity_id);
end $$;

revoke all on function public.sce_tcsk_audit_command(uuid, text, text, text, text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.sce_tcsk_audit_command(uuid, text, text, text, text, text, uuid, text, text) to service_role;
