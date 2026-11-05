-- 202611041560_comms_delivery_guard.sql
-- comms only (sce:owner=comms tables). Idempotent.
--
-- The no-double-send rules, enforced by the database and not only by the app,
-- for an officer who writes to the tables directly with comms.send.
--
-- claim_token holds the sha256 of the run's token (first 128 bits, as a
-- uuid), so reading a row does not reveal the token. A write that acts for
-- the run that holds a claim carries the token itself in claim_proof; the
-- trigger checks it against claim_token and never stores it.
--
-- Deliveries, for authenticated users:
--   * a row starts as a claim ('queued');
--   * a claim changes hands only as the app allows: a new claim of an
--     error, of a claim untouched for 30 minutes, or of one's own claim
--     (take-over); a lapsed or taken-over 'sending' row only becomes
--     'unknown';
--   * anything else a claim does (renew, 'sending', a result) needs the
--     run's token; a run may still record 'sent' on its own 'unknown' row;
--   * 'unknown' becomes 'error' only (an officer checked the Sent folder);
--   * a 'sent' row is final: no update, no delete;
--   * only an unsent claim ('queued' or 'sending') is deleted, by the officer
--     whose run holds it or once it lapsed.
-- Campaigns: the subject and body never change (the campaign id is derived
-- from them); the QR choice changes, and the row is deleted, only until a
-- message of the campaign went out.
-- The owner, the service role (import script) and a backup restore are not
-- checked. Foreign-key actions (an event or guest deleted) run as the owner.

alter table public.sce_tcsk_email_deliveries add column if not exists claim_proof uuid;

create or replace function tcsk.comms_delivery_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  lapsed boolean;
  proven boolean;
  mine boolean;
begin
  if current_user not in ('authenticated', 'anon') or coalesce(current_setting('sce.restoring', true), '') = 'on' then
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
    if old.status in ('queued', 'sending') and (mine or lapsed) then
      return old;
    end if;
    raise exception 'comms: only an unsent claim of one''s own run, or a lapsed one, may be deleted' using errcode = '23514';
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

drop trigger if exists sce_tcsk_comms_delivery_guard on public.sce_tcsk_email_deliveries;
create trigger sce_tcsk_comms_delivery_guard before insert or update or delete on public.sce_tcsk_email_deliveries
  for each row execute function tcsk.comms_delivery_guard();

drop policy if exists sce_comms_claim_first on public.sce_tcsk_email_deliveries;
create policy sce_comms_claim_first on public.sce_tcsk_email_deliveries
  as restrictive for insert to authenticated with check (status = 'queued');
drop policy if exists sce_comms_delete_unsent on public.sce_tcsk_email_deliveries;
create policy sce_comms_delete_unsent on public.sce_tcsk_email_deliveries
  as restrictive for delete to authenticated using (status in ('queued', 'sending'));

create or replace function tcsk.comms_campaign_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') or coalesce(current_setting('sce.restoring', true), '') = 'on' then
    return new;
  end if;
  if new.id is distinct from old.id or new.subject_template is distinct from old.subject_template or new.body_template is distinct from old.body_template then
    raise exception 'comms: a campaign''s message never changes' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists sce_tcsk_comms_campaign_guard on public.sce_tcsk_email_campaigns;
create trigger sce_tcsk_comms_campaign_guard before update on public.sce_tcsk_email_campaigns
  for each row execute function tcsk.comms_campaign_guard();

drop policy if exists sce_comms_campaign_unsent_update on public.sce_tcsk_email_campaigns;
create policy sce_comms_campaign_unsent_update on public.sce_tcsk_email_campaigns
  as restrictive for update to authenticated
  using (not exists (select 1 from public.sce_tcsk_email_deliveries d where d.campaign_id = sce_tcsk_email_campaigns.id and d.status in ('sending', 'sent', 'unknown')));
drop policy if exists sce_comms_campaign_unsent_delete on public.sce_tcsk_email_campaigns;
create policy sce_comms_campaign_unsent_delete on public.sce_tcsk_email_campaigns
  as restrictive for delete to authenticated
  using (not exists (select 1 from public.sce_tcsk_email_deliveries d where d.campaign_id = sce_tcsk_email_campaigns.id and d.status in ('sending', 'sent', 'unknown')));
