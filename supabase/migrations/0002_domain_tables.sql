-- 0002_domain_tables.sql
-- Normalized domain tables. Event is the root aggregate: every event-scoped
-- table has event_id -> sce_tcsk_events ON DELETE CASCADE (deferrable, so
-- restore can reinsert in any order). Each table is registered once with
-- tcsk.register_table(), which sets its owner comment, managed-column trigger,
-- RLS policies and realtime. legacy_id keeps the old blob id for the import
-- and for scanning badges printed before cutover.

-- ---------------------------------------------------------------------------
-- progress
-- ---------------------------------------------------------------------------
create table if not exists public.sce_tcsk_events (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  name text not null check (length(trim(name)) > 0),
  type text not null check (type in ('hoi_nghi','hoi_cho')),
  event_date date not null,
  event_time time not null default '08:30',
  location text not null default '',
  department text not null references public.sce_tcsk_departments(name) on update cascade,
  supporting_departments text[] not null default '{}',
  lead_person text not null default '',
  budget_vnd bigint check (budget_vnd is null or budget_vnd >= 0),
  target_guests integer not null default 150 check (target_guests >= 0),
  status text not null default 'preparing' check (status in ('preparing','completed')),
  note text not null default '',
  deleted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create index if not exists sce_tcsk_events_date_idx on public.sce_tcsk_events (event_date);

-- Event-scoped check used by every child table's policies.
create or replace function tcsk.has_event_perm(perm text, eid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sce_tcsk_events e
     where e.id = eid
       and (e.deleted_at is null or tcsk.actor_role() = 'admin')
       and tcsk.can_on_departments(perm, e.department, e.supporting_departments)
  )
$$;

-- Events have their own policies: row values (not a lookup) so WITH CHECK
-- sees the new department; editing the event row is lead-department only;
-- soft delete needs progress.delete; hard delete is admin only.
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'sce_tcsk_events' loop
    execute format('drop policy %I on public.sce_tcsk_events', p.policyname);
  end loop;
end $$;
alter table public.sce_tcsk_events enable row level security;
revoke all on public.sce_tcsk_events from anon;
grant select, insert, update, delete on public.sce_tcsk_events to authenticated;
comment on table public.sce_tcsk_events is 'sce:owner=progress';
drop trigger if exists sce_tcsk_stamp on public.sce_tcsk_events;
create trigger sce_tcsk_stamp before insert or update on public.sce_tcsk_events
  for each row execute function tcsk.stamp();
create policy sce_read on public.sce_tcsk_events for select to authenticated using (
  (deleted_at is null or tcsk.actor_role() = 'admin')
  and tcsk.can_on_departments('progress.read', department, supporting_departments));
create policy sce_insert on public.sce_tcsk_events for insert to authenticated with check (
  deleted_at is null and tcsk.can_on_departments('progress.create', department, '{}'));
create policy sce_update on public.sce_tcsk_events for update to authenticated
  using (tcsk.can_on_departments('progress.write', department, '{}'))
  with check (tcsk.can_on_departments('progress.write', department, '{}')
              and (deleted_at is null or tcsk.can_on_departments('progress.delete', department, '{}')));
create policy sce_delete on public.sce_tcsk_events for delete to authenticated using (
  tcsk.actor_role() = 'admin' and tcsk.aal_ok());

create table if not exists public.sce_tcsk_task_groups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.sce_tcsk_events(id) on delete cascade deferrable initially immediate,
  legacy_id text,
  phase text not null check (phase in ('phase_prepare','phase_dday')),
  name text not null,
  lead_person text not null default '',
  note text not null default '',
  sort integer not null default 0,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (event_id, id)
);
select tcsk.register_table('public.sce_tcsk_task_groups', 'progress', 'event', 'progress.read', 'progress.write');

-- subtasks/links are small arrays edited with their step; validated by zod at
-- the repository boundary (urls must parse as SafeUrl).
create table if not exists public.sce_tcsk_steps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  group_id uuid not null,
  legacy_id text,
  name text not null,
  requirement text not null default '',
  offset_days integer not null default 0 check (offset_days >= 0),
  day_type text not null default 'workday' check (day_type in ('workday','calendar')),
  target_phase text not null default 'before' check (target_phase in ('before','dday','after')),
  completed_at timestamptz,
  completed_by text,
  assignee text not null default '',
  template_key text not null default '',
  sub_tasks jsonb not null default '[]' check (jsonb_typeof(sub_tasks) = 'array'),
  links jsonb not null default '[]' check (jsonb_typeof(links) = 'array'),
  sort integer not null default 0,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  foreign key (event_id) references public.sce_tcsk_events(id) on delete cascade deferrable initially immediate,
  foreign key (event_id, group_id) references public.sce_tcsk_task_groups(event_id, id) on delete cascade deferrable initially immediate
);
create index if not exists sce_tcsk_steps_group_idx on public.sce_tcsk_steps (group_id, sort);
select tcsk.register_table('public.sce_tcsk_steps', 'progress', 'event', 'progress.read', 'progress.write', realtime => true);

-- ---------------------------------------------------------------------------
-- templates (global): admin overrides of built-ins and custom templates only.
-- ---------------------------------------------------------------------------
create table if not exists public.sce_tcsk_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  base_builtin_key text,
  level text not null check (level in ('cap_ubnd','cap_stc','cap_trungtam')),
  code text not null default '',
  title text not null,
  kind text not null check (kind in ('doc','grid')),
  description text not null default '',
  content_html text not null,
  legacy_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
select tcsk.register_table('public.sce_tcsk_templates', 'templates', 'global', 'templates.read', 'templates.admin');

-- ---------------------------------------------------------------------------
-- guests
-- ---------------------------------------------------------------------------
create table if not exists public.sce_tcsk_guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.sce_tcsk_events(id) on delete cascade deferrable initially immediate,
  legacy_id text,
  name text not null check (length(trim(name)) > 0),
  guest_group text not null check (guest_group in ('VIP','SoNganh','DoanhNghiep','QuocTe','BaoChi')),
  title text not null default '',
  organization text not null default '',
  phone text not null default '',
  email text,
  send_method text not null default 'direct' check (send_method in ('direct','ems','email')),
  invite_status text not null default 'pending' check (invite_status in ('pending','sent','received')),
  rsvp_status text not null default 'pending' check (rsvp_status in ('pending','confirmed','substituted','declined')),
  rsvp_source text not null default 'manual' check (rsvp_source in ('manual','google_form','walk_in','import')),
  rsvp_at timestamptz,
  substitute_name text not null default '',
  has_banquet boolean not null default false,
  notes text not null default '',
  checkin_code text not null default tcsk.random_code(6),
  master_contact_id uuid,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (event_id, id),
  unique (event_id, checkin_code),
  unique (event_id, legacy_id)
);
select tcsk.register_table('public.sce_tcsk_guests', 'guests', 'event', 'guests.read', 'guests.write', realtime => true);

-- ---------------------------------------------------------------------------
-- venue
-- ---------------------------------------------------------------------------
create table if not exists public.sce_tcsk_hall_templates (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  name text not null,
  location text not null default '',
  description text not null default '',
  zones jsonb not null check (jsonb_typeof(zones) = 'array' and jsonb_array_length(zones) > 0),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
select tcsk.register_table('public.sce_tcsk_hall_templates', 'venue', 'global', 'venue.halls.read', 'venue.halls.admin');

create table if not exists public.sce_tcsk_event_halls (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.sce_tcsk_events(id) on delete cascade deferrable initially immediate,
  template_id uuid references public.sce_tcsk_hall_templates(id) on delete set null deferrable initially immediate,
  zones jsonb not null check (jsonb_typeof(zones) = 'array' and jsonb_array_length(zones) > 0),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
select tcsk.register_table('public.sce_tcsk_event_halls', 'venue', 'event', 'venue.seating.read', 'venue.seating.write', realtime => true);

-- The only seat <-> guest relation (m4b BUG-06).
create table if not exists public.sce_tcsk_seat_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  seat_code text not null check (seat_code ~ '^[A-Z0-9]{1,4}-[0-9]{2,3}$'),
  guest_id uuid not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (event_id, seat_code),
  unique (event_id, guest_id),
  foreign key (event_id) references public.sce_tcsk_events(id) on delete cascade deferrable initially immediate,
  foreign key (event_id, guest_id) references public.sce_tcsk_guests(event_id, id) on delete cascade deferrable initially immediate
);
select tcsk.register_table('public.sce_tcsk_seat_assignments', 'venue', 'event', 'venue.seating.read', 'venue.seating.write', realtime => true);

create table if not exists public.sce_tcsk_booths (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.sce_tcsk_events(id) on delete cascade deferrable initially immediate,
  legacy_id text,
  code text not null check (code ~ '^[A-Z]{1,2}[0-9]{2,3}$'),
  size text not null default '01 gian tiêu chuẩn (9m²)',
  company text not null default '',
  products text not null default '',
  subsidy_percent smallint not null default 50 check (subsidy_percent in (0, 50, 100)),
  status text not null default 'available' check (status in ('available','reviewing','confirmed')),
  contact text not null default '',
  staff text not null default '',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (event_id, code),
  check (status = 'available' or length(trim(company)) > 0)
);
select tcsk.register_table('public.sce_tcsk_booths', 'venue', 'event', 'venue.booths.read', 'venue.booths.write');

create table if not exists public.sce_tcsk_booth_shifts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.sce_tcsk_events(id) on delete cascade deferrable initially immediate,
  shift_date date not null,
  shift_label text not null,
  officer_name text not null,
  officer_user_id uuid references auth.users(id) on delete set null,
  department text not null references public.sce_tcsk_departments(name) on update cascade,
  phone text not null default '',
  zone text not null default '',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
select tcsk.register_table('public.sce_tcsk_booth_shifts', 'venue', 'event', 'venue.booths.read', 'venue.booths.write');

-- ---------------------------------------------------------------------------
-- directory (global)
-- ---------------------------------------------------------------------------
create table if not exists public.sce_tcsk_master_contacts (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  name text not null check (length(trim(name)) > 0),
  guest_group text not null check (guest_group in ('VIP','SoNganh','DoanhNghiep','QuocTe','BaoChi')),
  title text not null default '',
  organization text not null check (length(trim(organization)) > 0),
  phone text not null default '',
  email text,
  address text not null default '',
  tax_code text not null default '',
  notes text not null default '',
  has_banquet boolean not null default false,
  search_text text not null default '',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create index if not exists sce_tcsk_master_contacts_search_idx on public.sce_tcsk_master_contacts (search_text text_pattern_ops);
select tcsk.register_table('public.sce_tcsk_master_contacts', 'directory', 'global', 'directory.read', 'directory.admin');

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sce_tcsk_guests_master_fk') then
    alter table public.sce_tcsk_guests add constraint sce_tcsk_guests_master_fk
      foreign key (master_contact_id) references public.sce_tcsk_master_contacts(id) on delete set null deferrable initially immediate;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- comms
-- ---------------------------------------------------------------------------
create table if not exists public.sce_tcsk_sender_mailboxes (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  display_name text not null,
  email text not null unique,
  client_id text,
  is_default boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create unique index if not exists sce_tcsk_sender_mailboxes_one_default on public.sce_tcsk_sender_mailboxes ((true)) where is_default;
select tcsk.register_table('public.sce_tcsk_sender_mailboxes', 'comms', 'global', 'comms.mailboxes.read', 'comms.mailboxes.admin');

create table if not exists public.sce_tcsk_rsvp_forms (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.sce_tcsk_events(id) on delete cascade deferrable initially immediate,
  form_url text check (form_url is null or form_url ~* '^https://'),
  sheet_csv_url text check (sheet_csv_url is null or sheet_csv_url ~* '^https://'),
  auto_sync boolean not null default false,
  auto_add_new_guests boolean not null default true,
  column_map jsonb,
  last_sync_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
select tcsk.register_table('public.sce_tcsk_rsvp_forms', 'comms', 'event', 'comms.read', 'comms.rsvp.manage');

create table if not exists public.sce_tcsk_rsvp_responses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.sce_tcsk_events(id) on delete cascade deferrable initially immediate,
  row_hash text not null,
  responded_at timestamptz not null,
  name text not null default '',
  organization text not null default '',
  email text,
  phone text not null default '',
  rsvp text check (rsvp is null or rsvp in ('pending','confirmed','substituted','declined')),
  has_banquet boolean,
  substitute text not null default '',
  raw jsonb not null,
  matched_guest_id uuid references public.sce_tcsk_guests(id) on delete set null deferrable initially immediate,
  match text not null default 'none' check (match in ('email','phone','name','created','ambiguous','none')),
  applied_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (event_id, row_hash)
);
select tcsk.register_table('public.sce_tcsk_rsvp_responses', 'comms', 'event', 'comms.read', 'comms.rsvp.manage');

create table if not exists public.sce_tcsk_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.sce_tcsk_events(id) on delete cascade deferrable initially immediate,
  campaign_id uuid not null,
  guest_id uuid references public.sce_tcsk_guests(id) on delete set null deferrable initially immediate,
  email text not null,
  subject text not null default '',
  sender_email text not null default '',
  status text not null default 'queued' check (status in ('queued','sent','error')),
  sent_at timestamptz,
  error text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (campaign_id, email)
);
select tcsk.register_table('public.sce_tcsk_email_deliveries', 'comms', 'event', 'comms.read', 'comms.send');

-- ---------------------------------------------------------------------------
-- live
-- ---------------------------------------------------------------------------
create table if not exists public.sce_tcsk_checkins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  guest_id uuid not null,
  checked_in_at timestamptz,
  checked_in_by uuid references auth.users(id) on delete set null,
  desk text,
  gift_given_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (event_id, guest_id),
  foreign key (event_id) references public.sce_tcsk_events(id) on delete cascade deferrable initially immediate,
  foreign key (event_id, guest_id) references public.sce_tcsk_guests(event_id, id) on delete cascade deferrable initially immediate
);
select tcsk.register_table('public.sce_tcsk_checkins', 'live', 'event', 'live.read', 'live.checkin', realtime => true);

create table if not exists public.sce_tcsk_duty_staff (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.sce_tcsk_events(id) on delete cascade deferrable initially immediate,
  legacy_id text,
  name text not null,
  user_id uuid references auth.users(id) on delete set null,
  department text not null references public.sce_tcsk_departments(name) on update cascade,
  desk smallint not null check (desk between 1 and 4),
  role_label text not null default '',
  checked_in_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
select tcsk.register_table('public.sce_tcsk_duty_staff', 'live', 'event', 'live.read', 'live.manage', realtime => true);

create table if not exists public.sce_tcsk_incidents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.sce_tcsk_events(id) on delete cascade deferrable initially immediate,
  legacy_id text,
  seq integer not null,
  location text not null,
  description text not null,
  urgency text not null check (urgency in ('high','medium','low')),
  assignee text not null default 'Tổ Kỹ thuật',
  status text not null default 'open' check (status in ('open','in_progress','resolved')),
  reported_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_note text not null default '',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (event_id, seq),
  check ((status = 'resolved') = (resolved_at is not null))
);
select tcsk.register_table('public.sce_tcsk_incidents', 'live', 'event', 'live.read', 'live.manage', realtime => true);

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
create table if not exists public.sce_tcsk_media_clippings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.sce_tcsk_events(id) on delete cascade deferrable initially immediate,
  legacy_id text,
  outlet text not null,
  title text not null,
  published_on date not null,
  media_type text not null,
  url text check (url is null or url ~* '^https?://'),
  author text not null default '',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
select tcsk.register_table('public.sce_tcsk_media_clippings', 'reports', 'event', 'reports.read', 'reports.write');

create table if not exists public.sce_tcsk_bidding_packages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.sce_tcsk_events(id) on delete cascade deferrable initially immediate,
  legacy_id text,
  code text not null,
  name text not null,
  department text not null references public.sce_tcsk_departments(name) on update cascade,
  budget_vnd bigint not null check (budget_vnd >= 0),
  winning_price_vnd bigint check (winning_price_vnd is null or winning_price_vnd >= 0),
  contractor text,
  status text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (event_id, code)
);
select tcsk.register_table('public.sce_tcsk_bidding_packages', 'reports', 'event', 'reports.read', 'reports.write');

create table if not exists public.sce_tcsk_daily_reports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.sce_tcsk_events(id) on delete cascade deferrable initially immediate,
  legacy_id text,
  report_date date not null,
  workdays_to_event integer not null,
  progress_percent smallint not null check (progress_percent between 0 and 100),
  key_highlight text not null default '',
  blockers text not null default '',
  signatory text not null default '',
  document_number text,
  figures jsonb not null default '{}',
  issued_at timestamptz not null default now(),
  issued_by uuid references auth.users(id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (event_id, report_date)
);
select tcsk.register_table('public.sce_tcsk_daily_reports', 'reports', 'event', 'reports.read', 'reports.issue', immutable => true);

create table if not exists public.sce_tcsk_press_releases (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.sce_tcsk_events(id) on delete cascade deferrable initially immediate,
  title text not null,
  timing text not null check (timing in ('before','after')),
  contact text not null default '',
  content text not null default '',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
select tcsk.register_table('public.sce_tcsk_press_releases', 'reports', 'event', 'reports.read', 'reports.write');

-- ---------------------------------------------------------------------------
-- Read model merged at read time (separate owners, one view). security_invoker
-- so each joined table's RLS applies to the reader: a user without live.read
-- sees checked_in_at as null instead of being denied the roster.
-- ---------------------------------------------------------------------------
create or replace view public.sce_tcsk_guest_roster with (security_invoker = true) as
  select g.*,
         s.seat_code,
         c.checked_in_at,
         c.gift_given_at
    from public.sce_tcsk_guests g
    left join public.sce_tcsk_seat_assignments s on s.event_id = g.event_id and s.guest_id = g.id
    left join public.sce_tcsk_checkins c on c.event_id = g.event_id and c.guest_id = g.id;
comment on view public.sce_tcsk_guest_roster is 'sce:owner=guests;view';
revoke all on public.sce_tcsk_guest_roster from anon;
grant select on public.sce_tcsk_guest_roster to authenticated;
