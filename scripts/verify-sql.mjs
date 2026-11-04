// Applies sql/*.sql twice on PGlite with a minimal Supabase stub (auth schema,
// roles, realtime publication), then exercises RLS and the backup round trip.
// Usage: pnpm verify:sql   (override the PGlite entry with PGLITE_MODULE=/abs/path/to/pglite/dist/index.js)
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const sqlDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');
const db = new PGlite();

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid, status text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on all functions in schema auth to authenticated, anon;
  grant usage on schema public to authenticated, anon;
  create publication supabase_realtime;
`);

const files = readdirSync(sqlDir).filter((f) => /^\d{4,14}_.*\.sql$/.test(f)).sort();
for (const pass of [1, 2]) {
  for (const f of files) {
    try {
      await db.exec(readFileSync(join(sqlDir, f), 'utf8'));
    } catch (e) {
      throw new Error(`pass ${pass} ${f}: ${e.message}`);
    }
  }
}
console.log(`applied ${files.length} migrations twice: idempotent`);

const ids = {
  admin: '00000000-0000-0000-0000-00000000000a',
  xtdt: '00000000-0000-0000-0000-0000000000b1',
  ptdn: '00000000-0000-0000-0000-0000000000b2',
  pending: '00000000-0000-0000-0000-0000000000c1',
  xtdtLead: '00000000-0000-0000-0000-0000000000e1',
  ptdnLead: '00000000-0000-0000-0000-0000000000e2',
  leader: '00000000-0000-0000-0000-0000000000e3',
  backdoor: '00000000-0000-0000-0000-0000000000d1',
};
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values
    ('${ids.admin}', 'admin@x.vn', '{}'),
    ('${ids.xtdt}', 'a@x.vn', '{"department":"Phòng Xúc tiến đầu tư"}'),
    ('${ids.ptdn}', 'b@x.vn', '{"department":"Phòng Phát triển doanh nghiệp"}'),
    ('${ids.pending}', 'c@x.vn', '{}'),
    ('${ids.xtdtLead}', 'tp.xtdt@x.vn', '{"department":"Phòng Xúc tiến đầu tư"}'),
    ('${ids.ptdnLead}', 'tp.ptdn@x.vn', '{"department":"Phòng Phát triển doanh nghiệp"}'),
    ('${ids.leader}', 'bgd@x.vn', '{"department":"Ban Giám đốc"}'),
    ('${ids.backdoor}', 'xadmin@gmail.com', '{"role":"admin"}');
`);
const prof = await db.query(`select email, role, status, department from public.sce_tcsk_profiles order by email`);
assert.ok(prof.rows.every((r) => r.role === 'user' && r.status === 'pending'), 'trigger creates pending users, ignores metadata role');
assert.equal(prof.rows.find((r) => r.email === 'a@x.vn').department, 'Phòng Xúc tiến đầu tư', 'self-registerable department kept');

const boot = await db.query(`select tcsk.bootstrap_first_admin('admin@x.vn') as r`);
assert.equal(boot.rows[0].r, 'ok');
await db.exec(`update public.sce_tcsk_profiles set status = 'active' where email in ('a@x.vn','b@x.vn','tp.xtdt@x.vn','tp.ptdn@x.vn','bgd@x.vn')`);

async function as(user, aal, fn) {
  await db.exec(`set role authenticated`);
  await db.exec(`select set_config('request.jwt.claim.sub', '${user}', false), set_config('request.jwt.claims', '{"sub":"${user}","aal":"${aal}"}', false)`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role`);
  }
}

const ev = await as(ids.xtdt, 'aal1', () =>
  db.query(`insert into public.sce_tcsk_events (name, type, event_date, department) values ('HN XTĐT', 'hoi_nghi', '2026-12-15', 'Phòng Xúc tiến đầu tư') returning id, version`),
);
const eventId = ev.rows[0].id;
assert.equal(ev.rows[0].version, 1);

await assert.rejects(
  as(ids.xtdt, 'aal1', () => db.query(`insert into public.sce_tcsk_events (name, type, event_date, department) values ('x', 'hoi_nghi', '2026-12-15', 'Phòng Phát triển doanh nghiệp')`)),
  /row-level security/,
  'user cannot create an event for another department',
);
const otherSees = await as(ids.ptdn, 'aal1', () => db.query(`select id from public.sce_tcsk_events`));
assert.equal(otherSees.rows.length, 0, 'other department does not see the event');
const pendingSees = await as(ids.pending, 'aal1', () => db.query(`select id from public.sce_tcsk_events`));
assert.equal(pendingSees.rows.length, 0, 'pending user sees nothing');
const adminAal1 = await as(ids.admin, 'aal1', () => db.query(`select id from public.sce_tcsk_events`));
assert.equal(adminAal1.rows.length, 0, 'admin without aal2 is denied');
const adminAal2 = await as(ids.admin, 'aal2', () => db.query(`select id from public.sce_tcsk_events`));
assert.equal(adminAal2.rows.length, 1, 'admin with aal2 sees all');

await as(ids.xtdt, 'aal1', () => db.exec(`update public.sce_tcsk_events set supporting_departments = '{"Phòng Phát triển doanh nghiệp"}' where id = '${eventId}'`));
const g = await as(ids.ptdn, 'aal1', () =>
  db.query(`insert into public.sce_tcsk_guests (event_id, name, guest_group, organization) values ('${eventId}', 'Nguyễn Văn A', 'VIP', 'UBND') returning id, checkin_code`),
);
const guestId = g.rows[0].id;
assert.match(g.rows[0].checkin_code, /^[0-9A-HJKMNP-TV-Z]{6}$/, 'checkin code generated');
await as(ids.ptdn, 'aal1', () =>
  assert.rejects(db.query(`update public.sce_tcsk_events set name = 'hijack' where id = '${eventId}'`).then((r) => {
    if (r.affectedRows === 0) throw new Error('row-level security: 0 rows');
  }), /row-level security/, 'supporting department cannot edit the event row'),
);

await as(ids.ptdn, 'aal1', async () => {
  await db.exec(`insert into public.sce_tcsk_event_halls (event_id, zones) values ('${eventId}', '[{"key":"A","prefix":"A-","seatCount":10}]')`);
  await db.exec(`insert into public.sce_tcsk_seat_assignments (event_id, seat_code, guest_id) values ('${eventId}', 'A-01', '${guestId}')`);
  await assert.rejects(db.exec(`insert into public.sce_tcsk_seat_assignments (event_id, seat_code, guest_id) values ('${eventId}', 'A-02', '${guestId}')`), /duplicate key/, 'one seat per guest');
  await db.exec(`insert into public.sce_tcsk_checkins (event_id, guest_id, checked_in_at) values ('${eventId}', '${guestId}', now())`);
  const roster = await db.query(`select seat_code, checked_in_at is not null as in from public.sce_tcsk_guest_roster`);
  assert.deepEqual(roster.rows, [{ seat_code: 'A-01', in: true }], 'roster view merges owners at read');
  await assert.rejects(db.exec(`insert into public.sce_tcsk_audit_logs (action) values ('forged')`), /permission denied/, 'audit is append-only via function');
  await db.exec(`insert into public.sce_tcsk_incidents (event_id, location, description, urgency) values ('${eventId}', 'Sân khấu', 'Mic', 'high'), ('${eventId}', 'Sân khấu', 'Đèn', 'low')`);
  const seqs = await db.query(`select seq from public.sce_tcsk_incidents order by seq`);
  assert.deepEqual(seqs.rows.map((r) => r.seq), [1, 2], 'incident sequence per event');
});

const cur = (await as(ids.xtdt, 'aal1', () => db.query(`select version from public.sce_tcsk_events where id = '${eventId}'`))).rows[0].version;
const upd = await as(ids.xtdt, 'aal1', () => db.query(`update public.sce_tcsk_events set note = 'v2' where id = '${eventId}' and version = ${cur} returning version`));
assert.equal(upd.rows[0].version, cur + 1, 'version bumps');
const stale = await as(ids.xtdt, 'aal1', () => db.query(`update public.sce_tcsk_events set note = 'stale' where id = '${eventId}' and version = ${cur} returning version`));
assert.equal(stale.rows.length, 0, 'stale version updates nothing (repository reports conflict)');

await assert.rejects(as(ids.xtdt, 'aal1', () => db.query(`select public.sce_tcsk_create_backup('x', 'manual')`)), /forbidden/, 'user cannot create manual backup');
const bk = await as(ids.admin, 'aal2', () => db.query(`select public.sce_tcsk_create_backup('Trước thử nghiệm', 'manual') as id`));
await as(ids.xtdt, 'aal1', () => db.exec(`delete from public.sce_tcsk_guests`));
await as(ids.admin, 'aal1', () => assert.rejects(db.query(`select public.sce_tcsk_restore_backup(${bk.rows[0].id})`), /forbidden/, 'restore needs aal2'));
await as(ids.admin, 'aal2', () => db.query(`select public.sce_tcsk_restore_backup(${bk.rows[0].id})`));
const after = await as(ids.admin, 'aal2', () => db.query(`select g.name, s.seat_code from public.sce_tcsk_guests g join public.sce_tcsk_seat_assignments s on s.guest_id = g.id`));
assert.deepEqual(after.rows, [{ name: 'Nguyễn Văn A', seat_code: 'A-01' }], 'restore brings back guests and seats');

await as(ids.admin, 'aal2', () => assert.rejects(db.query(`select public.sce_tcsk_set_profile_role('${ids.admin}', 'user')`), /last_admin/, 'cannot demote the last admin'));
await as(ids.xtdt, 'aal1', () => assert.rejects(db.query(`select public.sce_tcsk_set_profile_role('${ids.xtdt}', 'admin')`), /forbidden/, 'user cannot self-promote'));
const audit = await as(ids.admin, 'aal2', () => db.query(`select action from public.sce_tcsk_audit_logs order by id`));
assert.ok(audit.rows.some((r) => r.action === 'KHÔI PHỤC SAO LƯU'), 'restore audited');

await as(ids.admin, 'aal2', () =>
  db.exec(`select public.sce_tcsk_set_profile_role('${ids.xtdtLead}', 'dept_leader'), public.sce_tcsk_set_profile_role('${ids.ptdnLead}', 'dept_leader'), public.sce_tcsk_set_profile_role('${ids.leader}', 'leader')`),
);
const softId = (
  await as(ids.xtdtLead, 'aal1', () =>
    db.query(`insert into public.sce_tcsk_events (name, type, event_date, department, supporting_departments) values ('HN xóa thử', 'hoi_nghi', '2026-12-20', 'Phòng Xúc tiến đầu tư', '{"Phòng Phát triển doanh nghiệp"}') returning id`),
  )
).rows[0].id;
await as(ids.xtdtLead, 'aal1', () => db.exec(`insert into public.sce_tcsk_guests (event_id, name, guest_group, organization) values ('${softId}', 'Trần Thị B', 'VIP', 'UBND')`));
const visibleTo = async (user, aal, sql) => (await as(user, aal, () => db.query(sql))).rows.length;
const softEvent = `select id from public.sce_tcsk_events where id = '${softId}'`;
const softGuests = `select id from public.sce_tcsk_guests where event_id = '${softId}'`;

const deleted = await as(ids.xtdtLead, 'aal1', () => db.query(`update public.sce_tcsk_events set deleted_at = now() where id = '${softId}' returning id`));
assert.equal(deleted.rows.length, 1, 'dept_leader of the lead department soft-deletes its event');
assert.equal(await visibleTo(ids.xtdtLead, 'aal1', softEvent), 1, 'dept_leader of the lead department sees its deleted event');
assert.equal(await visibleTo(ids.leader, 'aal2', softEvent), 1, 'leader sees deleted events');
assert.equal(await visibleTo(ids.admin, 'aal2', `select id from public.sce_tcsk_events`), 2, 'admin sees every event, deleted included');
assert.equal(await visibleTo(ids.ptdnLead, 'aal1', softEvent), 0, 'dept_leader of a supporting department does not see the deleted event');
assert.equal(await visibleTo(ids.xtdt, 'aal1', softEvent), 0, 'user of the lead department does not see the deleted event');
assert.equal(await visibleTo(ids.xtdtLead, 'aal1', softGuests), 0, 'children of a deleted event stay hidden from its dept_leader');
assert.equal(await visibleTo(ids.ptdn, 'aal1', softGuests), 0, 'children of a deleted event stay hidden from a supporting department');
assert.equal(await visibleTo(ids.admin, 'aal2', softGuests), 1, 'admin still reads children of a deleted event');

const purge = (user, aal) => as(user, aal, () => db.query(`delete from public.sce_tcsk_events where id = '${softId}' returning id`));
assert.equal((await purge(ids.xtdtLead, 'aal1')).rows.length, 0, 'dept_leader cannot hard-purge');
assert.equal((await purge(ids.leader, 'aal2')).rows.length, 0, 'leader cannot hard-purge');

const restored = await as(ids.xtdtLead, 'aal1', () => db.query(`update public.sce_tcsk_events set deleted_at = null where id = '${softId}' returning deleted_at`));
assert.deepEqual(restored.rows, [{ deleted_at: null }], 'dept_leader of the lead department restores its deleted event');
assert.equal(await visibleTo(ids.ptdn, 'aal1', softGuests), 1, 'children are readable again after restore');

await as(ids.xtdtLead, 'aal1', () => db.exec(`update public.sce_tcsk_events set deleted_at = now() where id = '${softId}'`));
assert.equal((await purge(ids.admin, 'aal2')).rows.length, 1, 'admin hard-purges a deleted event');
assert.equal(await visibleTo(ids.admin, 'aal2', softGuests), 0, 'hard purge cascades to children');

// Core admin functions (202611041000_core_admin_functions.sql).
const settingsVersion = async () => (await db.query(`select version from public.sce_tcsk_system_settings where id = 1`)).rows[0].version;
const v0 = await settingsVersion();
await as(ids.admin, 'aal1', () => assert.rejects(db.query(`select public.sce_tcsk_update_settings(${v0}, '{"guest_quota_percent":150}')`), /forbidden/, 'admin at aal1 cannot edit settings'));
await as(ids.xtdtLead, 'aal1', () => assert.rejects(db.query(`select public.sce_tcsk_update_settings(${v0}, '{"guest_quota_percent":150}')`), /forbidden/, 'dept_leader cannot edit settings'));
const saved = await as(ids.leader, 'aal2', () => db.query(`select public.sce_tcsk_update_settings(${v0}, '{"guest_quota_percent":150,"agency_short_name":" SCE HN "}') as s`));
assert.equal(saved.rows[0].s.guest_quota_percent, 150, 'leader at aal2 saves a typed patch');
assert.equal(saved.rows[0].s.agency_short_name, 'SCE HN', 'text settings are trimmed');
assert.equal(saved.rows[0].s.badge_quota_percent, 120, 'keys outside the patch are kept (core B12)');
assert.equal(saved.rows[0].s.version, v0 + 1, 'settings version bumps');
const staleSettings = await as(ids.admin, 'aal2', () => db.query(`select public.sce_tcsk_update_settings(${v0}, '{"guest_quota_percent":160}') as s`));
assert.equal(staleSettings.rows[0].s, null, 'a stale settings version updates nothing');
await as(ids.admin, 'aal2', () => assert.rejects(db.query(`select public.sce_tcsk_update_settings(${v0 + 1}, '{"guest_quota_percent":250}')`), /check constraint/, 'quota outside 100..200 is refused'));
await as(ids.admin, 'aal2', () => assert.rejects(db.query(`select public.sce_tcsk_update_settings(${v0 + 1}, '{"version":1}')`), /unknown_setting/, 'a patch cannot name other columns'));

const year2028 = `'[{"date":"2028-01-01","name":"Tết Dương lịch"},{"date":"2028-01-26","name":"Tết Nguyên đán"},{"date":"2028-01-29","name":"Làm bù","kind":"compensatory_workday"}]'`;
await as(ids.xtdt, 'aal1', () => assert.rejects(db.query(`select public.sce_tcsk_replace_holidays(2028, ${year2028})`), /forbidden/, 'user cannot edit holidays'));
await as(ids.admin, 'aal1', () => assert.rejects(db.query(`select public.sce_tcsk_replace_holidays(2028, ${year2028})`), /forbidden/, 'admin at aal1 cannot edit holidays'));
const holidays2028 = () => db.query(`select holiday_date::text as d, name, kind from public.sce_tcsk_holidays where holiday_date between '2028-01-01' and '2028-12-31' order by 1`);
await as(ids.leader, 'aal2', () => db.query(`select public.sce_tcsk_replace_holidays(2028, ${year2028})`));
const once = (await holidays2028()).rows;
await as(ids.leader, 'aal2', () => db.query(`select public.sce_tcsk_replace_holidays(2028, ${year2028})`));
const replaced = await as(ids.leader, 'aal2', () => db.query(`select public.sce_tcsk_replace_holidays(2028, ${year2028}) as prev`));
assert.deepEqual(replaced.rows[0].prev.map((h) => h.date), ['2028-01-01', '2028-01-26', '2028-01-29'], 'replace returns the rows it replaced');
assert.deepEqual((await holidays2028()).rows, once, 'replacing a year twice with the same list converges');
assert.equal(once.length, 3, 'the fixed-date 2028 rows are replaced by the given list');
assert.equal((await db.query(`select count(*)::int as n from public.sce_tcsk_holidays where holiday_date between '2027-01-01' and '2027-12-31'`)).rows[0].n, 4, 'other years are untouched');
await as(ids.leader, 'aal2', () => assert.rejects(db.query(`select public.sce_tcsk_replace_holidays(2028, '[{"date":"2029-01-01","name":"x"}]')`), /holiday_outside_year/, 'a date outside the year is refused'));
await as(ids.leader, 'aal2', () => assert.rejects(db.query(`select public.sce_tcsk_replace_holidays(2028, '[{"date":"2028-05-01","name":"a"},{"date":"2028-05-01","name":"b"}]')`), /duplicate key/, 'one row per date'));
assert.deepEqual((await holidays2028()).rows, once, 'a refused replace leaves the year as it was');

const xss = `<img src=x onerror=alert(1)>`;
const named = await as(ids.xtdt, 'aal1', () => db.query(`select public.sce_tcsk_update_profile_name('  ${xss}   Nguyễn  ') as p`));
assert.equal(named.rows[0].p.fullname, `${xss} Nguyễn`, 'profile name is stored as text, whitespace collapsed');
await as(ids.pending, 'aal1', () => assert.rejects(db.query(`select public.sce_tcsk_update_profile_name('Tên mới')`), /forbidden/, 'pending user cannot rename'));
await as(ids.xtdt, 'aal1', () => assert.rejects(db.query(`select public.sce_tcsk_update_profile_name('   ')`), /invalid_fullname/, 'empty name refused'));
await as(ids.xtdt, 'aal1', () => assert.rejects(db.query(`update public.sce_tcsk_profiles set role = 'admin' where id = '${ids.xtdt}'`), /permission denied/, 'a user cannot write its own role'));

const listed = async (user, aal) => (await as(user, aal, () => db.query(`select email from public.sce_tcsk_list_profiles()`))).rows.map((r) => r.email).sort();
assert.deepEqual(await listed(ids.xtdt, 'aal1'), ['a@x.vn'], 'a user lists only itself');
assert.deepEqual(await listed(ids.xtdtLead, 'aal1'), ['a@x.vn', 'tp.xtdt@x.vn'], 'a dept_leader lists its own department');
assert.equal((await listed(ids.leader, 'aal2')).length, 8, 'leader lists every profile');
assert.deepEqual(await listed(ids.admin, 'aal1'), ['admin@x.vn'], 'admin at aal1 lists only itself');

await as(ids.admin, 'aal2', () => db.exec(`select public.sce_tcsk_set_profile_role('${ids.ptdnLead}', 'admin')`));
await as(ids.ptdnLead, 'aal2', () => db.exec(`select public.sce_tcsk_set_profile_status(array['${ids.admin}']::uuid[], 'locked')`));
await as(ids.ptdnLead, 'aal2', () => assert.rejects(db.query(`select public.sce_tcsk_set_profile_role('${ids.ptdnLead}', 'user')`), /last_admin/, 'the last active admin cannot step down'));
await as(ids.ptdnLead, 'aal2', () => assert.rejects(db.query(`select public.sce_tcsk_set_profile_status(array['${ids.ptdnLead}']::uuid[], 'locked')`), /cannot_lock_self/, 'an admin cannot lock itself'));
await as(ids.ptdnLead, 'aal2', () => db.exec(`select public.sce_tcsk_set_profile_status(array['${ids.admin}']::uuid[], 'active')`));
await as(ids.admin, 'aal2', () => db.exec(`select public.sce_tcsk_set_profile_role('${ids.ptdnLead}', 'dept_leader')`));

await as(ids.admin, 'aal2', () => db.exec(`update public.sce_tcsk_events set name = 'Trước sao lưu' where id = '${eventId}'`));
const roundTrip = await as(ids.admin, 'aal2', () => db.query(`select public.sce_tcsk_create_backup('Vòng khôi phục', 'manual') as id`));
const rtId = roundTrip.rows[0].id;
await as(ids.admin, 'aal2', async () => {
  await db.exec(`update public.sce_tcsk_events set name = 'Sau sao lưu' where id = '${eventId}'`);
  await db.exec(`select public.sce_tcsk_update_settings((select version from public.sce_tcsk_system_settings), '{"guest_quota_percent":170}')`);
  await db.exec(`select public.sce_tcsk_replace_holidays(2028, '[]')`);
});
const backupsBefore = (await as(ids.admin, 'aal2', () => db.query(`select id from public.sce_tcsk_list_backups(200)`))).rows.length;
await as(ids.leader, 'aal2', () => assert.rejects(db.query(`select public.sce_tcsk_restore_backup(${rtId})`), /forbidden/, 'leader cannot restore'));
await as(ids.admin, 'aal2', () => db.query(`select public.sce_tcsk_restore_backup(${rtId})`));
const back = await as(ids.admin, 'aal2', () => db.query(`select (select name from public.sce_tcsk_events where id = '${eventId}') as name, (select guest_quota_percent from public.sce_tcsk_system_settings) as quota, (select count(*)::int from public.sce_tcsk_holidays where holiday_date between '2028-01-01' and '2028-12-31') as h2028`));
assert.deepEqual(back.rows[0], { name: 'Trước sao lưu', quota: 150, h2028: 3 }, 'restore round trip brings back events, settings and holidays');
const backupsAfter = await as(ids.admin, 'aal2', () => db.query(`select note, created_by_email from public.sce_tcsk_list_backups(200)`));
assert.equal(backupsAfter.rows.length, backupsBefore + 1, 'restore takes one snapshot first');
assert.equal(backupsAfter.rows[0].note, `Trước khi khôi phục #${rtId}`, 'the pre-restore snapshot is the newest and says so');
assert.equal(backupsAfter.rows[0].created_by_email, 'admin@x.vn', 'the snapshot names who restored');
await as(ids.xtdtLead, 'aal1', () => assert.rejects(db.query(`select public.sce_tcsk_list_backups(10)`).then((r) => { if (r.rows.length === 0) throw new Error('row-level security: 0 rows'); }), /row-level security/, 'dept_leader sees no backups'));
await as(ids.leader, 'aal2', () => assert.rejects(db.query(`select data from public.sce_tcsk_backups`), /permission denied/, 'backup data is not readable directly'));
const exported = await as(ids.leader, 'aal2', () => db.query(`select public.sce_tcsk_backup_data(${rtId}) as d`));
assert.ok(exported.rows[0].d['public.sce_tcsk_events'] ?? exported.rows[0].d.sce_tcsk_events, 'leader downloads a snapshot');
await as(ids.xtdt, 'aal1', () => assert.rejects(db.query(`select public.sce_tcsk_backup_data(${rtId})`), /forbidden/, 'user cannot download a snapshot'));

const auditRows = (user, aal, args) => as(user, aal, () => db.query(`select id, action, actor_email from public.sce_tcsk_list_audit(${args})`));
const page1 = (await auditRows(ids.leader, 'aal2', `lim => 3`)).rows;
assert.equal(page1.length, 3, 'audit pages by limit');
const page2 = (await auditRows(ids.leader, 'aal2', `before_id => ${page1[2].id}, lim => 3`)).rows;
assert.ok(page2.every((r) => r.id < page1[2].id), 'the next page starts below the cursor');
assert.ok((await auditRows(ids.leader, 'aal2', `filter_action => 'TẢI BẢN SAO LƯU'`)).rows.every((r) => r.action === 'TẢI BẢN SAO LƯU'), 'audit filters by action');
assert.equal((await auditRows(ids.leader, 'aal2', `filter_action => 'TẢI BẢN SAO LƯU'`)).rows.length, 1, 'a snapshot download is audited');
assert.ok((await auditRows(ids.leader, 'aal2', `filter_actor => 'bgd@'`)).rows.every((r) => r.actor_email === 'bgd@x.vn'), 'audit filters by actor');
assert.equal((await auditRows(ids.leader, 'aal2', `filter_actor => '%'`)).rows.length, 0, 'a wildcard in the actor filter is literal');
assert.equal((await auditRows(ids.xtdtLead, 'aal1', `lim => 10`)).rows.length, 0, 'dept_leader reads no audit rows');
const facets = (await as(ids.leader, 'aal2', () => db.query(`select public.sce_tcsk_audit_facets() as f`))).rows[0].f;
assert.ok(facets.actions.includes('KHÔI PHỤC SAO LƯU') && facets.entities.includes('backup'), 'audit facets list actions and entities');
assert.deepEqual((await as(ids.xtdt, 'aal1', () => db.query(`select public.sce_tcsk_audit_facets() as f`))).rows[0].f, { actions: [], entities: [] }, 'a user gets no facets');
await as(ids.admin, 'aal2', async () => {
  await assert.rejects(db.exec(`update public.sce_tcsk_audit_logs set summary = 'sửa'`), /permission denied/, 'admin cannot edit audit rows');
  await assert.rejects(db.exec(`delete from public.sce_tcsk_audit_logs`), /permission denied/, 'admin cannot delete audit rows');
});

console.log('all RLS and function checks passed');
