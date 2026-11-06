-- 202611061000_core_mfa_switch.sql
-- One switch for the MFA requirement, so a demo can run without it and the requirement comes back with one UPDATE.
--
--   tcsk.flags('mfa_enforced') = 'on' (the default, and what this migration seeds) or 'off'.
--
-- tcsk.mfa_enforced() reads it. tcsk.aal_ok() and the audit writer's copy of the same rule treat the requirement
-- as met when it is 'off', whatever the role and whatever factors the account has. The step-up for
-- core.backups.restore (requires_aal2) is NOT relaxed: with MFA off, nobody can restore a backup.
-- The app has the same switch in the MFA_ENFORCED environment variable (src/core/auth/mfa-policy.ts); the
-- two fail safe against each other (one side off, the other on: the account sees nothing, it is never over-granted).
-- Turn off / on (Management API or SQL editor):
--   update tcsk.flags set value = 'off' where key = 'mfa_enforced';
--   update tcsk.flags set value = 'on'  where key = 'mfa_enforced';
-- Idempotent: create if not exists, insert on conflict do nothing, create or replace, grants re-applied.

create table if not exists tcsk.flags (
  key text primary key,
  value text not null
);
alter table tcsk.flags enable row level security;
revoke all on table tcsk.flags from public, anon, authenticated, service_role;
insert into tcsk.flags (key, value) values ('mfa_enforced', 'on') on conflict (key) do nothing;

create or replace function tcsk.mfa_enforced() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select f.value from tcsk.flags f where f.key = 'mfa_enforced'), 'on') <> 'off'
$$;

create or replace function tcsk.aal_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when not tcsk.mfa_enforced() then true
    when coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' then true
    when exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified') then false
    when exists (select 1 from public.sce_tcsk_profiles p where p.id = auth.uid() and p.role in ('admin','leader')) then false
    else true
  end
$$;

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
  -- tcsk.aal_ok() and tcsk.grant_for(), for this actor instead of the JWT's (and the same MFA switch).
  if actor_aal <> 'aal2' and tcsk.mfa_enforced() and (actor.role in ('admin', 'leader')
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
