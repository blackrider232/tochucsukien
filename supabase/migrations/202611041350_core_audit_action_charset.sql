-- 202611041350_core_audit_action_charset.sql
-- A denylist of core actions cannot list every look-alike: Cyrillic Р and О,
-- the bidi isolates U+2066-2069 (which tcsk.audit_text kept), U+034F and the
-- Hangul filler U+3164 all wrote a row that reads "PHÂN QUYỀN TÀI KHOẢN".
-- An action is now Vietnamese letters, digits, spaces and plain punctuation
-- only, and an entity is an ASCII identifier; anything else is refused.
-- audit_text also drops the bidi isolates, like the embeddings before them.
-- memoryDb's writer applies the same sets (src/core/db/memory.ts).
-- Idempotent: create or replace, grants re-applied.

-- NFKC, invisible format characters dropped, white space collapsed, trimmed; null when nothing is left.
create or replace function tcsk.audit_text(t text) returns text
language sql immutable set search_path = '' as $$
  select nullif(btrim(regexp_replace(
           regexp_replace(normalize(t, NFKC), '[­᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]', '', 'g'),
           '\s+', ' ', 'g')), '')
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
          'TẢI BẢN SAO LƯU', 'KHỞI TẠO QUẢN TRỊ VIÊN']) a), true) then
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

revoke all on function tcsk.audit_text(text) from public, anon, authenticated;
revoke all on function public.sce_tcsk_audit_command(uuid, text, text, text, text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.sce_tcsk_audit_command(uuid, text, text, text, text, text, uuid, text, text) to service_role;
