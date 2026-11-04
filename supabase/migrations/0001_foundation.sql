-- 0001_foundation.sql
-- Core reference tables, profile hardening, permission helpers, the table
-- registration helper every domain table uses, and lock-down of the legacy
-- tables. Idempotent: safe to run on a fresh project or on the deployed one
-- whose exact schema is unknown (core Q9). Run as the postgres role.

create schema if not exists tcsk;
revoke all on schema tcsk from public;
grant usage on schema tcsk to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Reference: departments
-- ---------------------------------------------------------------------------
create table if not exists public.sce_tcsk_departments (
  name text primary key,
  code text not null unique check (code in ('HCTC','PTDN','XTDT','TVDN','BGD')),
  short_name text not null,
  duty text not null default '',
  self_registerable boolean not null,
  can_chair_events boolean not null,
  sort smallint not null
);
comment on table public.sce_tcsk_departments is 'sce:owner=core';

insert into public.sce_tcsk_departments (name, code, short_name, duty, self_registerable, can_chair_events, sort) values
  ('Phòng Hành chính - Tổ chức',    'HCTC', 'P. Hành chính - Tổ chức',    'Hậu cần, xe VIP, tài liệu & con dấu',          true,  true,  1),
  ('Phòng Phát triển doanh nghiệp', 'PTDN', 'P. Phát triển doanh nghiệp', 'Mời DN, kết nối giao thương & gian hàng',      true,  true,  2),
  ('Phòng Xúc tiến đầu tư',         'XTDT', 'P. Xúc tiến đầu tư',         'Chủ trì sự kiện đầu tư, đón tiếp VIP, MOU',    true,  true,  3),
  ('Phòng Tư vấn doanh nghiệp',     'TVDN', 'P. Tư vấn doanh nghiệp',     'Tọa đàm, hỗ trợ pháp lý & đối thoại',          true,  true,  4),
  ('Ban Giám đốc',                  'BGD',  'Ban Giám đốc',               'Xem và chỉ đạo toàn bộ các sự kiện',           false, false, 5)
on conflict (name) do update set
  code = excluded.code, short_name = excluded.short_name, duty = excluded.duty,
  self_registerable = excluded.self_registerable, can_chair_events = excluded.can_chair_events, sort = excluded.sort;

-- ---------------------------------------------------------------------------
-- Profiles: created if missing, else extended. status replaces the overloaded
-- is_active (core Q2). Role/department/status change only through the
-- sce_tcsk_set_profile_* functions in 0003.
-- ---------------------------------------------------------------------------
create table if not exists public.sce_tcsk_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  fullname text not null,
  role text not null default 'user',
  department text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.sce_tcsk_profiles add column if not exists status text;
alter table public.sce_tcsk_profiles alter column department drop not null;
alter table public.sce_tcsk_profiles alter column department drop default;
alter table public.sce_tcsk_profiles alter column is_active set default false;

update public.sce_tcsk_profiles
   set status = case when is_active then 'active' else 'pending' end
 where status is null;
update public.sce_tcsk_profiles
   set department = null
 where department is not null
   and department not in (select name from public.sce_tcsk_departments);

alter table public.sce_tcsk_profiles alter column status set default 'pending';
alter table public.sce_tcsk_profiles alter column status set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sce_tcsk_profiles_status_check') then
    alter table public.sce_tcsk_profiles add constraint sce_tcsk_profiles_status_check check (status in ('pending','active','locked'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sce_tcsk_profiles_role_check2') then
    alter table public.sce_tcsk_profiles add constraint sce_tcsk_profiles_role_check2 check (role in ('admin','leader','dept_leader','user'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sce_tcsk_profiles_department_fk') then
    alter table public.sce_tcsk_profiles add constraint sce_tcsk_profiles_department_fk
      foreign key (department) references public.sce_tcsk_departments(name) on update cascade;
  end if;
end $$;
comment on table public.sce_tcsk_profiles is 'sce:owner=core';

-- Legacy is_active follows status, so the legacy app (until cutover) and the
-- new app agree. Remove after the legacy app is retired.
create or replace function tcsk.profiles_sync_is_active() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.is_active := (new.status = 'active');
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists sce_tcsk_profiles_sync on public.sce_tcsk_profiles;
create trigger sce_tcsk_profiles_sync before insert or update on public.sce_tcsk_profiles
  for each row execute function tcsk.profiles_sync_is_active();

-- New auth user -> pending profile with role 'user'. Metadata is used only for
-- the display name and a self-registerable department; never for role (core B1/B2).
create or replace function tcsk.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.sce_tcsk_profiles (id, email, fullname, role, department, status)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'fullname'), ''),
             nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
             split_part(new.email, '@', 1)),
    'user',
    (select d.name from public.sce_tcsk_departments d
      where d.name = new.raw_user_meta_data ->> 'department' and d.self_registerable),
    'pending')
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists sce_tcsk_on_auth_user_created on auth.users;
create trigger sce_tcsk_on_auth_user_created after insert on auth.users
  for each row execute function tcsk.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- System settings (singleton), holidays, permission matrix
-- ---------------------------------------------------------------------------
create table if not exists public.sce_tcsk_system_settings (
  id smallint primary key default 1 check (id = 1),
  agency_name text not null default 'TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP HÀ NỘI',
  agency_short_name text not null default 'SCE',
  parent_agency text not null default 'SỞ TÀI CHÍNH HÀ NỘI',
  daily_report_threshold_days smallint not null default 10 check (daily_report_threshold_days between 1 and 30),
  field_presence_hours smallint not null default 2 check (field_presence_hours between 1 and 5),
  guest_quota_percent smallint not null default 130 check (guest_quota_percent between 100 and 200),
  badge_quota_percent smallint not null default 120 check (badge_quota_percent between 100 and 200),
  google_client_id text,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
comment on table public.sce_tcsk_system_settings is 'sce:owner=core';
insert into public.sce_tcsk_system_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.sce_tcsk_holidays (
  holiday_date date primary key,
  name text not null,
  kind text not null default 'holiday' check (kind in ('holiday','compensatory_workday')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
comment on table public.sce_tcsk_holidays is 'sce:owner=core';

-- Generated content lives in 0004_permissions_seed.sql.
create table if not exists public.sce_tcsk_role_permissions (
  permission text not null,
  role text not null check (role in ('admin','leader','dept_leader','user')),
  grant_level text not null check (grant_level in ('all','department','none')),
  scope text not null check (scope in ('event','global')),
  requires_aal2 boolean not null default false,
  primary key (permission, role)
);
comment on table public.sce_tcsk_role_permissions is 'sce:owner=core';

-- ---------------------------------------------------------------------------
-- Actor helpers. security definer so RLS policies can read profiles and
-- auth.mfa_factors without recursive policy evaluation.
-- ---------------------------------------------------------------------------
create or replace function tcsk.actor_role() returns text
language sql stable security definer set search_path = '' as $$
  select p.role from public.sce_tcsk_profiles p where p.id = auth.uid() and p.status = 'active'
$$;

create or replace function tcsk.actor_department() returns text
language sql stable security definer set search_path = '' as $$
  select p.department from public.sce_tcsk_profiles p where p.id = auth.uid() and p.status = 'active'
$$;

-- AAL2 when the user has a verified TOTP factor or holds a role that requires
-- one (admin, leader); AAL1 is enough otherwise (core §3.3, Q3 default).
create or replace function tcsk.aal_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' then true
    when exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified') then false
    when exists (select 1 from public.sce_tcsk_profiles p where p.id = auth.uid() and p.role in ('admin','leader')) then false
    else true
  end
$$;

create or replace function tcsk.grant_for(perm text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
             when rp.requires_aal2 and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then 'none'
             else rp.grant_level
           end
      from public.sce_tcsk_role_permissions rp
     where rp.permission = perm and rp.role = tcsk.actor_role()
  ), 'none')
$$;

-- Global permission: granted to 'all' for the actor's role.
create or replace function tcsk.has_perm(perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select tcsk.aal_ok() and tcsk.grant_for(perm) = 'all'
$$;

-- Department-scoped check against explicit department values (event row
-- values in event policies, so WITH CHECK sees the new row).
create or replace function tcsk.can_on_departments(perm text, lead text, supporting text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select tcsk.aal_ok() and case tcsk.grant_for(perm)
    when 'all' then true
    when 'department' then tcsk.actor_department() is not null
                       and (tcsk.actor_department() = lead or tcsk.actor_department() = any(coalesce(supporting, '{}')))
    else false
  end
$$;

-- ---------------------------------------------------------------------------
-- Managed columns: version, created_*, updated_*. Restore keeps stored values.
-- ---------------------------------------------------------------------------
create or replace function tcsk.stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('sce.restoring', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := case when auth.uid() is null then coalesce(new.created_at, now()) else now() end;
    new.updated_by := new.created_by;
    new.updated_at := new.created_at;
  else
    if (to_jsonb(new) ->> 'event_id') is distinct from (to_jsonb(old) ->> 'event_id') then
      raise exception 'event_id is immutable' using errcode = '23514';
    end if;
    new.version := old.version + 1;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end $$;

-- Crockford base32 code for printed badges.
-- Uses the first bytes of a v4 uuid (fully random), so no pgcrypto dependency; len <= 6.
create or replace function tcsk.random_code(len int) returns text
language sql volatile set search_path = '' as $$
  select string_agg(substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', 1 + (get_byte(r.b, i) % 32), 1), '' order by i)
    from (select uuid_send(gen_random_uuid()) as b) r, generate_series(0, least(len, 6) - 1) as i
$$;

-- ---------------------------------------------------------------------------
-- Table registration: the one way a domain table gets its owner comment,
-- managed-column trigger, RLS policies and (optionally) realtime.
-- event scope: policies check tcsk.has_event_perm(perm, event_id) (0002).
-- global scope: policies check tcsk.has_perm(perm).
-- ---------------------------------------------------------------------------
create or replace function tcsk.register_table(
  tbl regclass, owner text, scope text, read_perm text, write_perm text,
  immutable boolean default false, realtime boolean default false
) returns void
language plpgsql set search_path = '' as $$
declare
  read_expr text;
  write_expr text;
begin
  if scope = 'event' then
    read_expr := format('tcsk.has_event_perm(%L, event_id)', read_perm);
    write_expr := format('tcsk.has_event_perm(%L, event_id)', write_perm);
  elsif scope = 'global' then
    read_expr := format('tcsk.has_perm(%L)', read_perm);
    write_expr := format('tcsk.has_perm(%L)', write_perm);
  else
    raise exception 'unknown scope %', scope;
  end if;

  execute format('comment on table %s is %L', tbl, 'sce:owner=' || owner);
  execute format('drop trigger if exists sce_tcsk_stamp on %s', tbl);
  execute format('create trigger sce_tcsk_stamp before insert or update on %s for each row execute function tcsk.stamp()', tbl);

  execute format('alter table %s enable row level security', tbl);
  execute format('revoke all on %s from anon', tbl);
  execute format('grant select, insert, update, delete on %s to authenticated', tbl);
  execute format('drop policy if exists sce_read on %s', tbl);
  execute format('drop policy if exists sce_insert on %s', tbl);
  execute format('drop policy if exists sce_update on %s', tbl);
  execute format('drop policy if exists sce_delete on %s', tbl);
  execute format('create policy sce_read on %s for select to authenticated using (%s)', tbl, read_expr);
  execute format('create policy sce_insert on %s for insert to authenticated with check (%s)', tbl, write_expr);
  if not immutable then
    execute format('create policy sce_update on %s for update to authenticated using (%s) with check (%s)', tbl, write_expr, write_expr);
    execute format('create policy sce_delete on %s for delete to authenticated using (%s)', tbl, write_expr);
  end if;

  if realtime and exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime'
                        and format('%I.%I', schemaname, tablename)::regclass = tbl) then
    execute format('alter publication supabase_realtime add table %s', tbl);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Legacy tables: keep data, drop every existing (unknown, permissive) policy,
-- recreate locked-down ones. No anon access anywhere (core B5).
-- ---------------------------------------------------------------------------
create table if not exists public.sce_tcsk_app_data (
  id int primary key default 1 check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_by_email text
);
alter table public.sce_tcsk_app_data add column if not exists migrated_at timestamptz;
comment on table public.sce_tcsk_app_data is 'sce:owner=core;legacy';

create table if not exists public.sce_tcsk_backups (
  id bigint generated by default as identity primary key,
  data jsonb not null,
  note text default 'Bản sao lưu dữ liệu sự kiện',
  created_by uuid references auth.users(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now()
);
alter table public.sce_tcsk_backups add column if not exists kind text;
alter table public.sce_tcsk_backups add column if not exists format smallint;
update public.sce_tcsk_backups set kind = 'auto', format = 1 where kind is null;
alter table public.sce_tcsk_backups alter column kind set default 'manual';
alter table public.sce_tcsk_backups alter column kind set not null;
alter table public.sce_tcsk_backups alter column format set default 2;
alter table public.sce_tcsk_backups alter column format set not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sce_tcsk_backups_kind_check') then
    alter table public.sce_tcsk_backups add constraint sce_tcsk_backups_kind_check check (kind in ('manual','auto','pre_migration'));
  end if;
end $$;
create unique index if not exists sce_tcsk_backups_one_auto_per_day
  on public.sce_tcsk_backups (((created_at at time zone 'Asia/Ho_Chi_Minh')::date))
  where kind = 'auto' and format = 2;
comment on table public.sce_tcsk_backups is 'sce:owner=core';

create table if not exists public.sce_tcsk_audit_logs (
  id bigint generated by default as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  summary text,
  created_at timestamptz not null default now()
);
alter table public.sce_tcsk_audit_logs add column if not exists event_id uuid;
alter table public.sce_tcsk_audit_logs add column if not exists entity text;
alter table public.sce_tcsk_audit_logs add column if not exists entity_id text;
create index if not exists sce_tcsk_audit_logs_created_idx on public.sce_tcsk_audit_logs (created_at desc);
create index if not exists sce_tcsk_audit_logs_event_idx on public.sce_tcsk_audit_logs (event_id, created_at desc);
comment on table public.sce_tcsk_audit_logs is 'sce:owner=core';

do $$
declare
  t text;
  p record;
begin
  foreach t in array array['sce_tcsk_profiles','sce_tcsk_app_data','sce_tcsk_backups','sce_tcsk_audit_logs',
                           'sce_tcsk_departments','sce_tcsk_system_settings','sce_tcsk_holidays','sce_tcsk_role_permissions'] loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- profiles: read self; read others per core.users.read (dept_leader: own department).
-- Direct UPDATE only of fullname on the caller's own row.
grant select on public.sce_tcsk_profiles to authenticated;
grant update (fullname) on public.sce_tcsk_profiles to authenticated;
create policy sce_read on public.sce_tcsk_profiles for select to authenticated using (
  id = auth.uid()
  or (tcsk.aal_ok() and (tcsk.grant_for('core.users.read') = 'all'
      or (tcsk.grant_for('core.users.read') = 'department' and department = tcsk.actor_department())))
);
create policy sce_update_self on public.sce_tcsk_profiles for update to authenticated
  using (id = auth.uid() and status = 'active') with check (id = auth.uid());

-- Reference data: readable by active users; written by admin functions or migrations.
grant select on public.sce_tcsk_departments, public.sce_tcsk_system_settings, public.sce_tcsk_holidays, public.sce_tcsk_role_permissions to authenticated;
create policy sce_read on public.sce_tcsk_departments for select to authenticated using (true);
create policy sce_read on public.sce_tcsk_role_permissions for select to authenticated using (tcsk.actor_role() is not null);
create policy sce_read on public.sce_tcsk_system_settings for select to authenticated using (tcsk.actor_role() is not null);
grant update (agency_name, agency_short_name, parent_agency, daily_report_threshold_days, field_presence_hours,
              guest_quota_percent, badge_quota_percent, google_client_id) on public.sce_tcsk_system_settings to authenticated;
create policy sce_update on public.sce_tcsk_system_settings for update to authenticated
  using (tcsk.has_perm('core.settings.edit')) with check (tcsk.has_perm('core.settings.edit'));
create policy sce_read on public.sce_tcsk_holidays for select to authenticated using (tcsk.actor_role() is not null);
grant insert, update, delete on public.sce_tcsk_holidays to authenticated;
create policy sce_write on public.sce_tcsk_holidays for all to authenticated
  using (tcsk.has_perm('core.holidays.edit')) with check (tcsk.has_perm('core.holidays.edit'));

drop trigger if exists sce_tcsk_settings_version on public.sce_tcsk_system_settings;
create or replace function tcsk.settings_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger sce_tcsk_settings_version before update on public.sce_tcsk_system_settings
  for each row execute function tcsk.settings_version();

-- Legacy blob: read-only, admin only, kept as the migration source and as a backup.
grant select on public.sce_tcsk_app_data to authenticated;
create policy sce_read on public.sce_tcsk_app_data for select to authenticated using (tcsk.has_perm('core.backups.restore'));

-- Backups: list for core.backups.create; rows are written only by functions in 0003.
grant select (id, note, kind, format, created_by_email, created_at) on public.sce_tcsk_backups to authenticated;
create policy sce_read on public.sce_tcsk_backups for select to authenticated using (tcsk.has_perm('core.backups.create'));

-- Audit: append-only. Read for core.audit.read; insert only via sce_tcsk_write_audit (0003).
grant select on public.sce_tcsk_audit_logs to authenticated;
create policy sce_read on public.sce_tcsk_audit_logs for select to authenticated using (tcsk.has_perm('core.audit.read'));
