-- 0003_functions.sql
-- The few SQL functions the app may call (RpcMap in src/core/db), plus
-- triggers that keep invariants the client must not be trusted with.

-- ---------------------------------------------------------------------------
-- Audit: the only insert path into sce_tcsk_audit_logs. Actor comes from the
-- JWT, never from arguments.
-- ---------------------------------------------------------------------------
create or replace function public.sce_tcsk_write_audit(
  action text, summary text, event_id uuid default null, entity text default null, entity_id text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if tcsk.actor_role() is null then
    raise exception 'inactive actor' using errcode = '42501';
  end if;
  insert into public.sce_tcsk_audit_logs (actor_id, actor_email, action, summary, event_id, entity, entity_id)
  select auth.uid(), p.email, left(action, 120), left(summary, 2000), event_id, entity, entity_id
    from public.sce_tcsk_profiles p where p.id = auth.uid();
end $$;
revoke all on function public.sce_tcsk_write_audit(text, text, uuid, text, text) from public, anon;
grant execute on function public.sce_tcsk_write_audit(text, text, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Profiles: privileged changes, each re-checks core.users.manage, keeps at
-- least one active admin, and writes its own audit row.
-- ---------------------------------------------------------------------------
create or replace function tcsk.assert_users_manage() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not tcsk.has_perm('core.users.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

create or replace function tcsk.assert_admin_remains() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.sce_tcsk_profiles where role = 'admin' and status = 'active') then
    raise exception 'last_admin' using errcode = '23514';
  end if;
end $$;

create or replace function public.sce_tcsk_set_profile_role(id uuid, role text) returns void
language plpgsql security definer set search_path = '' as $$
declare old_role text;
begin
  perform tcsk.assert_users_manage();
  select p.role into old_role from public.sce_tcsk_profiles p where p.id = sce_tcsk_set_profile_role.id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.sce_tcsk_profiles p set role = sce_tcsk_set_profile_role.role where p.id = sce_tcsk_set_profile_role.id;
  perform tcsk.assert_admin_remains();
  perform public.sce_tcsk_write_audit('PHÂN QUYỀN TÀI KHOẢN', format('%s -> %s', old_role, sce_tcsk_set_profile_role.role), null, 'profile', sce_tcsk_set_profile_role.id::text);
end $$;

create or replace function public.sce_tcsk_set_profile_department(id uuid, department text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform tcsk.assert_users_manage();
  update public.sce_tcsk_profiles p set department = sce_tcsk_set_profile_department.department where p.id = sce_tcsk_set_profile_department.id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.sce_tcsk_write_audit('CHUYỂN PHÒNG BAN', sce_tcsk_set_profile_department.department, null, 'profile', sce_tcsk_set_profile_department.id::text);
end $$;

create or replace function public.sce_tcsk_set_profile_status(ids uuid[], status text) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform tcsk.assert_users_manage();
  if status not in ('active','locked') then raise exception 'invalid status' using errcode = '22023'; end if;
  if status = 'locked' and auth.uid() = any(ids) then raise exception 'cannot_lock_self' using errcode = '23514'; end if;
  update public.sce_tcsk_profiles p set status = sce_tcsk_set_profile_status.status
   where p.id = any(ids) and p.status is distinct from sce_tcsk_set_profile_status.status;
  get diagnostics n = row_count;
  perform tcsk.assert_admin_remains();
  perform public.sce_tcsk_write_audit(
    case status when 'active' then 'DUYỆT/MỞ KHÓA TÀI KHOẢN' else 'KHÓA TÀI KHOẢN' end,
    format('%s tài khoản', n), null, 'profile', array_to_string(ids, ','));
  return n;
end $$;

-- Users who exist in auth.users before the trigger (shared project) get a
-- pending profile on first visit.
create or replace function public.sce_tcsk_ensure_profile() returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.sce_tcsk_profiles (id, email, fullname, role, department, status)
  select u.id, lower(u.email), coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(u.email, '@', 1)),
         'user', null, 'pending'
    from auth.users u where u.id = auth.uid()
  on conflict (id) do nothing;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.sce_tcsk_set_profile_role(uuid, text)',
    'public.sce_tcsk_set_profile_department(uuid, text)',
    'public.sce_tcsk_set_profile_status(uuid[], text)',
    'public.sce_tcsk_ensure_profile()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- One-time bootstrap (core Q5): promotes the given email to active admin only
-- while no active admin exists. Run by hand in the SQL editor, never by the app.
create or replace function tcsk.bootstrap_first_admin(admin_email text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.sce_tcsk_profiles where role = 'admin' and status = 'active') then
    return 'skipped: an active admin already exists';
  end if;
  update public.sce_tcsk_profiles set role = 'admin', status = 'active' where email = lower(admin_email);
  if not found then return 'skipped: no profile with that email (sign up first)'; end if;
  insert into public.sce_tcsk_audit_logs (action, summary, entity, entity_id)
  values ('KHỞI TẠO QUẢN TRỊ VIÊN', admin_email, 'profile', admin_email);
  return 'ok';
end $$;
revoke all on function tcsk.bootstrap_first_admin(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Incidents: per-event sequence assigned under an advisory lock.
-- ---------------------------------------------------------------------------
create or replace function tcsk.incident_seq() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.seq is null or new.seq <= 0 then
    perform pg_advisory_xact_lock(hashtextextended('sce_incident:' || new.event_id::text, 0));
    select coalesce(max(i.seq), 0) + 1 into new.seq from public.sce_tcsk_incidents i where i.event_id = new.event_id;
  end if;
  return new;
end $$;
alter table public.sce_tcsk_incidents alter column seq set default 0;
drop trigger if exists sce_tcsk_incident_seq on public.sce_tcsk_incidents;
create trigger sce_tcsk_incident_seq before insert on public.sce_tcsk_incidents
  for each row execute function tcsk.incident_seq();

-- ---------------------------------------------------------------------------
-- Backups (format 2): a consistent snapshot of every table whose comment says
-- sce:owner=<feature>, minus core infrastructure. The table list is derived
-- from the catalog, so a new domain table is backed up without editing this.
-- ---------------------------------------------------------------------------
create or replace function tcsk.backup_tables() returns setof regclass
language sql stable set search_path = '' as $$
  select c.oid::regclass
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_description d on d.objoid = c.oid and d.objsubid = 0
   where n.nspname = 'public' and c.relkind = 'r'
     and d.description like 'sce:owner=%'
     and d.description not like '%;legacy%'
     and c.relname not in ('sce_tcsk_profiles','sce_tcsk_role_permissions','sce_tcsk_backups',
                           'sce_tcsk_audit_logs','sce_tcsk_departments')
   order by c.relname
$$;

create or replace function public.sce_tcsk_create_backup(note text, kind text default 'manual') returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  snapshot jsonb := '{}';
  t regclass;
  rows jsonb;
  new_id bigint;
begin
  if kind = 'manual' and not tcsk.has_perm('core.backups.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if kind = 'auto' and tcsk.actor_role() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if kind not in ('manual','auto') then raise exception 'invalid kind' using errcode = '22023'; end if;
  for t in select * from tcsk.backup_tables() loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from %s x', t) into rows;
    snapshot := snapshot || jsonb_build_object(t::text, rows);
  end loop;
  insert into public.sce_tcsk_backups (data, note, kind, format, created_by, created_by_email)
  select snapshot, coalesce(nullif(trim(note), ''), 'Sao lưu'), kind, 2, auth.uid(), p.email
    from public.sce_tcsk_profiles p where p.id = auth.uid()
  on conflict do nothing
  returning id into new_id;
  if kind = 'auto' then
    delete from public.sce_tcsk_backups b
     where b.kind = 'auto' and b.format = 2 and b.created_at < now() - interval '30 days';
  else
    perform public.sce_tcsk_write_audit('TẠO BẢN SAO LƯU', note, null, 'backup', new_id::text);
  end if;
  return new_id;
end $$;

-- Restore replaces every backed-up table in one transaction. Admin + AAL2
-- (requires_aal2 on core.backups.restore). Format 1 (legacy blob) restores go
-- through scripts/import-legacy.ts, not here.
create or replace function public.sce_tcsk_restore_backup(id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  snap jsonb;
  fmt smallint;
  t regclass;
begin
  if not tcsk.has_perm('core.backups.restore') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select b.data, b.format into snap, fmt from public.sce_tcsk_backups b where b.id = sce_tcsk_restore_backup.id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if fmt <> 2 then raise exception 'legacy_format' using errcode = '22023'; end if;

  perform public.sce_tcsk_create_backup(format('Trước khi khôi phục #%s', sce_tcsk_restore_backup.id), 'manual');
  set constraints all deferred;
  perform set_config('sce.restoring', 'on', true);
  for t in select * from tcsk.backup_tables() loop
    if t::text = 'sce_tcsk_system_settings' then
      continue;
    end if;
    execute format('delete from %s', t);
  end loop;
  for t in select * from tcsk.backup_tables() loop
    if snap ? t::text then
      if t::text = 'sce_tcsk_system_settings' then
        execute format('update %1$s s set (agency_name, agency_short_name, parent_agency, daily_report_threshold_days,
                          field_presence_hours, guest_quota_percent, badge_quota_percent, google_client_id)
                        = (select r.agency_name, r.agency_short_name, r.parent_agency, r.daily_report_threshold_days,
                                  r.field_presence_hours, r.guest_quota_percent, r.badge_quota_percent, r.google_client_id
                             from jsonb_populate_recordset(null::%1$s, $1) r limit 1)', t) using snap -> t::text;
      else
        execute format('insert into %1$s select * from jsonb_populate_recordset(null::%1$s, $1)', t) using snap -> t::text;
      end if;
    end if;
  end loop;
  perform set_config('sce.restoring', 'off', true);
  perform public.sce_tcsk_write_audit('KHÔI PHỤC SAO LƯU', format('Khôi phục từ bản #%s', sce_tcsk_restore_backup.id), null, 'backup', sce_tcsk_restore_backup.id::text);
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.sce_tcsk_create_backup(text, text)', 'public.sce_tcsk_restore_backup(bigint)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
