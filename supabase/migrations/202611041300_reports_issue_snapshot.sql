-- 202611041300_reports_issue_snapshot.sql
-- An issued daily report is a snapshot (m6 BUG-12/13): it now also freezes the
-- event name and date and the signer's title it was issued under, so a later
-- rename or a moved T0 does not rewrite a document already sent to UBND TP.
-- The issuer, the issue time and the report date are the server's, never the
-- caller's: a user session cannot backdate a report or sign it as someone else.
-- The import (service role, no auth.uid()) keeps the legacy values.
-- Clipping types and contract statuses are the contract's closed lists, and a
-- package code is unique per event whatever its case (m6 §3.4, BUG-33).
-- RLS is unchanged: 0002 registered these tables from the generated permission
-- matrix (reports.read to read, reports.write to edit, reports.issue to issue,
-- and no update or delete policy on sce_tcsk_daily_reports).
-- Idempotent: add column if not exists, create or replace, guarded constraints.

alter table public.sce_tcsk_daily_reports add column if not exists event_name text not null default '';
alter table public.sce_tcsk_daily_reports add column if not exists event_date date;
alter table public.sce_tcsk_daily_reports add column if not exists signatory_title text not null default '';

create or replace function tcsk.reports_issue_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null then
    new.issued_by := auth.uid();
    new.issued_at := now();
    new.report_date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  end if;
  return new;
end $$;

drop trigger if exists sce_tcsk_reports_issue_stamp on public.sce_tcsk_daily_reports;
create trigger sce_tcsk_reports_issue_stamp before insert on public.sce_tcsk_daily_reports
  for each row execute function tcsk.reports_issue_stamp();

create unique index if not exists sce_tcsk_bidding_packages_code_ci on public.sce_tcsk_bidding_packages (event_id, lower(code));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sce_tcsk_media_clippings_media_type_check') then
    alter table public.sce_tcsk_media_clippings add constraint sce_tcsk_media_clippings_media_type_check
      check (media_type in ('Báo điện tử', 'Truyền hình', 'Báo in', 'Cổng TTĐT', 'Báo in & Điện tử'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sce_tcsk_bidding_packages_status_check') then
    alter table public.sce_tcsk_bidding_packages add constraint sce_tcsk_bidding_packages_status_check
      check (status in ('Đang thẩm định hồ sơ', 'Đang thực hiện hợp đồng', 'Đang nghiệm thu thanh lý', 'Đã nghiệm thu thanh lý'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sce_tcsk_bidding_packages_code_check') then
    alter table public.sce_tcsk_bidding_packages add constraint sce_tcsk_bidding_packages_code_check check (btrim(code) <> '' and btrim(name) <> '');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sce_tcsk_media_clippings_text_check') then
    alter table public.sce_tcsk_media_clippings add constraint sce_tcsk_media_clippings_text_check check (btrim(outlet) <> '' and btrim(title) <> '');
  end if;
end $$;
