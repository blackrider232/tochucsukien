-- 202611041200_comms_delivery_evidence_and_sync_state.sql
-- comms only (sce:owner=comms tables). Idempotent.
--
-- Deliveries: a 'sent' row needs the Gmail message id and a time, so no
-- simulated send can ever be stored as sent (decision 16, m4a B12, m4c B19).
-- Rows the legacy importer writes are flagged `imported`: the old app marked
-- sandbox sends as sent, so they carry no evidence and say so.
alter table public.sce_tcsk_email_deliveries add column if not exists recipient_name text not null default '';
alter table public.sce_tcsk_email_deliveries add column if not exists provider_message_id text;
alter table public.sce_tcsk_email_deliveries add column if not exists imported boolean not null default false;
alter table public.sce_tcsk_email_deliveries drop constraint if exists sce_tcsk_email_deliveries_sent_has_evidence;
alter table public.sce_tcsk_email_deliveries add constraint sce_tcsk_email_deliveries_sent_has_evidence
  check (status <> 'sent' or imported or (sent_at is not null and provider_message_id is not null)) not valid;
alter table public.sce_tcsk_email_deliveries drop constraint if exists sce_tcsk_email_deliveries_error_has_text;
alter table public.sce_tcsk_email_deliveries add constraint sce_tcsk_email_deliveries_error_has_text
  check (status <> 'error' or error is not null) not valid;

-- Form: the last attempt and its error, beside the last successful sync, and
-- the sheet's header row, so the column mapping can be chosen without a fetch.
alter table public.sce_tcsk_rsvp_forms add column if not exists last_attempt_at timestamptz;
alter table public.sce_tcsk_rsvp_forms add column if not exists last_sync_error text;
alter table public.sce_tcsk_rsvp_forms add column if not exists sheet_headers text[] not null default '{}';

-- Responses: what became of each one, the extra answers kept as data, the
-- candidates of an ambiguous match, and 'manual' for a match staff chose.
alter table public.sce_tcsk_rsvp_responses add column if not exists title text not null default '';
alter table public.sce_tcsk_rsvp_responses add column if not exists notes text not null default '';
alter table public.sce_tcsk_rsvp_responses add column if not exists candidate_guest_ids uuid[] not null default '{}';
alter table public.sce_tcsk_rsvp_responses add column if not exists apply_status text not null default 'pending';
alter table public.sce_tcsk_rsvp_responses drop constraint if exists sce_tcsk_rsvp_responses_apply_status_check;
alter table public.sce_tcsk_rsvp_responses add constraint sce_tcsk_rsvp_responses_apply_status_check
  check (apply_status in ('pending', 'applied', 'stale', 'no_answer', 'no_time', 'dismissed'));
alter table public.sce_tcsk_rsvp_responses drop constraint if exists sce_tcsk_rsvp_responses_match_check;
alter table public.sce_tcsk_rsvp_responses add constraint sce_tcsk_rsvp_responses_match_check
  check (match in ('email', 'phone', 'name', 'created', 'manual', 'ambiguous', 'none'));
