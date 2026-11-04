-- 202611041440_comms_delivery_unknown_status.sql
-- comms only (sce:owner=comms tables). Idempotent.
--
-- 'unknown': Gmail's answer to a send was lost (the connection dropped), so
-- the message may have gone. Nothing sends it again on its own; an officer
-- checks the Sent folder and marks it not sent (it becomes 'error'). The
-- reason is kept, like an error's.
alter table public.sce_tcsk_email_deliveries drop constraint if exists sce_tcsk_email_deliveries_status_check;
alter table public.sce_tcsk_email_deliveries add constraint sce_tcsk_email_deliveries_status_check
  check (status in ('queued', 'sent', 'error', 'unknown'));
alter table public.sce_tcsk_email_deliveries drop constraint if exists sce_tcsk_email_deliveries_unknown_has_text;
alter table public.sce_tcsk_email_deliveries add constraint sce_tcsk_email_deliveries_unknown_has_text
  check (status <> 'unknown' or error is not null) not valid;
