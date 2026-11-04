-- 202611041200_core_holidays_guard.sql
-- Replacing a year's holidays now carries the list the editor saw. When the
-- stored year differs (another editor saved, or an undo runs after someone
-- else's change), nothing is written and the function returns null, which
-- the command reports as a conflict. The two-argument version is dropped so
-- nothing can replace a year without the guard.
-- Idempotent: drop of the old signature, create or replace, grants re-applied.

drop function if exists public.sce_tcsk_replace_holidays(integer, jsonb);

create or replace function public.sce_tcsk_replace_holidays(year integer, holidays jsonb, expected jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  first_day date;
  previous jsonb;
  seen jsonb;
  stored jsonb;
begin
  if not tcsk.has_perm('core.holidays.edit') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if sce_tcsk_replace_holidays.year is null or sce_tcsk_replace_holidays.year not between 2000 and 2100 then
    raise exception 'invalid_year' using errcode = '22023';
  end if;
  if holidays is null or jsonb_typeof(holidays) <> 'array' or expected is null or jsonb_typeof(expected) <> 'array' then
    raise exception 'invalid_holidays' using errcode = '22023';
  end if;
  first_day := make_date(sce_tcsk_replace_holidays.year, 1, 1);
  if exists (
    select 1 from jsonb_array_elements(holidays) h
     where coalesce(trim(h ->> 'name'), '') = ''
        or (h ->> 'date') is null
        or (h ->> 'date')::date < first_day
        or (h ->> 'date')::date >= (first_day + interval '1 year')::date
  ) then
    raise exception 'holiday_outside_year' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sce_holidays:' || sce_tcsk_replace_holidays.year, 0));
  previous := tcsk.holidays_of(sce_tcsk_replace_holidays.year);
  -- The editor's list in the shape holidays_of returns: stored names are trimmed and cut, kind defaults to holiday.
  select coalesce(jsonb_agg(jsonb_build_object('date', (e ->> 'date')::date, 'name', left(trim(e ->> 'name'), 120), 'kind', coalesce(e ->> 'kind', 'holiday'))
                            order by (e ->> 'date')::date), '[]')
    into seen
    from jsonb_array_elements(expected) e;
  if previous is distinct from seen then
    return null;
  end if;

  delete from public.sce_tcsk_holidays d
   where d.holiday_date >= first_day and d.holiday_date < (first_day + interval '1 year')::date;
  insert into public.sce_tcsk_holidays (holiday_date, name, kind, updated_by)
  select (h ->> 'date')::date, left(trim(h ->> 'name'), 120), coalesce(h ->> 'kind', 'holiday'), auth.uid()
    from jsonb_array_elements(holidays) h;
  stored := tcsk.holidays_of(sce_tcsk_replace_holidays.year);
  perform public.sce_tcsk_write_audit('CẬP NHẬT NGÀY NGHỈ LỄ', format('Năm %s: %s', sce_tcsk_replace_holidays.year, tcsk.holiday_diff(previous, stored)),
                                      null, 'holidays', sce_tcsk_replace_holidays.year::text);
  return previous;
end $$;

revoke all on function public.sce_tcsk_replace_holidays(integer, jsonb, jsonb) from public, anon;
grant execute on function public.sce_tcsk_replace_holidays(integer, jsonb, jsonb) to authenticated;
