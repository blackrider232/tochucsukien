// @vitest-environment node
// The reports tables on real Postgres (PGlite with the same Supabase stub as
// scripts/verify-sql.mjs): RLS from the generated permission matrix, the
// immutable issued report, and the server-side stamp of the issue migration.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const dir = join(process.cwd(), 'supabase', 'migrations');
const db = new PGlite();
const ids = {
  admin: '00000000-0000-0000-0000-00000000000a',
  staff: '00000000-0000-0000-0000-0000000000b1',
  head: '00000000-0000-0000-0000-0000000000e1',
  otherHead: '00000000-0000-0000-0000-0000000000e2',
};
let eventId = '';

async function as<T>(user: string, aal: 'aal1' | 'aal2', fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated`);
  await db.exec(`select set_config('request.jwt.claim.sub', '${user}', false), set_config('request.jwt.claims', '{"sub":"${user}","aal":"${aal}"}', false)`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role`);
  }
}
const insertReport = (date = '2020-01-01', issuedBy = ids.admin) =>
  db.query<{ report_date: string; issued_by: string; issued_at: string }>(
    `insert into public.sce_tcsk_daily_reports (event_id, report_date, workdays_to_event, progress_percent, issued_by, issued_at, figures)
     values ('${eventId}', '${date}', 5, 29, '${issuedBy}', '2020-01-01T00:00:00Z', '{"progressPercent":29}') returning report_date::text, issued_by::text, issued_at::text`,
  );

beforeAll(async () => {
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
  const files = readdirSync(dir).filter((f) => /^\d{4,14}_.*\.sql$/.test(f)).sort();
  for (let pass = 0; pass < 2; pass++) for (const f of files) await db.exec(readFileSync(join(dir, f), 'utf8'));
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${ids.admin}', 'admin@x.vn', '{}'),
      ('${ids.staff}', 'cv.xtdt@x.vn', '{"department":"Phòng Xúc tiến đầu tư"}'),
      ('${ids.head}', 'tp.xtdt@x.vn', '{"department":"Phòng Xúc tiến đầu tư"}'),
      ('${ids.otherHead}', 'tp.ptdn@x.vn', '{"department":"Phòng Phát triển doanh nghiệp"}');
  `);
  await db.query(`select tcsk.bootstrap_first_admin('admin@x.vn')`);
  await db.exec(`update public.sce_tcsk_profiles set status = 'active' where id <> '${ids.admin}'`);
  await db.exec(`update public.sce_tcsk_profiles set role = 'dept_leader' where id in ('${ids.head}', '${ids.otherHead}')`);
  const ev = await as(ids.staff, 'aal1', () =>
    db.query<{ id: string }>(`insert into public.sce_tcsk_events (name, type, event_date, department) values ('HN XTĐT', 'hoi_nghi', '2026-12-15', 'Phòng Xúc tiến đầu tư') returning id`),
  );
  eventId = ev.rows[0]!.id;
}, 60_000);

describe('sce_tcsk_daily_reports on Postgres', () => {
  it('a chuyên viên cannot issue (reports.issue is none for user)', async () => {
    await expect(as(ids.staff, 'aal1', () => insertReport())).rejects.toThrow(/row-level security/);
  });

  it('the head of another department cannot issue for this event', async () => {
    await expect(as(ids.otherHead, 'aal1', () => insertReport())).rejects.toThrow(/row-level security/);
  });

  it('the department head issues; the date, the time and the issuer are the server\'s, whatever the row says', async () => {
    const r = await as(ids.head, 'aal1', () => insertReport('2020-01-01', ids.admin));
    const today = await db.query<{ d: string }>(`select ((now() at time zone 'Asia/Ho_Chi_Minh')::date)::text as d`);
    expect(r.rows[0]).toMatchObject({ report_date: today.rows[0]!.d, issued_by: ids.head });
    expect(r.rows[0]!.issued_at.startsWith('2020')).toBe(false);
  });

  it('one report per event and day', async () => {
    await expect(as(ids.head, 'aal1', () => insertReport())).rejects.toThrow(/duplicate key/);
  });

  it('an issued report cannot be edited or deleted, even by its issuer', async () => {
    const updated = await as(ids.head, 'aal1', () => db.query(`update public.sce_tcsk_daily_reports set key_highlight = 'sửa' where event_id = '${eventId}'`));
    const deleted = await as(ids.head, 'aal1', () => db.query(`delete from public.sce_tcsk_daily_reports where event_id = '${eventId}'`));
    expect([updated.affectedRows, deleted.affectedRows]).toEqual([0, 0]);
    const rows = await db.query<{ key_highlight: string }>(`select key_highlight from public.sce_tcsk_daily_reports`);
    expect(rows.rows).toEqual([{ key_highlight: '' }]);
  });

  it('the department reads its report; another department reads nothing', async () => {
    const own = await as(ids.staff, 'aal1', () => db.query(`select id from public.sce_tcsk_daily_reports`));
    const other = await as(ids.otherHead, 'aal1', () => db.query(`select id from public.sce_tcsk_daily_reports`));
    expect([own.rows.length, other.rows.length]).toEqual([1, 0]);
  });
});

describe('editable report tables on Postgres', () => {
  it('a package code is unique per event whatever its case', async () => {
    await as(ids.staff, 'aal1', () =>
      db.exec(`insert into public.sce_tcsk_bidding_packages (event_id, code, name, department, budget_vnd, status) values ('${eventId}', 'TB-1', 'Gói', 'Phòng Hành chính - Tổ chức', 100, 'Đang thẩm định hồ sơ')`),
    );
    await expect(
      as(ids.staff, 'aal1', () =>
        db.exec(`insert into public.sce_tcsk_bidding_packages (event_id, code, name, department, budget_vnd, status) values ('${eventId}', 'tb-1', 'Gói 2', 'Phòng Hành chính - Tổ chức', 100, 'Đang thẩm định hồ sơ')`),
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it('refuses a status or a clipping type outside the contract, and a javascript: link', async () => {
    await expect(
      as(ids.staff, 'aal1', () =>
        db.exec(`insert into public.sce_tcsk_bidding_packages (event_id, code, name, department, budget_vnd, status) values ('${eventId}', 'TB-2', 'Gói', 'Phòng Hành chính - Tổ chức', 100, 'Xong')`),
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      as(ids.staff, 'aal1', () => db.exec(`insert into public.sce_tcsk_media_clippings (event_id, outlet, title, published_on, media_type) values ('${eventId}', 'A', 'B', '2026-12-01', 'Tạp chí')`)),
    ).rejects.toThrow(/check constraint/);
    await expect(
      as(ids.staff, 'aal1', () =>
        db.exec(`insert into public.sce_tcsk_media_clippings (event_id, outlet, title, published_on, media_type, url) values ('${eventId}', 'A', 'B', '2026-12-01', 'Báo in', 'javascript:alert(1)')`),
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it('another department cannot write the event\'s clippings', async () => {
    await expect(
      as(ids.otherHead, 'aal1', () => db.exec(`insert into public.sce_tcsk_media_clippings (event_id, outlet, title, published_on, media_type) values ('${eventId}', 'A', 'B', '2026-12-01', 'Báo in')`)),
    ).rejects.toThrow(/row-level security/);
  });
});
