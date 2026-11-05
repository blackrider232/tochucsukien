-- 202611041540_comms_email_campaigns.sql
-- comms only (sce:owner=comms tables). Idempotent.
--
-- The message of each campaign: its subject and body templates, as composed
-- (the campaign id is derived from them), and whether the check-in QR goes
-- with it. "Gửi lại thư lỗi" reopens exactly this message, so a retry is the
-- same campaign and never a different text under the same name.
create table if not exists public.sce_tcsk_email_campaigns (
  id uuid primary key,
  event_id uuid not null references public.sce_tcsk_events(id) on delete cascade deferrable initially immediate,
  subject_template text not null,
  body_template text not null,
  attach_qr boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
select tcsk.register_table('public.sce_tcsk_email_campaigns', 'comms', 'event', 'comms.read', 'comms.send');
