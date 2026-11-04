// @vitest-environment node
// The reports tables on real Postgres (PGlite with the same Supabase stub as
// scripts/verify-sql.mjs): RLS from the generated permission matrix, the
// immutable issued report, and the server-side stamp of the issue migration.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import type { IsoDate } from '@/core/brand';
import { addCalendarDays, buildWorkCalendar, type Holiday } from '@/core/dates';
import { foldVi } from '@/core/text';
import { DEPARTMENTS } from '@/core/vocab';
import { workdaysToEvent } from '../domain/figures';
import { signerTitle } from '../domain/report';

const dir = join(process.cwd(), 'supabase', 'migrations');
const db = new PGlite();
const ids = {
  admin: '00000000-0000-0000-0000-00000000000a',
  staff: '00000000-0000-0000-0000-0000000000b1',
  head: '00000000-0000-0000-0000-0000000000e1',
  otherHead: '00000000-0000-0000-0000-0000000000e2',
  lockedHead: '00000000-0000-0000-0000-0000000000e3',
  pendingHead: '00000000-0000-0000-0000-0000000000e4',
};
let eventId = '';
/** Led by XTĐT, with PTDN supporting. */
let supportedId = '';

async function as<T>(user: string, aal: 'aal1' | 'aal2', fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated`);
  await db.exec(`select set_config('request.jwt.claim.sub', '${user}', false), set_config('request.jwt.claims', '{"sub":"${user}","aal":"${aal}"}', false)`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role`);
  }
}
type Stored = { report_date: string; issued_by: string; issued_at: string; event_name: string; event_date: string; signatory_title: string; workdays_to_event: number };
/** What a PostgREST caller could send: a backdated, forged row. */
const insertReport = (date = '2020-01-01', issuedBy = ids.admin, event = () => eventId) =>
  db.query<Stored>(
    `insert into public.sce_tcsk_daily_reports (event_id, report_date, workdays_to_event, progress_percent, issued_by, issued_at, figures, event_name, event_date, signatory_title)
     values ('${event()}', '${date}', -99, 29, '${issuedBy}', '2020-01-01T00:00:00Z', '{"progressPercent":29}', 'Sự kiện bịa', '1999-01-01', 'GIÁM ĐỐC')
     returning report_date::text, issued_by::text, issued_at::text, event_name, event_date::text, signatory_title, workdays_to_event`,
  );
async function calendarInDb() {
  const rows = await db.query<{ date: IsoDate; name: string; kind: Holiday['kind'] }>(`select holiday_date::text as date, name, kind from public.sce_tcsk_holidays`);
  return buildWorkCalendar(rows.rows);
}

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
      ('${ids.otherHead}', 'tp.ptdn@x.vn', '{"department":"Phòng Phát triển doanh nghiệp"}'),
      ('${ids.lockedHead}', 'khoa.xtdt@x.vn', '{"department":"Phòng Xúc tiến đầu tư"}'),
      ('${ids.pendingHead}', 'cho.xtdt@x.vn', '{"department":"Phòng Xúc tiến đầu tư"}');
  `);
  await db.query(`select tcsk.bootstrap_first_admin('admin@x.vn')`);
  await db.exec(`update public.sce_tcsk_profiles set status = 'active' where id <> '${ids.admin}'`);
  await db.exec(`update public.sce_tcsk_profiles set role = 'dept_leader' where id in ('${ids.head}', '${ids.otherHead}', '${ids.lockedHead}', '${ids.pendingHead}')`);
  await db.exec(`update public.sce_tcsk_profiles set status = 'locked' where id = '${ids.lockedHead}'`);
  await db.exec(`update public.sce_tcsk_profiles set status = 'pending' where id = '${ids.pendingHead}'`);
  const ev = await as(ids.staff, 'aal1', () =>
    db.query<{ id: string }>(`insert into public.sce_tcsk_events (name, type, event_date, department) values ('HN XTĐT', 'hoi_nghi', '2026-12-15', 'Phòng Xúc tiến đầu tư') returning id`),
  );
  eventId = ev.rows[0]!.id;
  const supported = await as(ids.staff, 'aal1', () =>
    db.query<{ id: string }>(
      `insert into public.sce_tcsk_events (name, type, event_date, department, supporting_departments) values ('HN phối hợp', 'hoi_nghi', '2026-12-13', 'Phòng Xúc tiến đầu tư', '{"Phòng Phát triển doanh nghiệp"}') returning id`,
    ),
  );
  supportedId = supported.rows[0]!.id;
}, 60_000);

describe('sce_tcsk_daily_reports on Postgres', () => {
  it('a chuyên viên cannot issue (reports.issue is none for user)', async () => {
    await expect(as(ids.staff, 'aal1', () => insertReport())).rejects.toThrow(/row-level security/);
  });

  it('the head of another department cannot issue for this event', async () => {
    await expect(as(ids.otherHead, 'aal1', () => insertReport())).rejects.toThrow(/row-level security|forbidden/);
  });

  it('the department head issues; the date, the time, the issuer, the event, the signer title and T-n are the server\'s, whatever the row says', async () => {
    const r = await as(ids.head, 'aal1', () => insertReport('2020-01-01', ids.admin));
    const today = (await db.query<{ d: IsoDate }>(`select ((now() at time zone 'Asia/Ho_Chi_Minh')::date)::text as d`)).rows[0]!.d;
    expect(r.rows[0]).toMatchObject({
      report_date: today, issued_by: ids.head, event_name: 'HN XTĐT', event_date: '2026-12-15', signatory_title: 'TRƯỞNG PHÒNG XÚC TIẾN ĐẦU TƯ',
      workdays_to_event: workdaysToEvent(await calendarInDb(), '2026-12-15' as IsoDate, today),
    });
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

describe('only the lead department issues (decision 17)', () => {
  const forSupported = () => supportedId;

  it('the head of a supporting department cannot issue, though the department edits the event\'s clippings', async () => {
    await expect(as(ids.otherHead, 'aal1', () => insertReport(undefined, undefined, forSupported))).rejects.toThrow(/row-level security|forbidden/);
    await as(ids.otherHead, 'aal1', () =>
      db.exec(`insert into public.sce_tcsk_media_clippings (event_id, outlet, title, published_on, media_type) values ('${supportedId}', 'A', 'B', '2026-12-01', 'Báo in')`),
    );
  });

  it('a locked or a pending department head of the lead department cannot issue', async () => {
    await expect(as(ids.lockedHead, 'aal1', () => insertReport(undefined, undefined, forSupported))).rejects.toThrow(/row-level security|forbidden/);
    await expect(as(ids.pendingHead, 'aal1', () => insertReport(undefined, undefined, forSupported))).rejects.toThrow(/row-level security|forbidden/);
  });

  it('the lead department head issues it, signed with the lead department\'s title', async () => {
    const r = await as(ids.head, 'aal1', () => insertReport(undefined, undefined, forSupported));
    expect(r.rows[0]).toMatchObject({ event_name: 'HN phối hợp', signatory_title: 'TRƯỞNG PHÒNG XÚC TIẾN ĐẦU TƯ' });
  });
});

describe('what the issue trigger derives counts as the app does', () => {
  const sqlWorkdays = async (t0: string, today: string) =>
    (await db.query<{ n: number }>(`select tcsk.reports_workdays_to_event('${t0}', '${today}') as n`)).rows[0]!.n;

  it('T-n by hand on the seeded holidays: T-5, a Sunday T0, the 30/04 and 01/05 holidays, event day and after', async () => {
    expect(await sqlWorkdays('2026-12-15', '2026-12-08')).toBe(5);
    expect(await sqlWorkdays('2026-12-13', '2026-12-11')).toBe(1);
    expect(await sqlWorkdays('2026-12-13', '2026-12-12')).toBe(0);
    expect(await sqlWorkdays('2026-05-05', '2026-04-28')).toBe(3);
    expect(await sqlWorkdays('2026-12-15', '2026-12-15')).toBe(0);
    expect(await sqlWorkdays('2026-04-28', '2026-05-05')).toBe(-3);
  });

  it('T-n equals workdaysToEvent for every day from 40 before to 5 after six T0s, a compensatory Saturday included', async () => {
    await db.exec(`insert into public.sce_tcsk_holidays (holiday_date, name, kind) values ('2026-11-28', 'Làm bù', 'compensatory_workday') on conflict do nothing`);
    const cal = await calendarInDb();
    for (const t0 of ['2026-12-15', '2026-12-13', '2026-12-12', '2026-09-02', '2026-05-04', '2026-05-01'] as IsoDate[]) {
      const rows = await db.query<{ today: IsoDate; n: number }>(
        `select d::date::text as today, tcsk.reports_workdays_to_event('${t0}', d::date) as n from generate_series('${t0}'::date - 40, '${t0}'::date + 5, interval '1 day') d`,
      );
      expect(rows.rows.map((r) => r.n)).toEqual(rows.rows.map((r) => workdaysToEvent(cal, t0, r.today)));
      expect(rows.rows[0]!.today).toBe(addCalendarDays(t0, -40));
    }
    await db.exec(`delete from public.sce_tcsk_holidays where holiday_date = '2026-11-28'`);
  });

  it('the signer title equals signerTitle for every department and a blank one', async () => {
    const names = [...DEPARTMENTS.map((d) => d.name), '', 'Ban Tổ chức'];
    for (const name of names) {
      const r = await db.query<{ t: string }>(`select tcsk.reports_signer_title($1) as t`, [name]);
      expect(r.rows[0]!.t).toBe(signerTitle(name));
    }
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

  it('a package code is unique per event whatever its tone marks, as the command folds it (L11)', async () => {
    const insert = (code: string) =>
      as(ids.staff, 'aal1', () =>
        db.exec(`insert into public.sce_tcsk_bidding_packages (event_id, code, name, department, budget_vnd, status) values ('${eventId}', '${code}', 'Gói', 'Phòng Hành chính - Tổ chức', 100, 'Đang thẩm định hồ sơ')`),
      );
    await insert('GÓI-ĐẦU-TƯ 1');
    await expect(insert('goi-dau-tu  1')).rejects.toThrow(/duplicate key/);
    await expect(insert(' Gói-Đầu-Tư 1 ')).rejects.toThrow(/duplicate key/);
  });

  it('the database folds a code exactly as foldVi does', async () => {
    const codes = ['TB-2026-001', 'GÓI-ĐẦU-TƯ 1', 'Gói  thầu   ƯỚC', 'ẮẰẲẴẶẤẦẨẪẬ ÉÈẺẼẸẾỀỂỄỆ ÍÌỈĨỊ ÓÒỎÕỌỐỒỔỖỘỚỜỞỠỢ ÚÙỦŨỤỨỪỬỮỰ ÝỲỶỸỴ Đđ', 'Gói\u0301 NFD'.normalize('NFD')];
    for (const code of codes) {
      const r = await db.query<{ k: string }>(`select tcsk.reports_code_key($1) as k`, [code]);
      expect(r.rows[0]!.k).toBe(foldVi(code));
    }
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
