-- 202611041000_core_admin_functions.sql
-- The SQL functions behind the core commands the Db interface cannot express:
-- the settings singleton, holidays, profiles, backups and audit rows have no
-- version/created_* managed columns, so ctx.db.table() cannot address them.
-- Writes run as the caller (security invoker), so the RLS policies and column
-- grants of 0001 decide, exactly as for a direct write; each function re-checks
-- the permission first so a refusal says "forbidden", not "0 rows". The
-- command pipeline writes their audit rows. Only sce_tcsk_backup_data reads a
-- column the caller has no grant on, so it is security definer and audits itself.
-- Idempotent: create or replace, grants re-applied.

-- ---------------------------------------------------------------------------
-- Settings: typed patch with an optimistic version guard (core B12, B15, B39).
-- Returns the new row, or null when the version moved on (the caller reports
-- a conflict). Unknown keys are refused, so a patch cannot touch other columns.
-- ---------------------------------------------------------------------------
create or replace function public.sce_tcsk_update_settings(expected_version integer, patch jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  unknown_key text;
  updated jsonb;
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

  update public.sce_tcsk_system_settings s set
    agency_name = case when patch ? 'agency_name' then nullif(trim(patch ->> 'agency_name'), '') else s.agency_name end,
    agency_short_name = case when patch ? 'agency_short_name' then nullif(trim(patch ->> 'agency_short_name'), '') else s.agency_short_name end,
    parent_agency = case when patch ? 'parent_agency' then nullif(trim(patch ->> 'parent_agency'), '') else s.parent_agency end,
    daily_report_threshold_days = case when patch ? 'daily_report_threshold_days' then (patch ->> 'daily_report_threshold_days')::smallint else s.daily_report_threshold_days end,
    field_presence_hours = case when patch ? 'field_presence_hours' then (patch ->> 'field_presence_hours')::smallint else s.field_presence_hours end,
    guest_quota_percent = case when patch ? 'guest_quota_percent' then (patch ->> 'guest_quota_percent')::smallint else s.guest_quota_percent end,
    badge_quota_percent = case when patch ? 'badge_quota_percent' then (patch ->> 'badge_quota_percent')::smallint else s.badge_quota_percent end,
    google_client_id = case when patch ? 'google_client_id' then nullif(trim(patch ->> 'google_client_id'), '') else s.google_client_id end
  where s.id = 1 and s.version = expected_version
  returning to_jsonb(s.*) into updated;
  return updated;
end $$;

-- ---------------------------------------------------------------------------
-- Holidays: replace one calendar year in one statement-level transaction.
-- Running it twice with the same list leaves the same rows (core Q12).
-- ---------------------------------------------------------------------------
create or replace function public.sce_tcsk_replace_holidays(year integer, holidays jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  first_day date;
  n integer;
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

  delete from public.sce_tcsk_holidays d
   where d.holiday_date >= first_day and d.holiday_date < (first_day + interval '1 year')::date;
  insert into public.sce_tcsk_holidays (holiday_date, name, kind, updated_by)
  select (h ->> 'date')::date, left(trim(h ->> 'name'), 120), coalesce(h ->> 'kind', 'holiday'), auth.uid()
    from jsonb_array_elements(holidays) h;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles: the caller's own display name (the only column a user may write),
-- and the users list as the caller's RLS shows it (dept_leader: own department).
-- ---------------------------------------------------------------------------
create or replace function public.sce_tcsk_update_profile_name(new_fullname text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  clean text := trim(regexp_replace(coalesce(new_fullname, ''), '\s+', ' ', 'g'));
  updated jsonb;
begin
  if tcsk.actor_role() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if clean = '' or length(clean) > 120 then
    raise exception 'invalid_fullname' using errcode = '22023';
  end if;
  update public.sce_tcsk_profiles p set fullname = clean where p.id = auth.uid()
  returning to_jsonb(p.*) into updated;
  if updated is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return updated;
end $$;

create or replace function public.sce_tcsk_list_profiles() returns setof public.sce_tcsk_profiles
language sql stable security invoker set search_path = '' as $$
  select * from public.sce_tcsk_profiles order by created_at desc, email
$$;

-- ---------------------------------------------------------------------------
-- Backups: the list (metadata columns only, as granted in 0001) and the
-- download of one snapshot, which reads the data column and so audits itself.
-- ---------------------------------------------------------------------------
create or replace function public.sce_tcsk_list_backups(lim integer default 50)
returns table (id bigint, note text, kind text, format smallint, created_by_email text, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select b.id, b.note, b.kind, b.format, b.created_by_email, b.created_at
    from public.sce_tcsk_backups b
   order by b.created_at desc, b.id desc
   limit least(greatest(coalesce(lim, 50), 1), 200)
$$;

create or replace function public.sce_tcsk_backup_data(id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  snapshot jsonb;
begin
  if not tcsk.has_perm('core.backups.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select b.data into snapshot from public.sce_tcsk_backups b where b.id = sce_tcsk_backup_data.id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform public.sce_tcsk_write_audit('TẢI BẢN SAO LƯU', format('Tải bản sao lưu #%s', sce_tcsk_backup_data.id), null, 'backup', sce_tcsk_backup_data.id::text);
  return snapshot;
end $$;

-- ---------------------------------------------------------------------------
-- Audit: read-only, newest first, keyset-paged on id. Dates are VN calendar
-- days. RLS (core.audit.read) decides whether the caller sees any row.
-- ---------------------------------------------------------------------------
create or replace function public.sce_tcsk_list_audit(
  before_id bigint default null, lim integer default 50, filter_action text default null, filter_entity text default null,
  filter_actor text default null, filter_event uuid default null, from_date date default null, to_date date default null
)
returns table (id bigint, created_at timestamptz, actor_email text, action text, summary text, event_id uuid, entity text, entity_id text)
language sql stable security invoker set search_path = '' as $$
  select a.id, a.created_at, a.actor_email, a.action, a.summary, a.event_id, a.entity, a.entity_id
    from public.sce_tcsk_audit_logs a
   where (before_id is null or a.id < before_id)
     and (filter_action is null or a.action = filter_action)
     and (filter_entity is null or a.entity = filter_entity)
     and (filter_actor is null
          or a.actor_email ilike '%' || replace(replace(replace(filter_actor, '\', '\\'), '%', '\%'), '_', '\_') || '%')
     and (filter_event is null or a.event_id = filter_event)
     and (from_date is null or (a.created_at at time zone 'Asia/Ho_Chi_Minh')::date >= from_date)
     and (to_date is null or (a.created_at at time zone 'Asia/Ho_Chi_Minh')::date <= to_date)
   order by a.id desc
   limit least(greatest(coalesce(lim, 50), 1), 201)
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.sce_tcsk_update_settings(integer, jsonb)',
    'public.sce_tcsk_replace_holidays(integer, jsonb)',
    'public.sce_tcsk_update_profile_name(text)',
    'public.sce_tcsk_list_profiles()',
    'public.sce_tcsk_list_backups(integer)',
    'public.sce_tcsk_backup_data(bigint)',
    'public.sce_tcsk_list_audit(bigint, integer, text, text, text, uuid, date, date)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
