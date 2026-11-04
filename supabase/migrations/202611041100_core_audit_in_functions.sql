-- 202611041100_core_audit_in_functions.sql
-- Every core change writes its one audit row inside the function that makes
-- it, so calling the function directly cannot skip the log, and the command
-- pipeline adds no second row. Nobody writes a row by hand: the raw writer
-- runs only inside owner-rights functions and for the service role, and the
-- other features' command audits go through sce_tcsk_audit_command, which
-- checks the caller holds the command's permission and refuses core actions.
-- Settings, holidays and the profile name lose their direct table grants, so
-- their functions (now owner rights, permission checked first) are the only
-- write path. Backups, manual or auto, need core.backups.create.
-- Summaries use the screens' labels: ROLES (src/core/vocab.ts), SETTINGS_FIELDS
-- and HOLIDAY_KIND_LABELS (src/features/core/domain); a core test compares them.
-- Idempotent: create or replace, grants re-applied after 0001/0003 re-grant.

-- ---------------------------------------------------------------------------
-- Writers
-- ---------------------------------------------------------------------------
create or replace function public.sce_tcsk_write_audit(
  action text, summary text, event_id uuid default null, entity text default null, entity_id text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and tcsk.actor_role() is null then
    raise exception 'inactive actor' using errcode = '42501';
  end if;
  insert into public.sce_tcsk_audit_logs (actor_id, actor_email, action, summary, event_id, entity, entity_id)
  values (auth.uid(), (select p.email from public.sce_tcsk_profiles p where p.id = auth.uid()),
          left(action, 120), left(summary, 2000), event_id, entity, entity_id);
end $$;
revoke all on function public.sce_tcsk_write_audit(text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.sce_tcsk_write_audit(text, text, uuid, text, text) to service_role;

-- The audit row of a command of another feature, written as its caller. The
-- caller must hold `perm` (on the event's departments when there is one), and
-- cannot claim a core action or entity: those rows come only from core functions.
create or replace function public.sce_tcsk_audit_command(
  perm text, action text, summary text, event_id uuid default null, entity text default null, entity_id text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  ev record;
  allowed boolean;
begin
  if perm like 'core.%'
     or entity in ('profile', 'backup', 'settings', 'holidays')
     or action in ('CẬP NHẬT THAM SỐ HỆ THỐNG', 'CẬP NHẬT NGÀY NGHỈ LỄ', 'CẬP NHẬT HỒ SƠ', 'PHÂN QUYỀN TÀI KHOẢN',
                   'CHUYỂN PHÒNG BAN', 'DUYỆT/MỞ KHÓA TÀI KHOẢN', 'KHÓA TÀI KHOẢN', 'TẠO TÀI KHOẢN', 'TẠO BẢN SAO LƯU',
                   'KHÔI PHỤC SAO LƯU', 'TẢI BẢN SAO LƯU', 'KHỞI TẠO QUẢN TRỊ VIÊN') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if sce_tcsk_audit_command.event_id is null then
    allowed := tcsk.aal_ok() and tcsk.grant_for(perm) <> 'none';
  else
    select e.department, e.supporting_departments into ev from public.sce_tcsk_events e where e.id = sce_tcsk_audit_command.event_id;
    -- A purged event has no departments left to check against.
    allowed := case when found then tcsk.can_on_departments(perm, ev.department, ev.supporting_departments) else tcsk.has_perm(perm) end;
  end if;
  if not coalesce(allowed, false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public.sce_tcsk_write_audit(action, summary, event_id, entity, entity_id);
end $$;

-- ---------------------------------------------------------------------------
-- Labels and the holiday difference, for the summaries.
-- ---------------------------------------------------------------------------
create or replace function tcsk.role_label(role text) returns text
language sql immutable set search_path = '' as $$
  select case role when 'admin' then 'Quản trị viên (Admin)' when 'leader' then 'Ban Giám đốc'
                   when 'dept_leader' then 'Lãnh đạo Phòng' when 'user' then 'Chuyên viên' else role end
$$;

-- 'thêm 06/02/2027 Tết Nguyên đán, 20/02/2027 Làm bù (ngày làm bù); bỏ …', or 'không thay đổi'.
create or replace function tcsk.holiday_diff(previous jsonb, next jsonb) returns text
language sql immutable set search_path = '' as $$
  with p as (select (h ->> 'date')::date as d, h ->> 'name' as n, h ->> 'kind' as k from jsonb_array_elements(previous) h),
       x as (select (h ->> 'date')::date as d, h ->> 'name' as n, h ->> 'kind' as k from jsonb_array_elements(next) h),
       changed as (
         select 'add' as dir, a.* from (select * from x except select * from p) a
         union all
         select 'drop', r.* from (select * from p except select * from x) r),
       lines as (
         select dir, string_agg(to_char(d, 'DD/MM/YYYY') || ' ' || n || case k when 'holiday' then '' else ' (ngày làm bù)' end, ', ' order by d) as t
           from changed group by dir)
  select coalesce(nullif(concat_ws('; ', 'thêm ' || (select t from lines where dir = 'add'), 'bỏ ' || (select t from lines where dir = 'drop')), ''),
                  'không thay đổi')
$$;

-- ---------------------------------------------------------------------------
-- Settings, holidays and the profile name: owner rights, permission first,
-- one audit row. Their tables are no longer writable directly (end of file).
-- ---------------------------------------------------------------------------
create or replace function public.sce_tcsk_update_settings(expected_version integer, patch jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  unknown_key text;
  old public.sce_tcsk_system_settings;
  new public.sce_tcsk_system_settings;
  changes text;
begin
  if not tcsk.has_perm('core.settings.edit') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if patch is null or jsonb_typeof(patch) <> 'object' then
    raise exception 'invalid_patch' using errcode = '22023';
  end if;
  select k into unknown_key from jsonb_object_keys(patch) as k
   where k <> all (array['agency_name','agency_short_name','parent_agency','daily_report_threshold_days',
                         'field_presence_hours','guest_quota_percent','badge_quota_percent','google_client_id'])
   limit 1;
  if unknown_key is not null then
    raise exception 'unknown_setting %', unknown_key using errcode = '22023';
  end if;

  select * into old from public.sce_tcsk_system_settings s where s.id = 1 and s.version = expected_version for update;
  if not found then
    return null;
  end if;
  update public.sce_tcsk_system_settings s set
    agency_name = case when patch ? 'agency_name' then nullif(trim(patch ->> 'agency_name'), '') else s.agency_name end,
    agency_short_name = case when patch ? 'agency_short_name' then nullif(trim(patch ->> 'agency_short_name'), '') else s.agency_short_name end,
    parent_agency = case when patch ? 'parent_agency' then nullif(trim(patch ->> 'parent_agency'), '') else s.parent_agency end,
    daily_report_threshold_days = case when patch ? 'daily_report_threshold_days' then (patch ->> 'daily_report_threshold_days')::smallint else s.daily_report_threshold_days end,
    field_presence_hours = case when patch ? 'field_presence_hours' then (patch ->> 'field_presence_hours')::smallint else s.field_presence_hours end,
    guest_quota_percent = case when patch ? 'guest_quota_percent' then (patch ->> 'guest_quota_percent')::smallint else s.guest_quota_percent end,
    badge_quota_percent = case when patch ? 'badge_quota_percent' then (patch ->> 'badge_quota_percent')::smallint else s.badge_quota_percent end,
    google_client_id = case when patch ? 'google_client_id' then nullif(trim(patch ->> 'google_client_id'), '') else s.google_client_id end
  where s.id = 1
  returning * into new;

  select string_agg(format('%s: %s → %s', f.label, coalesce(f.before, '(trống)') || f.unit, coalesce(f.after, '(trống)') || f.unit), '; ' order by f.ord)
    into changes
    from (values
      (1, 'Đơn vị chủ quản (cấp trên)', old.parent_agency, new.parent_agency, ''),
      (2, 'Đơn vị tổ chức sự kiện', old.agency_name, new.agency_name, ''),
      (3, 'Tên viết tắt', old.agency_short_name, new.agency_short_name, ''),
      (4, 'Ngưỡng kích hoạt báo cáo hàng ngày', old.daily_report_threshold_days::text, new.daily_report_threshold_days::text, ''),
      (5, 'Thời gian cán bộ có mặt hiện trường', old.field_presence_hours::text, new.field_presence_hours::text, ''),
      (6, 'Tỷ lệ danh sách khách mời tối thiểu (nhóm 1a)', old.guest_quota_percent::text, new.guest_quota_percent::text, '%'),
      (7, 'Tỷ lệ in thẻ đại biểu tối thiểu (nhóm 2b)', old.badge_quota_percent::text, new.badge_quota_percent::text, '%'),
      (8, 'Google Client ID mặc định', old.google_client_id, new.google_client_id, '')
    ) as f(ord, label, before, after, unit)
   where f.before is distinct from f.after;
  perform public.sce_tcsk_write_audit('CẬP NHẬT THAM SỐ HỆ THỐNG', coalesce(changes, 'không thay đổi'), null, 'settings', '1');
  return to_jsonb(new);
end $$;

create or replace function public.sce_tcsk_replace_holidays(year integer, holidays jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  first_day date;
  previous jsonb;
  stored jsonb;
begin
  if not tcsk.has_perm('core.holidays.edit') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if sce_tcsk_replace_holidays.year is null or sce_tcsk_replace_holidays.year not between 2000 and 2100 then
    raise exception 'invalid_year' using errcode = '22023';
  end if;
  if holidays is null or jsonb_typeof(holidays) <> 'array' then
    raise exception 'invalid_holidays' using errcode = '22023';
  end if;
  first_day := make_date(sce_tcsk_replace_holidays.year, 1, 1);
  if exists (
    select 1 from jsonb_array_elements(holidays) h
     where coalesce(trim(h ->> 'name'), '') = ''
        or (h ->> 'date') is null
        or (h ->> 'date')::date < first_day
        or (h ->> 'date')::date >= (first_day + interval '1 year')::date
  ) then
    raise exception 'holiday_outside_year' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sce_holidays:' || sce_tcsk_replace_holidays.year, 0));
  previous := tcsk.holidays_of(sce_tcsk_replace_holidays.year);
  delete from public.sce_tcsk_holidays d
   where d.holiday_date >= first_day and d.holiday_date < (first_day + interval '1 year')::date;
  insert into public.sce_tcsk_holidays (holiday_date, name, kind, updated_by)
  select (h ->> 'date')::date, left(trim(h ->> 'name'), 120), coalesce(h ->> 'kind', 'holiday'), auth.uid()
    from jsonb_array_elements(holidays) h;
  stored := tcsk.holidays_of(sce_tcsk_replace_holidays.year);
  perform public.sce_tcsk_write_audit('CẬP NHẬT NGÀY NGHỈ LỄ', format('Năm %s: %s', sce_tcsk_replace_holidays.year, tcsk.holiday_diff(previous, stored)),
                                      null, 'holidays', sce_tcsk_replace_holidays.year::text);
  return previous;
end $$;

-- One year's rows as the commands see them: [{date, name, kind}] by date.
create or replace function tcsk.holidays_of(year integer) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('date', d.holiday_date, 'name', d.name, 'kind', d.kind) order by d.holiday_date), '[]')
    from public.sce_tcsk_holidays d
   where d.holiday_date >= make_date(year, 1, 1) and d.holiday_date < make_date(year + 1, 1, 1)
$$;

create or replace function public.sce_tcsk_update_profile_name(new_fullname text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  clean text := trim(regexp_replace(coalesce(new_fullname, ''), '\s+', ' ', 'g'));
  old_name text;
  updated jsonb;
begin
  if tcsk.actor_role() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if clean = '' or length(clean) > 120 then
    raise exception 'invalid_fullname' using errcode = '22023';
  end if;
  select p.fullname into old_name from public.sce_tcsk_profiles p where p.id = auth.uid() for update;
  update public.sce_tcsk_profiles p set fullname = clean where p.id = auth.uid()
  returning to_jsonb(p.*) into updated;
  if updated is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform public.sce_tcsk_write_audit('CẬP NHẬT HỒ SƠ', format('Tên hiển thị: "%s" → "%s"', old_name, clean), null, 'profile', auth.uid()::text);
  return updated;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles: the 0003 functions with readable summaries (names and labels, old → new).
-- ---------------------------------------------------------------------------
create or replace function public.sce_tcsk_set_profile_role(id uuid, role text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  old_role text;
  who text;
begin
  perform tcsk.assert_users_manage();
  select p.role, format('%s <%s>', p.fullname, p.email) into old_role, who
    from public.sce_tcsk_profiles p where p.id = sce_tcsk_set_profile_role.id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.sce_tcsk_profiles p set role = sce_tcsk_set_profile_role.role where p.id = sce_tcsk_set_profile_role.id;
  perform tcsk.assert_admin_remains();
  perform public.sce_tcsk_write_audit('PHÂN QUYỀN TÀI KHOẢN',
    format('%s: %s → %s', who, tcsk.role_label(old_role), tcsk.role_label(sce_tcsk_set_profile_role.role)), null, 'profile', sce_tcsk_set_profile_role.id::text);
end $$;

create or replace function public.sce_tcsk_set_profile_department(id uuid, department text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  old_department text;
  who text;
begin
  perform tcsk.assert_users_manage();
  select p.department, format('%s <%s>', p.fullname, p.email) into old_department, who
    from public.sce_tcsk_profiles p where p.id = sce_tcsk_set_profile_department.id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.sce_tcsk_profiles p set department = sce_tcsk_set_profile_department.department where p.id = sce_tcsk_set_profile_department.id;
  perform public.sce_tcsk_write_audit('CHUYỂN PHÒNG BAN',
    format('%s: %s → %s', who, coalesce(old_department, '(chưa có)'), sce_tcsk_set_profile_department.department), null, 'profile', sce_tcsk_set_profile_department.id::text);
end $$;

create or replace function public.sce_tcsk_set_profile_status(ids uuid[], status text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
  accounts text;
begin
  perform tcsk.assert_users_manage();
  if sce_tcsk_set_profile_status.status not in ('active','locked') then raise exception 'invalid status' using errcode = '22023'; end if;
  if sce_tcsk_set_profile_status.status = 'locked' and auth.uid() = any(ids) then raise exception 'cannot_lock_self' using errcode = '23514'; end if;
  select string_agg(format('%s %s <%s>',
           case when sce_tcsk_set_profile_status.status = 'locked' then 'Khóa' when p.status = 'pending' then 'Duyệt' else 'Mở khóa' end,
           p.fullname, p.email), '; ' order by array_position(ids, p.id))
    into accounts
    from public.sce_tcsk_profiles p where p.id = any(ids);
  update public.sce_tcsk_profiles p set status = sce_tcsk_set_profile_status.status
   where p.id = any(ids) and p.status is distinct from sce_tcsk_set_profile_status.status;
  get diagnostics n = row_count;
  perform tcsk.assert_admin_remains();
  perform public.sce_tcsk_write_audit(
    case sce_tcsk_set_profile_status.status when 'active' then 'DUYỆT/MỞ KHÓA TÀI KHOẢN' else 'KHÓA TÀI KHOẢN' end,
    coalesce(accounts, '0 tài khoản'), null, 'profile', array_to_string(ids, ','));
  return n;
end $$;

-- An account the service role just created (core.users.create): the auth
-- trigger made it a pending 'user'; this sets role and department and
-- approves it, as one change with one audit row.
create or replace function public.sce_tcsk_admit_profile(id uuid, role text, department text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  who text;
  current_status text;
begin
  perform tcsk.assert_users_manage();
  select p.status, format('%s <%s>', p.fullname, p.email) into current_status, who
    from public.sce_tcsk_profiles p where p.id = sce_tcsk_admit_profile.id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if current_status <> 'pending' then raise exception 'not_pending' using errcode = '23514'; end if;
  update public.sce_tcsk_profiles p
     set role = sce_tcsk_admit_profile.role, department = sce_tcsk_admit_profile.department, status = 'active'
   where p.id = sce_tcsk_admit_profile.id;
  perform public.sce_tcsk_write_audit('TẠO TÀI KHOẢN',
    format('%s, %s, %s', who, tcsk.role_label(sce_tcsk_admit_profile.role), sce_tcsk_admit_profile.department), null, 'profile', sce_tcsk_admit_profile.id::text);
end $$;

-- ---------------------------------------------------------------------------
-- Backups. tcsk.take_snapshot is the owner-rights snapshot with no check and
-- no audit, reachable only from the two functions below.
-- ---------------------------------------------------------------------------
create or replace function tcsk.take_snapshot(note text, kind text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  snapshot jsonb := '{}';
  t regclass;
  rows jsonb;
  new_id bigint;
begin
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
  end if;
  return new_id;
end $$;

-- null when today's auto snapshot already exists (one a day, sce_tcsk_backups_one_auto_per_day).
create or replace function public.sce_tcsk_create_backup(note text, kind text default 'manual') returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  new_id bigint;
begin
  if not tcsk.has_perm('core.backups.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if kind not in ('manual','auto') then raise exception 'invalid kind' using errcode = '22023'; end if;
  new_id := tcsk.take_snapshot(note, kind);
  if new_id is not null then
    perform public.sce_tcsk_write_audit('TẠO BẢN SAO LƯU',
      format(case kind when 'auto' then 'Bản #%s (tự động): %s' else 'Bản #%s: %s' end, new_id, coalesce(nullif(trim(note), ''), 'Sao lưu')),
      null, 'backup', new_id::text);
  end if;
  return new_id;
end $$;

-- Restore replaces every backed-up table in one transaction, after a snapshot
-- of the current data; one audit row names both backups. Admin + AAL2.
create or replace function public.sce_tcsk_restore_backup(id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  snap jsonb;
  fmt smallint;
  backup_note text;
  taken timestamptz;
  before_id bigint;
  t regclass;
begin
  if not tcsk.has_perm('core.backups.restore') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select b.data, b.format, b.note, b.created_at into snap, fmt, backup_note, taken
    from public.sce_tcsk_backups b where b.id = sce_tcsk_restore_backup.id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if fmt <> 2 then raise exception 'legacy_format' using errcode = '22023'; end if;

  before_id := tcsk.take_snapshot(format('Trước khi khôi phục #%s', sce_tcsk_restore_backup.id), 'manual');
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
  perform public.sce_tcsk_write_audit('KHÔI PHỤC SAO LƯU',
    format('Khôi phục từ bản #%s (%s): %s. Dữ liệu trước đó lưu ở bản #%s', sce_tcsk_restore_backup.id,
           to_char(taken at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY'), coalesce(backup_note, ''), before_id),
    null, 'backup', sce_tcsk_restore_backup.id::text);
end $$;

-- ---------------------------------------------------------------------------
-- Grants. Internal helpers are callable by nobody but their owner; the
-- public functions by authenticated only.
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'tcsk.role_label(text)', 'tcsk.holiday_diff(jsonb, jsonb)', 'tcsk.holidays_of(integer)', 'tcsk.take_snapshot(text, text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.sce_tcsk_audit_command(text, text, text, uuid, text, text)',
    'public.sce_tcsk_update_settings(integer, jsonb)',
    'public.sce_tcsk_replace_holidays(integer, jsonb)',
    'public.sce_tcsk_update_profile_name(text)',
    'public.sce_tcsk_set_profile_role(uuid, text)',
    'public.sce_tcsk_set_profile_department(uuid, text)',
    'public.sce_tcsk_set_profile_status(uuid[], text)',
    'public.sce_tcsk_admit_profile(uuid, text, text)',
    'public.sce_tcsk_create_backup(text, text)',
    'public.sce_tcsk_restore_backup(bigint)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

revoke insert, update, delete on public.sce_tcsk_holidays from authenticated;
revoke update on public.sce_tcsk_system_settings from authenticated;
revoke update on public.sce_tcsk_profiles from authenticated;
