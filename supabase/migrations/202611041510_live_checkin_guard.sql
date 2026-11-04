-- 202611041510_live_checkin_guard.sql
-- The check-in rules the database can hold for a signed-in user, whose browser
-- can write sce_tcsk_checkins and the undo tokens through PostgREST with the
-- live.checkin policy alone:
--   * a check-in is made now (2 minutes back, 1 minute ahead for clock skew),
--     by the signed-in user;
--   * a gift is recorded now, and only on a row that has a check-in;
--   * an earlier time, desk, gift time or another user's id comes back only
--     from an undo token this user consumed in the last 2 minutes;
--   * an undo token copies a check-in that exists when it is written, expires
--     within 15 minutes, and is consumed once, before it expires.
-- Rows written without a user (the importer under the service role) and a
-- backup restore pass unchecked. Idempotent: create or replace, drop trigger
-- if exists.

create or replace function tcsk.live_undo_token_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('sce.restoring', true), '') = 'on' or auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from public.sce_tcsk_checkins c
       where c.event_id = new.event_id and c.guest_id = new.guest_id
         and c.checked_in_at = new.checked_in_at
         and c.checked_in_by is not distinct from new.checked_in_by
         and c.desk is not distinct from new.desk
         and c.gift_given_at is not distinct from new.gift_given_at
    ) then
      raise exception 'an undo token copies a current check-in' using errcode = '42501';
    end if;
    new.declined_confirmed := coalesce((select g.rsvp_status = 'declined' from public.sce_tcsk_guests g
                                         where g.event_id = new.event_id and g.id = new.guest_id), false);
    new.expires_at := least(new.expires_at, now() + interval '15 minutes');
    new.consumed_at := null;
    new.consumed_by := null;
    return new;
  end if;
  if old.consumed_at is not null then
    raise exception 'the undo token is already used' using errcode = '42501';
  end if;
  if old.expires_at <= now() then
    raise exception 'the undo token has expired' using errcode = '42501';
  end if;
  if (new.event_id, new.guest_id, new.checked_in_at, new.checked_in_by, new.desk, new.gift_given_at, new.declined_confirmed, new.expires_at)
     is distinct from (old.event_id, old.guest_id, old.checked_in_at, old.checked_in_by, old.desk, old.gift_given_at, old.declined_confirmed, old.expires_at) then
    raise exception 'an undo token is only consumed' using errcode = '42501';
  end if;
  new.consumed_at := now();
  new.consumed_by := auth.uid();
  return new;
end $$;
revoke all on function tcsk.live_undo_token_guard() from public, anon, authenticated;
drop trigger if exists sce_tcsk_live_undo_token_guard on public.sce_tcsk_checkin_undo_tokens;
create trigger sce_tcsk_live_undo_token_guard before insert or update on public.sce_tcsk_checkin_undo_tokens
  for each row execute function tcsk.live_undo_token_guard();

create or replace function tcsk.live_checkin_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  fresh_from timestamptz := now() - interval '2 minutes';
  fresh_to timestamptz := now() + interval '1 minute';
  arrival_changed boolean;
  gift_changed boolean;
begin
  if coalesce(current_setting('sce.restoring', true), '') = 'on' or auth.uid() is null then
    return new;
  end if;
  if new.gift_given_at is not null and new.checked_in_at is null then
    raise exception 'a gift needs a check-in' using errcode = '42501';
  end if;
  arrival_changed := tg_op = 'INSERT'
    or (new.checked_in_at, new.checked_in_by, new.desk) is distinct from (old.checked_in_at, old.checked_in_by, old.desk);
  gift_changed := case when tg_op = 'INSERT' then new.gift_given_at is not null else new.gift_given_at is distinct from old.gift_given_at end;
  if new.checked_in_at is not null and arrival_changed and exists (
    select 1 from public.sce_tcsk_checkin_undo_tokens t
     where t.event_id = new.event_id and t.guest_id = new.guest_id
       and t.checked_in_at = new.checked_in_at
       and t.checked_in_by is not distinct from new.checked_in_by
       and t.desk is not distinct from new.desk
       and t.gift_given_at is not distinct from new.gift_given_at
       and t.consumed_by = auth.uid() and t.consumed_at >= now() - interval '2 minutes'
  ) then
    return new;
  end if;
  if new.checked_in_at is not null and arrival_changed then
    new.checked_in_by := coalesce(new.checked_in_by, auth.uid());
    if new.checked_in_by <> auth.uid() then
      raise exception 'a check-in is recorded by the signed-in user' using errcode = '42501';
    end if;
    if new.checked_in_at not between fresh_from and fresh_to then
      raise exception 'a check-in is recorded at the current time' using errcode = '42501';
    end if;
  end if;
  if gift_changed and new.gift_given_at is not null and new.gift_given_at not between fresh_from and fresh_to then
    raise exception 'a gift is recorded at the current time' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function tcsk.live_checkin_guard() from public, anon, authenticated;
drop trigger if exists sce_tcsk_live_checkin_guard on public.sce_tcsk_checkins;
create trigger sce_tcsk_live_checkin_guard before insert or update on public.sce_tcsk_checkins
  for each row execute function tcsk.live_checkin_guard();
