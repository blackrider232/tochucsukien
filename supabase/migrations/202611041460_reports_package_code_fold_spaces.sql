-- 202611041460_reports_package_code_fold_spaces.sql
-- 202611041430 folded a package code with PostgreSQL's \s, which does not match
-- U+00A0, while the command's foldVi (src/core/text) turns every JavaScript \s
-- into a space. So 'GÓI A' with a non-breaking space passed the index after
-- 'GÓI A' and was refused by the command. The fold now decomposes the text
-- (NFD) before it drops the combining marks, as foldVi does, so it no longer
-- depends on a list of Vietnamese letters or on lower() handling them, and it
-- collapses the exact set JavaScript's \s matches: tab, line breaks, vertical
-- tab, form feed, space, U+00A0, U+1680, U+2000-200A, U+2028, U+2029, U+202F,
-- U+205F, U+3000 and U+FEFF. Zero-width space and joiner are not whitespace to
-- JavaScript either, so both folds keep them. sql.test.ts compares the two on a corpus.
-- The unique index is rebuilt because the function behind it changed; two codes
-- of one event that differ only by such a space now collide and the rebuild
-- fails, which is the loud answer (resolve the duplicate, then apply).
-- Idempotent: create or replace, reindex.

create or replace function tcsk.reports_code_key(code text) returns text
language sql immutable set search_path = '' as $$
  select lower(btrim(regexp_replace(
    translate(regexp_replace(normalize(code, NFD), '[̀-ͯ]', '', 'g'), 'đĐ', 'dD'),
    '[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+', ' ', 'g'
  )))
$$;

reindex index public.sce_tcsk_bidding_packages_code_folded;
