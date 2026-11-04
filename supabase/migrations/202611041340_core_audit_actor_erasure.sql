-- 202611041340_core_audit_actor_erasure.sql
-- actor_id references auth.users on delete set null (0001), and Postgres runs
-- that action as an UPDATE, which the append-only trigger of 202611041310
-- refused: no auth user with an audit row could be deleted. The trigger now
-- takes exactly that change, a non-null actor_id set to null with every other
-- column (actor_email included) as it was, so the row still names who acted.
-- Every other UPDATE, DELETE and TRUNCATE still raises. The table owner can
-- make the same change by hand; it erases a link, never what the row says.
-- Idempotent: create or replace.

create or replace function tcsk.audit_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.actor_id is not null and new.actor_id is null
     and to_jsonb(new) - 'actor_id' = to_jsonb(old) - 'actor_id' then
    return new;
  end if;
  raise exception 'sce_tcsk_audit_logs is append-only' using errcode = '42501';
end $$;
revoke all on function tcsk.audit_append_only() from public, anon, authenticated;
