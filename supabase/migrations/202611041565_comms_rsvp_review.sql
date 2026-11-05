-- 202611041565_comms_rsvp_review.sql
-- comms only (sce:owner=comms tables). Idempotent.
--
-- A Form answer is applied only when it is, as a whole, one of the Form's
-- choice labels or a canonical answer. Any other answer waits for a person:
-- apply_status 'review', with the cell as typed in rsvp_answer. The Form's
-- labels, and what each means, are kept per form in answer_labels.

alter table public.sce_tcsk_rsvp_responses add column if not exists rsvp_answer text not null default '';
alter table public.sce_tcsk_rsvp_responses drop constraint if exists sce_tcsk_rsvp_responses_apply_status_check;
alter table public.sce_tcsk_rsvp_responses add constraint sce_tcsk_rsvp_responses_apply_status_check
  check (apply_status in ('pending', 'applied', 'stale', 'no_answer', 'review', 'no_time', 'dismissed'));

alter table public.sce_tcsk_rsvp_forms add column if not exists answer_labels jsonb not null default '{}'::jsonb;
alter table public.sce_tcsk_rsvp_forms drop constraint if exists sce_tcsk_rsvp_forms_answer_labels_check;
alter table public.sce_tcsk_rsvp_forms add constraint sce_tcsk_rsvp_forms_answer_labels_check check (jsonb_typeof(answer_labels) = 'object');
