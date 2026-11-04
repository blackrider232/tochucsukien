-- 202611041490_comms_guards_no_restoring_setting.sql
-- comms only (sce:owner=comms tables). Idempotent.
--
-- The delivery and campaign guards skipped their checks when the session
-- setting sce.restoring was 'on', which any role may set with set_config in
-- raw SQL. A backup restore needs no such door: sce_tcsk_restore_backup is
-- security definer and runs as the owner, which the current_user check
-- already lets through, as it does the import script and foreign-key actions.

create or replace function tcsk.comms_delivery_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  lapsed boolean;
  proven boolean;
  mine boolean;
begin
  if current_user not in ('authenticated', 'anon') then
    if tg_op = 'DELETE' then
      return old;
    end if;
    new.claim_proof := null;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.claim_proof := null;
    return new;
  end if;
  lapsed := old.updated_at <= now() - interval '30 minutes';
  mine := old.updated_by is not distinct from auth.uid();
  if tg_op = 'DELETE' then
    if old.status = 'queued' and (mine or lapsed) then
      return old;
    end if;
    raise exception 'comms: only a claim not yet being sent, of one''s own run or a lapsed one, may be deleted' using errcode = '23514';
  end if;

  proven := old.claim_token is not null and new.claim_proof is not null
    and old.claim_token = substr(encode(sha256(convert_to(new.claim_proof::text, 'UTF8')), 'hex'), 1, 32)::uuid;
  new.claim_proof := null;
  if old.status = 'sent' then
    raise exception 'comms: a sent delivery is final' using errcode = '23514';
  end if;
  if new.campaign_id is distinct from old.campaign_id or new.email is distinct from old.email then
    raise exception 'comms: a delivery keeps its campaign and address' using errcode = '23514';
  end if;
  if new.claim_token is distinct from old.claim_token then
    if new.status = 'queued' and (old.status = 'error' or (old.status = 'queued' and (lapsed or mine))) then
      return new;
    end if;
    raise exception 'comms: the claim belongs to another run' using errcode = '23514';
  end if;
  if new.status = old.status and new.sent_at is not distinct from old.sent_at
    and new.provider_message_id is not distinct from old.provider_message_id and new.error is not distinct from old.error then
    -- Nothing the rules track changed (a renewal, or a guest's link set to null); a claim is renewed only by its run.
    if old.status not in ('queued', 'sending') or proven then
      return new;
    end if;
  elsif old.status in ('queued', 'sending') and proven and new.status in ('sending', 'sent', 'error', 'unknown') then
    return new;
  elsif old.status = 'sending' and new.status = 'queued' and proven and new.sent_at is null and new.provider_message_id is null then
    -- The run stopped before Gmail was asked: its own message goes back to a claim, which it may then free.
    return new;
  elsif old.status = 'sending' and new.status = 'unknown' and (lapsed or mine)
    and new.sent_at is null and new.provider_message_id is null then
    return new;
  elsif old.status = 'unknown' and new.status = 'sent' and proven then
    return new;
  elsif old.status = 'unknown' and new.status = 'error' and new.sent_at is null and new.provider_message_id is null then
    return new;
  end if;
  raise exception 'comms: % to % is not this run''s to write', old.status, new.status using errcode = '23514';
end $$;

create or replace function tcsk.comms_campaign_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.id is distinct from old.id or new.subject_template is distinct from old.subject_template or new.body_template is distinct from old.body_template then
    raise exception 'comms: a campaign''s message never changes' using errcode = '23514';
  end if;
  return new;
end $$;
