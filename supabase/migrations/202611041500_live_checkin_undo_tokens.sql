-- 202611041500_live_checkin_undo_tokens.sql
-- One-time undo tokens for a removed check-in. live.cancelCheckIn and
-- live.undoCheckIn copy the check-in here before they remove it, and the
-- inverse carries only the token id, so live.restoreCheckIn puts back the time,
-- desk, gift time and actor the server kept, never values the client sends.
-- One token per guest: a newer removal replaces the older token.
-- Idempotent: create if not exists, register_table re-applies its policies.

create table if not exists public.sce_tcsk_checkin_undo_tokens (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  guest_id uuid not null,
  checked_in_at timestamptz not null,
  checked_in_by uuid references auth.users(id) on delete set null,
  desk text,
  gift_given_at timestamptz,
  declined_confirmed boolean not null default false,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid references auth.users(id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (event_id, guest_id),
  foreign key (event_id) references public.sce_tcsk_events(id) on delete cascade deferrable initially immediate,
  foreign key (event_id, guest_id) references public.sce_tcsk_guests(event_id, id) on delete cascade deferrable initially immediate
);
select tcsk.register_table('public.sce_tcsk_checkin_undo_tokens', 'live', 'event', 'live.checkin', 'live.checkin');
