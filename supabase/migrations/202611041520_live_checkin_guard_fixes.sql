-- 202611041520_live_checkin_guard_fixes.sql
-- Follow-up to 202611041510_live_checkin_guard.sql (never edited once applied):
--   * a check-in row stays with its guest: an UPDATE that moves it to another
--     guest, who may never have come or may have declined, is refused. (The
--     core stamp trigger already holds event_id; nothing held guest_id.)
--   * a time outside the window (2 minutes behind, 1 minute ahead of the
--     database clock) is refused with SQLSTATE 22008 and the constraint name
--     live_clock_skew in the detail, not 42501, so the app can tell a skewed
--     server clock from a permission refusal. 22008 is one of the codes
--     core's translatePgError reads as a constraint, with that name.
-- Idempotent: create or replace, drop trigger if exists.

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
  if tg_op = 'UPDATE' and new.guest_id is distinct from old.guest_id then
    raise exception 'a check-in stays with its guest' using errcode = '42501';
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
      raise exception 'a check-in is recorded at the current time' using errcode = '22008', detail = 'constraint "live_clock_skew"';
    end if;
  end if;
  if gift_changed and new.gift_given_at is not null and new.gift_given_at not between fresh_from and fresh_to then
    raise exception 'a gift is recorded at the current time' using errcode = '22008', detail = 'constraint "live_clock_skew"';
  end if;
  return new;
end $$;
revoke all on function tcsk.live_checkin_guard() from public, anon, authenticated;
drop trigger if exists sce_tcsk_live_checkin_guard on public.sce_tcsk_checkins;
create trigger sce_tcsk_live_checkin_guard before insert or update on public.sce_tcsk_checkins
  for each row execute function tcsk.live_checkin_guard();
