-- 202611041300_comms_delivery_claim_token.sql
-- comms only (sce:owner=comms tables). Idempotent.
--
-- A 'queued' delivery is held by one run of the send loop, named by the
-- random token that run carries. Only that run records or releases it.
-- Another run, even a second tab of the same officer, leaves it alone until
-- the lease runs out or the officer explicitly takes it over, so a message is
-- never sent by two runs at once.
alter table public.sce_tcsk_email_deliveries add column if not exists claim_token uuid;
alter table public.sce_tcsk_email_deliveries drop constraint if exists sce_tcsk_email_deliveries_queued_has_token;
alter table public.sce_tcsk_email_deliveries add constraint sce_tcsk_email_deliveries_queued_has_token
  check (status <> 'queued' or claim_token is not null) not valid;
