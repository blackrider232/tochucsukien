-- 202611041450_comms_delivery_sending_status.sql
-- comms only (sce:owner=comms tables). Idempotent.
--
-- 'sending': the run that holds the claim marked it just before handing the
-- message to Gmail. A run that dies after Gmail took the message but before
-- the result was written leaves the row 'sending', never 'queued', so no
-- other run claims it again: once the lease runs out, the next claim turns
-- it into 'unknown' for a person to check the Sent folder. A 'sending' row
-- carries its run's token, like a 'queued' one.
alter table public.sce_tcsk_email_deliveries drop constraint if exists sce_tcsk_email_deliveries_status_check;
alter table public.sce_tcsk_email_deliveries add constraint sce_tcsk_email_deliveries_status_check
  check (status in ('queued', 'sending', 'sent', 'error', 'unknown'));
alter table public.sce_tcsk_email_deliveries drop constraint if exists sce_tcsk_email_deliveries_queued_has_token;
alter table public.sce_tcsk_email_deliveries add constraint sce_tcsk_email_deliveries_queued_has_token
  check (status not in ('queued', 'sending') or claim_token is not null) not valid;
