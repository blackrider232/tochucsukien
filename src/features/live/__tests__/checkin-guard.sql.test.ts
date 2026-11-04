// @vitest-environment node
// The check-in guard of 202611041510_live_checkin_guard.sql on PGlite: a desk
// user writing sce_tcsk_checkins or the undo tokens directly through the API
// is held to what the commands write. The prelude stubs Supabase as
// scripts/verify-sql.mjs does.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const sqlDir = join(process.cwd(), 'supabase', 'migrations');
const A = '00000000-0000-0000-0000-0000000000a1';
const B = '00000000-0000-0000-0000-0000000000a2';
let db: PGlite;
let eventId: string;

async function as<T>(user: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated`);
  await db.exec(`select set_config('request.jwt.claim.sub', '${user}', false), set_config('request.jwt.claims', '{"sub":"${user}","aal":"aal1"}', false)`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false)`);
  }
}
const q = (sql: string) => db.query<Record<string, unknown>>(sql);
const asA = (sql: string) => as(A, () => q(sql));
const asB = (sql: string) => as(B, () => q(sql));

async function addGuest(name: string): Promise<string> {
  const r = await asA(`insert into public.sce_tcsk_guests (event_id, name, guest_group, organization) values ('${eventId}', '${name}', 'DoanhNghiep', 'Sở Thử') returning id`);
  return r.rows[0]!.id as string;
}
const checkinOf = async (guestId: string) => (await q(`select checked_in_at, checked_in_by, desk, gift_given_at from public.sce_tcsk_checkins where guest_id = '${guestId}'`)).rows[0];
const copyAsToken = (guestId: string) => `insert into public.sce_tcsk_checkin_undo_tokens (event_id, guest_id, checked_in_at, checked_in_by, desk, gift_given_at, expires_at)
  select event_id, guest_id, checked_in_at, checked_in_by, desk, gift_given_at, now() + interval '15 minutes' from public.sce_tcsk_checkins where guest_id = '${guestId}' returning id`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid, status text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on all functions in schema auth to authenticated, anon;
    grant usage on schema public to authenticated, anon, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    create publication supabase_realtime;
  `);
  for (const f of readdirSync(sqlDir).filter((n) => /^\d{4,14}_.*\.sql$/.test(n)).sort()) await db.exec(readFileSync(join(sqlDir, f), 'utf8'));
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${A}', 'a@x.vn', '{"department":"Phòng Xúc tiến đầu tư"}'),
      ('${B}', 'b@x.vn', '{"department":"Phòng Xúc tiến đầu tư"}');
    update public.sce_tcsk_profiles set status = 'active';
  `);
  const ev = await asA(`insert into public.sce_tcsk_events (name, type, event_date, department) values ('HN', 'hoi_nghi', '2026-12-15', 'Phòng Xúc tiến đầu tư') returning id`);
  eventId = ev.rows[0]!.id as string;
}, 60_000);

describe('a desk user writing check-ins directly', () => {
  it('cannot backdate, postdate, sign for someone else, or record a gift without a check-in', async () => {
    const g = await addGuest('Lê Thị Thật');
    const insert = (cols: string) => asA(`insert into public.sce_tcsk_checkins (event_id, guest_id, checked_in_at, checked_in_by, desk, gift_given_at) values ('${eventId}', '${g}', ${cols})`);
    await expect(insert(`'2020-01-01T00:00:00Z', '${A}', 'forged', '2020-01-01T00:00:00Z'`)).rejects.toThrow(/current time/);
    await expect(insert(`now() - interval '1 hour', '${A}', null, null`)).rejects.toThrow(/current time/);
    await expect(insert(`now() + interval '10 minutes', '${A}', null, null`)).rejects.toThrow(/current time/);
    await expect(insert(`now(), '${B}', null, null`)).rejects.toThrow(/signed-in user/);
    await expect(insert(`null, null, null, now()`)).rejects.toThrow(/gift needs a check-in/);
    expect(await checkinOf(g)).toBeUndefined();
  });

  it('cannot move a check-in or a gift into the past afterwards', async () => {
    const g = await addGuest('Trần Văn Bình');
    await asA(`insert into public.sce_tcsk_checkins (event_id, guest_id, checked_in_at, desk) values ('${eventId}', '${g}', now(), 'Bàn 1')`);
    await expect(asA(`update public.sce_tcsk_checkins set checked_in_at = '2020-01-01T00:00:00Z' where guest_id = '${g}'`)).rejects.toThrow(/current time/);
    await expect(asA(`update public.sce_tcsk_checkins set gift_given_at = now() - interval '1 hour' where guest_id = '${g}'`)).rejects.toThrow(/gift is recorded at the current time/);
    await asA(`update public.sce_tcsk_checkins set gift_given_at = now() where guest_id = '${g}'`);
    expect(await checkinOf(g)).toMatchObject({ checked_in_by: A, desk: 'Bàn 1' });
  });

  it('cannot re-point a check-in at another guest, a declined one included, nor a token', async () => {
    const came = await addGuest('Hồ Văn Đến');
    const absent = await addGuest('Vũ Thị Vắng');
    const declined = await addGuest('Mai Văn Từ Chối');
    await asA(`update public.sce_tcsk_guests set rsvp_status = 'declined' where id = '${declined}'`);
    await asB(`insert into public.sce_tcsk_checkins (event_id, guest_id, checked_in_at, checked_in_by, desk) values ('${eventId}', '${came}', now(), '${B}', 'Bàn 4')`);
    await asB(`update public.sce_tcsk_checkins set gift_given_at = now() where guest_id = '${came}'`);
    for (const target of [absent, declined]) {
      await expect(asA(`update public.sce_tcsk_checkins set guest_id = '${target}' where guest_id = '${came}'`)).rejects.toThrow(/stays with its guest/);
      expect(await checkinOf(target)).toBeUndefined();
    }
    expect(await checkinOf(came)).toMatchObject({ checked_in_by: B, desk: 'Bàn 4' });
    await asB(copyAsToken(came));
    await expect(asA(`update public.sce_tcsk_checkin_undo_tokens set guest_id = '${absent}' where guest_id = '${came}'`)).rejects.toThrow(/only consumed/);
  });

  it('cannot write an undo token that copies no check-in, nor reuse or extend one', async () => {
    const g = await addGuest('Phạm Văn Giả');
    await expect(asA(`insert into public.sce_tcsk_checkin_undo_tokens (event_id, guest_id, checked_in_at, checked_in_by, expires_at)
      values ('${eventId}', '${g}', '2020-01-01T00:00:00Z', '${A}', now() + interval '1 day')`)).rejects.toThrow(/copies a current check-in/);
    await db.exec(`insert into public.sce_tcsk_checkin_undo_tokens (event_id, guest_id, checked_in_at, checked_in_by, expires_at, consumed_at, consumed_by)
      values ('${eventId}', '${g}', now() - interval '3 hours', '${A}', now() - interval '1 minute', null, null)`);
    await expect(asA(`update public.sce_tcsk_checkin_undo_tokens set consumed_at = now() where guest_id = '${g}'`)).rejects.toThrow(/expired/);
    await expect(asA(`update public.sce_tcsk_checkin_undo_tokens set expires_at = now() + interval '1 day' where guest_id = '${g}'`)).rejects.toThrow(/expired/);
    await expect(asA(`insert into public.sce_tcsk_checkins (event_id, guest_id, checked_in_at, checked_in_by) select event_id, guest_id, checked_in_at, checked_in_by
      from public.sce_tcsk_checkin_undo_tokens where guest_id = '${g}'`)).rejects.toThrow(/current time/);
  });
});

describe('the command path still works under the guard', () => {
  it('check in, gift, cancel by another desk, then undo restores the original time, desk, gift time and actor, once', async () => {
    const g = await addGuest('Nguyễn Văn An');
    await asA(`insert into public.sce_tcsk_checkins (event_id, guest_id, checked_in_at, checked_in_by, desk) values ('${eventId}', '${g}', now(), '${A}', 'Bàn 2')`);
    await asA(`update public.sce_tcsk_checkins set gift_given_at = now() where guest_id = '${g}'`);
    // The check-in was made earlier in the day: move it back as the owner, as time would have.
    await db.exec(`update public.sce_tcsk_checkins set checked_in_at = now() - interval '3 hours', gift_given_at = now() - interval '2 hours' where guest_id = '${g}'`);
    const original = await checkinOf(g);

    const token = (await asB(copyAsToken(g))).rows[0]!.id as string;
    await asB(`delete from public.sce_tcsk_checkins where guest_id = '${g}'`);
    expect(await checkinOf(g)).toBeUndefined();

    await asB(`update public.sce_tcsk_checkin_undo_tokens set consumed_at = '2020-01-01T00:00:00Z' where id = '${token}'`);
    const used = (await q(`select consumed_by, consumed_at > now() - interval '1 minute' as fresh from public.sce_tcsk_checkin_undo_tokens where id = '${token}'`)).rows[0];
    expect(used).toEqual({ consumed_by: B, fresh: true });
    await asB(`insert into public.sce_tcsk_checkins (event_id, guest_id, checked_in_at, checked_in_by, desk, gift_given_at)
      select event_id, guest_id, checked_in_at, checked_in_by, desk, gift_given_at from public.sce_tcsk_checkin_undo_tokens where id = '${token}'`);
    expect(await checkinOf(g)).toEqual(original);
    await expect(asB(`update public.sce_tcsk_checkin_undo_tokens set consumed_at = now() where id = '${token}'`)).rejects.toThrow(/already used/);
  });

  it('a token consumed by one desk restores nothing for another', async () => {
    const g = await addGuest('Đỗ Thị Hai');
    await asA(`insert into public.sce_tcsk_checkins (event_id, guest_id, checked_in_at, desk) values ('${eventId}', '${g}', now(), null)`);
    await db.exec(`update public.sce_tcsk_checkins set checked_in_at = now() - interval '1 hour' where guest_id = '${g}'`);
    const token = (await asA(copyAsToken(g))).rows[0]!.id as string;
    await asA(`delete from public.sce_tcsk_checkins where guest_id = '${g}'`);
    await asA(`update public.sce_tcsk_checkin_undo_tokens set consumed_at = now() where id = '${token}'`);
    await expect(asB(`insert into public.sce_tcsk_checkins (event_id, guest_id, checked_in_at, checked_in_by, desk)
      select event_id, guest_id, checked_in_at, checked_in_by, desk from public.sce_tcsk_checkin_undo_tokens where id = '${token}'`)).rejects.toThrow(/signed-in user|current time/);
  });
});
