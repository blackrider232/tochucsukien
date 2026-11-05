-- tcsk.audit_text collapsed white space with \s, which follows the server's
-- libc locale: on PGlite (C.UTF-8) it matches U+0085 but not U+1680, and
-- JavaScript's \s, which the memory writer used, the other way round. The class
-- is now spelled out as Unicode White_Space, so every server and the memory
-- writer agree. Only the second regexp changes from 202611041350.
create or replace function tcsk.audit_text(t text) returns text
language sql immutable set search_path = '' as $$
  select nullif(btrim(regexp_replace(
           regexp_replace(normalize(t, NFKC), '[­᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]', '', 'g'),
           '[\t\n\v\f\r \u0085   -     　]+', ' ', 'g'), ' '), '')
$$;

revoke all on function tcsk.audit_text(text) from public, anon, authenticated;
