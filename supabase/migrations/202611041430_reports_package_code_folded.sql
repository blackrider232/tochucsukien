-- 202611041430_reports_package_code_folded.sql
-- The command refuses a package code another package of the event already
-- has, whatever its case, tone marks or spacing (foldVi, BUG-33), but the index
-- of 202611041400 compared lower(code) only, so 'GÓI-ĐẦU' and 'goi-dau' could
-- both be inserted outside the command. The index now folds the code as
-- foldVi does: tone marks and đ dropped, lower case, inner spaces collapsed,
-- ends trimmed. It is an expression index over an immutable function, not a
-- stored generated column, because core's restore inserts every column of a
-- backup and a generated column refuses that. sql.test.ts checks the fold
-- against foldVi.
-- Idempotent: create or replace, drop and create if not exists.

create or replace function tcsk.reports_code_key(code text) returns text
language sql immutable set search_path = '' as $$
  select translate(
    lower(btrim(regexp_replace(regexp_replace(code, '[\u0300-\u036f]', '', 'g'), '\s+', ' ', 'g'))),
    'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
  )
$$;

drop index if exists public.sce_tcsk_bidding_packages_code_ci;
create unique index if not exists sce_tcsk_bidding_packages_code_folded on public.sce_tcsk_bidding_packages (event_id, tcsk.reports_code_key(code));
