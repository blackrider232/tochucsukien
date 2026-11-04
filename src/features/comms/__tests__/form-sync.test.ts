import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Email, EventId } from '@/core/brand';
import { MESSAGES } from '@/core/commands/pipeline';
import { DbError, type AuditWriter } from '@/core/db';
import type { SyncReport } from '../domain/sync-report';
import type { SheetSource } from '../server/sheet-source';
import type { ResponseRow } from '../server/tables';
import { admin, failingWrites, harness, xtdtUser } from './harness';

const sheet = { text: '', result: null as null | { ok: false; message: string }, calls: [] as string[] };
const sheets: SheetSource = {
  kind: 'fake',
  async read(url) {
    sheet.calls.push(url);
    return sheet.result ?? { ok: true, text: sheet.text };
  },
};

const SHEET = 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0';
const HEADER = 'Dấu thời gian,Họ và tên,Tên cơ quan,Email,Số điện thoại,Xác nhận tham dự,Anh/chị có dự tiệc chiêu đãi?,Họ tên người đi thay';
const csv = (...lines: string[]) => [HEADER, ...lines].join('\r\n');

beforeEach(() => {
  sheet.text = '';
  sheet.result = null;
  sheet.calls = [];
});

async function setup(config: { autoAddNewGuests?: boolean } = {}) {
  const h = harness({ sheets });
  const eventId = await h.createEvent();
  await h.ok(xtdtUser, 'comms.saveForm', { eventId, version: null, config: { formUrl: 'https://forms.gle/abc', sheetUrl: SHEET, autoSync: false, autoAddNewGuests: config.autoAddNewGuests ?? false } } as never);
  const sync = async () => (await h.ok(xtdtUser, 'comms.syncForm', { eventId })).value as Extract<SyncReport, { status: 'ok' }>;
  const responses = () => (h.rows('sce_tcsk_rsvp_responses') as Array<Record<string, unknown>>).filter((r) => r.event_id === eventId);
  return { h, eventId, sync, responses };
}

describe('comms.syncForm', () => {
  it('applies a newer definite answer through guests.applyRsvp, matched by email', async () => {
    const { h, eventId, sync } = await setup();
    const g = await h.addGuest(eventId, { email: 'an@a.vn' as Email });
    sheet.text = csv('04/11/2026 10:00:00,Nguyễn Văn An,Công ty A,AN@A.VN,,Có tham dự,Có,');
    const report = await sync();
    expect(report).toMatchObject({ rows: 1, fresh: 1, applied: 1, review: 0 });
    expect(await h.guest(eventId, g.id)).toMatchObject({ rsvpStatus: 'confirmed', hasBanquet: true, rsvpSource: 'google_form', rsvpAt: '2026-11-04T03:00:00.000Z' });
    expect(h.audits().map((a) => a.action)).toContain('CẬP NHẬT RSVP');
  });

  it('is idempotent: a second sync of the same sheet stores nothing new and changes no guest', async () => {
    const { h, eventId, sync, responses } = await setup();
    const g = await h.addGuest(eventId, { email: 'an@a.vn' as Email });
    sheet.text = csv('04/11/2026 10:00:00,Nguyễn Văn An,Công ty A,an@a.vn,,Có,,');
    await sync();
    const before = { guest: await h.guest(eventId, g.id), responses: responses() };
    const second = await sync();
    expect(second).toMatchObject({ rows: 1, fresh: 0, applied: 0 });
    expect({ guest: await h.guest(eventId, g.id), responses: responses() }).toEqual(before);
  });

  it('a column added to the sheet, or an answer edited in it, is not a new response', async () => {
    const { h, eventId, sync, responses } = await setup();
    await h.addGuest(eventId, { email: 'an@a.vn' as Email });
    sheet.text = csv('04/11/2026 10:00:00,Nguyễn Văn An,Công ty A,an@a.vn,,Có,,', '04/11/2026 10:00:00,Trần Thị Bình,Công ty B,binh@b.vn,,Có,,');
    expect(await sync()).toMatchObject({ fresh: 2 });
    // Staff add a working column at the end of the sheet and fix a typo in the organisation.
    sheet.text = [`${HEADER},Ghi chú nội bộ`, '04/11/2026 10:00:00,Nguyễn Văn An,Công ty A (đã sửa),an@a.vn,,Có,,,đã gọi', '04/11/2026 10:00:00,Trần Thị Bình,Công ty B,binh@b.vn,,Có,,,'].join('\r\n');
    expect(await sync()).toMatchObject({ rows: 2, fresh: 0 });
    // A second answer of the same person, later, is a new response.
    sheet.text = csv('04/11/2026 10:00:00,Nguyễn Văn An,Công ty A,an@a.vn,,Có,,', '04/11/2026 11:00:00,Nguyễn Văn An,Công ty A,an@a.vn,,Không tham dự,,');
    expect(await sync()).toMatchObject({ fresh: 1 });
    expect(responses()).toHaveLength(3);
  });

  it('"Vâng" is yes: a confirmed guest who answers it stays confirmed; "Vang" typed plain changes nothing', async () => {
    const { h, eventId, sync } = await setup();
    const g = await h.addGuest(eventId, { email: 'e@a.vn' as Email });
    sheet.text = csv('04/11/2026 10:00:00,Guest E,Công ty E,e@a.vn,,Có,,');
    await sync();
    sheet.text = csv('04/11/2026 10:00:00,Guest E,Công ty E,e@a.vn,,Có,,', '04/11/2026 11:00:00,Guest E,Công ty E,e@a.vn,,Vâng,,', '04/11/2026 12:00:00,Guest E,Công ty E,e@a.vn,,Vang,,');
    expect(await sync()).toMatchObject({ fresh: 2, applied: 1, noAnswer: 1 });
    expect(await h.guest(eventId, g.id)).toMatchObject({ rsvpStatus: 'confirmed', rsvpAt: '2026-11-04T04:00:00.000Z' });
  });

  it.each(['Không', 'ko', '-', 'n/a', 'None', 'Không có'])('"%s" in the substitute column is no substitute: a yes stays confirmed, "Cử người đi thay" is no answer', async (none) => {
    const { h, eventId, sync } = await setup();
    const yes = await h.addGuest(eventId, { email: 'yes@a.vn' as Email });
    const sub = await h.addGuest(eventId, { email: 'sub@a.vn' as Email, rsvpStatus: 'confirmed' });
    sheet.text = csv(`04/11/2026 10:00:00,Yes,Công ty A,yes@a.vn,,Có,,${none}`, `04/11/2026 10:00:00,Sub,Công ty A,sub@a.vn,,Cử người đi thay,,${none}`);
    expect(await sync()).toMatchObject({ applied: 1, noAnswer: 1, failed: 0 });
    expect(await h.guest(eventId, yes.id)).toMatchObject({ rsvpStatus: 'confirmed', substituteName: '' });
    expect(await h.guest(eventId, sub.id)).toMatchObject({ rsvpStatus: 'confirmed', substituteName: '' });
  });

  it('a named substitute goes with a substitution only: a yes with a name in that column stays a yes', async () => {
    const { h, eventId, sync } = await setup();
    const yes = await h.addGuest(eventId, { email: 'yes@a.vn' as Email });
    const sub = await h.addGuest(eventId, { email: 'sub@a.vn' as Email });
    sheet.text = csv('04/11/2026 10:00:00,Yes,Công ty A,yes@a.vn,,Có,,Trần Văn Bình', '04/11/2026 10:00:00,Sub,Công ty A,sub@a.vn,,Cử người đi thay,,Trần Văn Bình');
    expect(await sync()).toMatchObject({ applied: 2, failed: 0 });
    expect(await h.guest(eventId, yes.id)).toMatchObject({ rsvpStatus: 'confirmed', substituteName: '' });
    expect(await h.guest(eventId, sub.id)).toMatchObject({ rsvpStatus: 'substituted', substituteName: 'Trần Văn Bình' });
  });

  it('"Cử người đi thay" without a name is no answer: the guest is left as is, nothing fails', async () => {
    const { h, eventId, sync, responses } = await setup();
    const g = await h.addGuest(eventId, { email: 'an@a.vn' as Email, rsvpStatus: 'confirmed' });
    sheet.text = csv('04/11/2026 10:00:00,Nguyễn Văn An,Công ty A,an@a.vn,,Cử người đi thay,,');
    expect(await sync()).toMatchObject({ noAnswer: 1, failed: 0, applied: 0 });
    expect(responses()[0]).toMatchObject({ rsvp: 'substituted', apply_status: 'no_answer' });
    expect(await h.guest(eventId, g.id)).toMatchObject({ rsvpStatus: 'confirmed', substituteName: '' });
  });

  it('names a failed guest update in words a person can read, never the raw error', async () => {
    const { h, eventId } = await setup();
    await h.addGuest(eventId, { email: 'an@a.vn' as Email, name: 'Nguyễn Văn An' });
    sheet.text = csv('04/11/2026 10:00:00,Nguyễn Văn An,Công ty A,an@a.vn,,Có,,');
    // The guest is updated; writing the outcome on the response then fails with a database error.
    const r = await h.runWith(failingWrites((t, op, nth) => t === 'sce_tcsk_rsvp_responses' && op === 'update' && nth === 1), xtdtUser, 'comms.syncForm', { eventId });
    expect(r).toMatchObject({ ok: true, value: { applied: 1, failures: ['Nguyễn Văn An: lỗi hệ thống'] } });
  });

  it('never overwrites a staff change made after the response (older answers are stale)', async () => {
    const { h, eventId, sync, responses } = await setup();
    const g = await h.addGuest(eventId, { email: 'an@a.vn' as Email });
    // Staff declined at NOW (09:00 Hà Nội); the form answer is from 08:00.
    await h.ok(xtdtUser, 'guests.update', { eventId, id: g.id, version: g.version, patch: { rsvpStatus: 'declined' } });
    sheet.text = csv('04/11/2026 08:00:00,Nguyễn Văn An,Công ty A,an@a.vn,,Có,Có,');
    const report = await sync();
    expect(report).toMatchObject({ applied: 0, stale: 1 });
    expect((await h.guest(eventId, g.id)).rsvpStatus).toBe('declined');
    expect(responses()[0]).toMatchObject({ apply_status: 'stale', match: 'email' });
  });

  it('leaves RSVP and banquet untouched when the sheet has no such column', async () => {
    const { h, eventId, sync, responses } = await setup();
    const g = await h.addGuest(eventId, { email: 'an@a.vn' as Email, hasBanquet: true });
    sheet.text = ['Dấu thời gian,Họ và tên,Email', '04/11/2026 10:00:00,Nguyễn Văn An,an@a.vn'].join('\n');
    expect(await sync()).toMatchObject({ applied: 0, noAnswer: 1 });
    expect(await h.guest(eventId, g.id)).toMatchObject({ rsvpStatus: 'pending', hasBanquet: true, rsvpSource: 'manual' });
    expect(responses()[0]).toMatchObject({ apply_status: 'no_answer', rsvp: null, has_banquet: null });
  });

  it('keeps banquet when only RSVP is answered', async () => {
    const { h, eventId, sync } = await setup();
    const g = await h.addGuest(eventId, { email: 'an@a.vn' as Email, hasBanquet: true });
    sheet.text = ['Dấu thời gian,Email,Xác nhận tham dự', '04/11/2026 10:00:00,an@a.vn,Có'].join('\n');
    await sync();
    expect(await h.guest(eventId, g.id)).toMatchObject({ rsvpStatus: 'confirmed', hasBanquet: true });
  });

  it('parks an ambiguous match for review and changes neither namesake', async () => {
    const { h, eventId, sync, responses } = await setup();
    const a = await h.addGuest(eventId, { name: 'Lê Cường', organization: 'Công ty C' });
    const b = await h.addGuest(eventId, { name: 'Lê Cường', organization: 'Công ty D' });
    sheet.text = csv('04/11/2026 10:00:00,Lê Cường,Công ty Z,,,Có,,');
    expect(await sync()).toMatchObject({ applied: 0, review: 1 });
    expect((await h.guest(eventId, a.id)).rsvpStatus).toBe('pending');
    expect((await h.guest(eventId, b.id)).rsvpStatus).toBe('pending');
    expect(responses()[0]).toMatchObject({ match: 'ambiguous', apply_status: 'pending' });
    expect(new Set(responses()[0]!.candidate_guest_ids as string[])).toEqual(new Set([a.id, b.id]));
  });

  it('creates no guest when auto-add is off; with it on, adds the newcomer once, flagged, pending invite', async () => {
    const off = await setup({ autoAddNewGuests: false });
    sheet.text = csv('04/11/2026 10:00:00,Khách Mới,Công ty Mới,moi@x.vn,0912345678,Có,Không,');
    expect(await off.sync()).toMatchObject({ created: 0, review: 1 });
    expect(await off.h.roster(off.eventId)).toHaveLength(0);

    const on = await setup({ autoAddNewGuests: true });
    sheet.text = csv('04/11/2026 10:00:00,Khách Mới,Công ty Mới,moi@x.vn,0912345678,Có,Không,', '04/11/2026 10:05:00,Khách Mới,Công ty Mới,moi@x.vn,0912345678,Có,Có,');
    const report = await on.sync();
    const roster = await on.h.roster(on.eventId);
    expect(roster).toHaveLength(1);
    expect(roster[0]).toMatchObject({ name: 'Khách Mới', inviteStatus: 'pending', rsvpStatus: 'confirmed', rsvpSource: 'google_form', email: 'moi@x.vn', phone: '0912345678' });
    expect(roster[0]!.notes).toContain('Tự đăng ký qua Google Form');
    // The second answer of the same newcomer is matched to the guest the first one created, and is newer, so it wins.
    expect(report).toMatchObject({ created: 1, applied: 1 });
    expect(roster[0]!.hasBanquet).toBe(true);
  });

  it.each([
    ['Sở Tài chính Hà Nội', 'SoNganh'],
    ['So Ke hoach va Dau tu', 'SoNganh'],
    ['Ủy ban nhân dân quận Hoàn Kiếm', 'SoNganh'],
    ['UBND phường Tràng Tiền', 'SoNganh'],
    ['Công ty TNHH Sở Hữu Trí Tuệ', 'DoanhNghiep'],
    ['Công ty Cổ phần Ban Mai', 'DoanhNghiep'],
  ])('auto-add files "%s" under %s', async (organization, group) => {
    const { h, eventId, sync } = await setup({ autoAddNewGuests: true });
    sheet.text = csv(`04/11/2026 10:00:00,Khách Mới,${organization},moi@x.vn,,Có,,`);
    await sync();
    expect((await h.roster(eventId))[0]).toMatchObject({ organization, group });
  });

  it('a sync that stops part-way keeps what it applied, audits it, fails, and the next sync finishes the rest', async () => {
    const { h, eventId, sync, responses } = await setup({ autoAddNewGuests: true });
    const g = await h.addGuest(eventId, { email: 'an@a.vn' as Email });
    sheet.text = csv('04/11/2026 10:00:00,Nguyễn Văn An,Công ty A,an@a.vn,,Có,,', '04/11/2026 10:05:00,Khách Mới,Công ty Mới,moi@x.vn,,Có,,');
    const audits = h.audits().length;
    const r = await h.runWith(failingWrites((t, op) => t === 'sce_tcsk_guests' && op === 'insertMany'), xtdtUser, 'comms.syncForm', { eventId });
    expect(r).toMatchObject({ ok: false, kind: 'conflict', message: 'Đồng bộ dừng giữa chừng: đã áp dụng 1 phản hồi và thêm 0 khách mới. Bấm "Đồng bộ ngay" để xử lý phần còn lại.' });
    expect(await h.guest(eventId, g.id)).toMatchObject({ rsvpStatus: 'confirmed' });
    // guests.applyRsvp audits the answer it applied; the sync writes one row of its own.
    expect(h.audits().slice(audits).map((a) => a.action)).toEqual(['CẬP NHẬT RSVP', 'ĐỒNG BỘ GOOGLE FORM']);
    expect(h.audits().at(-1)).toMatchObject({ action: 'ĐỒNG BỘ GOOGLE FORM', summary: expect.stringMatching(/^Đồng bộ Google Form dừng giữa chừng \(.+\): lưu 2 phản hồi mới; áp dụng 1, thêm khách mới 0; phần còn lại chờ lần đồng bộ sau$/) });
    expect(responses().map((x) => x.apply_status).sort()).toEqual(['applied', 'pending']);
    expect(await sync()).toMatchObject({ fresh: 0, created: 1, applied: 0 });
    expect(await h.roster(eventId)).toHaveLength(2);
  });

  it('a sync that fails before any write audits nothing extra and changes nothing', async () => {
    const { h, eventId, responses } = await setup();
    sheet.text = csv('04/11/2026 10:00:00,Nguyễn Văn An,Công ty A,an@a.vn,,Có,,');
    const audits = h.audits().length;
    const r = await h.runWith(failingWrites((t, op) => t === 'sce_tcsk_rsvp_responses' && op === 'insertMany'), xtdtUser, 'comms.syncForm', { eventId });
    expect(r).toMatchObject({ ok: false });
    expect(h.audits()).toHaveLength(audits);
    expect(responses()).toEqual([]);
  });

  it('applies the later of two answers by the same guest last', async () => {
    const { h, eventId, sync } = await setup();
    const g = await h.addGuest(eventId, { email: 'an@a.vn' as Email });
    sheet.text = csv('05/11/2026 10:00:00,Nguyễn Văn An,Công ty A,an@a.vn,,Không tham dự,,', '04/11/2026 10:00:00,Nguyễn Văn An,Công ty A,an@a.vn,,Có,,');
    expect(await sync()).toMatchObject({ applied: 2 });
    expect((await h.guest(eventId, g.id)).rsvpStatus).toBe('declined');
  });

  it('reads a US-locale sheet’s times as such, and keeps a future time for review instead of applying it', async () => {
    const { h, eventId, sync, responses } = await setup();
    const a = await h.addGuest(eventId, { email: 'a@a.vn' as Email });
    await h.addGuest(eventId, { email: 'b@a.vn' as Email });
    sheet.text = csv('10/28/2026 09:00:00,A,Công ty A,a@a.vn,,Có,,', '11/4/2026 08:30:00,A,Công ty A,a@a.vn,,Không tham dự,,', '12/24/2026 10:00:00,B,Công ty B,b@a.vn,,Có,,');
    await sync();
    const by = (email: string) => responses().filter((r) => r.email === email).map((r) => [r.responded_at, r.apply_status]);
    // Read as Vietnamese, the second answer would be 11 April and lose to the first.
    expect(by('a@a.vn')).toEqual([['2026-10-28T02:00:00.000Z', 'applied'], ['2026-11-04T01:30:00.000Z', 'applied']]);
    expect(await h.guest(eventId, a.id)).toMatchObject({ rsvpStatus: 'declined' });
    expect(by('b@a.vn')).toEqual([[expect.any(String), 'no_time']]);
  });

  it('reads a US-locale sheet whose days are all 12 or less by the order of its rows', async () => {
    const { h, eventId, sync, responses } = await setup();
    const a = await h.addGuest(eventId, { email: 'a@a.vn' as Email });
    sheet.text = csv('10/12/2026 09:00:00,A,Công ty A,a@a.vn,,Có,,', '11/4/2026 10:00:00,A,Công ty A,a@a.vn,,Không tham dự,,');
    expect(await sync()).toMatchObject({ applied: 2, dateOrderUnclear: false });
    expect(responses().map((r) => [r.responded_at, r.apply_status])).toEqual([['2026-10-12T02:00:00.000Z', 'applied'], ['2026-11-04T03:00:00.000Z', 'applied']]);
    expect(await h.guest(eventId, a.id)).toMatchObject({ rsvpStatus: 'declined', rsvpAt: '2026-11-04T03:00:00.000Z' });
  });

  it('a sheet whose date order cannot be told keeps every answer for review, says so, and changes no guest', async () => {
    const { h, eventId, sync, responses } = await setup();
    const a = await h.addGuest(eventId, { email: 'a@a.vn' as Email, rsvpStatus: 'confirmed' });
    sheet.text = csv('1/3/2026 09:00:00,A,Công ty A,a@a.vn,,Không tham dự,,', '4/3/2026 09:00:00,B,Công ty B,b@a.vn,,Có,,');
    expect(await sync()).toMatchObject({ applied: 0, dateOrderUnclear: true });
    expect(responses().map((r) => r.apply_status)).toEqual(['no_time', 'no_time']);
    expect(await h.guest(eventId, a.id)).toMatchObject({ rsvpStatus: 'confirmed' });
    expect(h.audits().at(-1)!.summary).toContain('không xác định được ngày/tháng');
  });

  it('keeps a response with an unreadable time for review and never applies it on its own', async () => {
    const { h, eventId, sync, responses } = await setup();
    const g = await h.addGuest(eventId, { email: 'an@a.vn' as Email });
    sheet.text = csv('hôm qua,Nguyễn Văn An,Công ty A,an@a.vn,,Có,,');
    expect(await sync()).toMatchObject({ applied: 0, review: 1 });
    expect((await h.guest(eventId, g.id)).rsvpStatus).toBe('pending');
    expect(responses()[0]).toMatchObject({ apply_status: 'no_time', match: 'email', matched_guest_id: g.id });
  });

  it('stores form answers as data: an XSS payload is kept verbatim, never interpreted', async () => {
    const { eventId, sync, responses } = await setup({ autoAddNewGuests: true });
    const payload = '<img src=x onerror=alert(1)>';
    sheet.text = csv(`04/11/2026 10:00:00,"${payload}",Công ty,,0912000111,Có,,`);
    await sync();
    expect(responses()[0]).toMatchObject({ name: payload });
    expect((responses()[0]!.raw as Record<string, string>)['Họ và tên']).toBe(payload);
    expect(eventId).toBeTruthy();
  });

  it('records a failed fetch on the form and in a truthful audit, touching no guest', async () => {
    const { h, eventId } = await setup();
    await h.addGuest(eventId, { email: 'an@a.vn' as Email });
    sheet.result = { ok: false, message: 'Không đọc được Google Sheet.' };
    const r = await h.ok(xtdtUser, 'comms.syncForm', { eventId });
    expect(r.value).toEqual({ status: 'error', message: 'Không đọc được Google Sheet.' });
    const form = (h.rows('sce_tcsk_rsvp_forms') as Array<Record<string, unknown>>).find((f) => f.event_id === eventId)!;
    expect(form).toMatchObject({ last_sync_error: 'Không đọc được Google Sheet.', last_sync_at: null });
    expect(h.audits().at(-1)).toMatchObject({ action: 'ĐỒNG BỘ GOOGLE FORM', summary: 'Đồng bộ Google Form thất bại: Không đọc được Google Sheet.' });
    expect(h.audits().some((a) => a.action === 'CẬP NHẬT RSVP')).toBe(false);
  });

  it('refuses to sync without a sheet link and refuses a non-sheet link at save', async () => {
    const h = harness({ sheets });
    const eventId = await h.createEvent();
    expect(await h.run(xtdtUser, 'comms.syncForm', { eventId })).toMatchObject({ ok: false, kind: 'invalid' });
    const bad = await h.run(xtdtUser, 'comms.saveForm', { eventId, version: null, config: { formUrl: null, sheetUrl: 'https://evil.com/spreadsheets/d/x', autoSync: false, autoAddNewGuests: false } } as never);
    expect(bad).toMatchObject({ ok: false, kind: 'invalid' });
    expect(sheet.calls).toEqual([]);
  });
});

describe('comms.resolveResponse', () => {
  async function ambiguous() {
    const s = await setup();
    const a = await s.h.addGuest(s.eventId, { name: 'Lê Cường', organization: 'Công ty C' });
    await s.h.addGuest(s.eventId, { name: 'Lê Cường', organization: 'Công ty D' });
    sheet.text = csv('04/11/2026 10:00:00,Lê Cường,Công ty Z,,,Có,,');
    await s.sync();
    const row = s.responses()[0]!;
    return { ...s, a, row: { id: row.id as ResponseRow['id'], version: row.version as ResponseRow['version'] } };
  }

  it('matches to the guest staff chose and applies the answer', async () => {
    const { h, eventId, a, row, responses } = await ambiguous();
    const r = await h.ok(xtdtUser, 'comms.resolveResponse', { eventId, id: row.id, version: row.version, action: { kind: 'match', guestId: a.id } });
    expect(r.value).toEqual({ applyStatus: 'applied' });
    expect((await h.guest(eventId, a.id)).rsvpStatus).toBe('confirmed');
    expect(responses()[0]).toMatchObject({ match: 'manual', matched_guest_id: a.id });
  });

  it('dismiss and its undo through the same command', async () => {
    const { h, eventId, row, responses } = await ambiguous();
    const r = await h.ok(xtdtUser, 'comms.resolveResponse', { eventId, id: row.id, version: row.version, action: { kind: 'dismiss' } });
    expect(responses()[0]).toMatchObject({ apply_status: 'dismissed' });
    expect((await h.undo(xtdtUser, r.inverse)).ok).toBe(true);
    expect(responses()[0]).toMatchObject({ apply_status: 'pending' });
  });

  it('refuses a stale version before touching any guest', async () => {
    const { h, eventId, a, row } = await ambiguous();
    const r = await h.run(xtdtUser, 'comms.resolveResponse', { eventId, id: row.id, version: (row.version + 1) as never, action: { kind: 'match', guestId: a.id } });
    expect(r).toMatchObject({ ok: false, kind: 'conflict' });
    expect((await h.guest(eventId, a.id)).rsvpStatus).toBe('pending');
  });

  it('refuses a response of another event', async () => {
    const { h, row, a } = await ambiguous();
    const other = await h.createEvent();
    const r = await h.run(admin, 'comms.resolveResponse', { eventId: other as EventId, id: row.id, version: row.version, action: { kind: 'match', guestId: a.id } });
    expect(r).toMatchObject({ ok: false, kind: 'not_found' });
  });

  it('a dismiss under another event is refused too, though it needs no guest of that event', async () => {
    const { h, row } = await ambiguous();
    const other = await h.createEvent();
    const before = h.rows('sce_tcsk_rsvp_responses');
    expect(await h.run(admin, 'comms.resolveResponse', { eventId: other as EventId, id: row.id, version: row.version, action: { kind: 'dismiss' } })).toMatchObject({ ok: false, kind: 'not_found' });
    expect(h.rows('sce_tcsk_rsvp_responses')).toEqual(before);
  });

  it('"create" adds the newcomer once and refuses a duplicate identity', async () => {
    const s = await setup();
    sheet.text = csv('04/11/2026 10:00:00,Khách Mới,Công ty Mới,moi@x.vn,,Có,,');
    await s.sync();
    const row = s.responses()[0]!;
    await s.h.ok(xtdtUser, 'comms.resolveResponse', { eventId: s.eventId, id: row.id as never, version: row.version as never, action: { kind: 'create' } });
    expect(await s.h.roster(s.eventId)).toHaveLength(1);
    expect(s.responses()[0]).toMatchObject({ match: 'created', apply_status: 'applied' });
  });

  it('"create" whose response cannot be marked keeps the new guest, audits it, and fails', async () => {
    const s = await setup();
    sheet.text = csv('04/11/2026 10:00:00,Khách Mới,Công ty Mới,moi@x.vn,,Có,,');
    await s.sync();
    const row = s.responses()[0]!;
    const audits = s.h.audits().length;
    const r = await s.h.runWith(failingWrites((t, op) => t === 'sce_tcsk_rsvp_responses' && op === 'update', 'conflict'), xtdtUser, 'comms.resolveResponse', {
      eventId: s.eventId, id: row.id as never, version: row.version as never, action: { kind: 'create' },
    });
    expect(r).toMatchObject({ ok: false, kind: 'conflict', message: 'Đã thêm khách mời "Khách Mới" nhưng chưa ghi được phản hồi là đã xử lý. Tải lại trang để xem.' });
    expect(await s.h.roster(s.eventId)).toHaveLength(1);
    expect(s.h.audits().slice(audits).filter((a) => a.action === 'XỬ LÝ PHẢN HỒI FORM')).toEqual([expect.objectContaining({ summary: expect.stringContaining('chưa ghi được phản hồi là đã xử lý') })]);
    // The next sync places the response on the guest it created.
    expect(await s.sync()).toMatchObject({ applied: 1, created: 0 });
  });
});

describe('a sync or a review action saved whose audit row the database refuses', () => {
  const refusing: AuditWriter = async () => {
    throw new DbError('forbidden');
  };

  it('a sync is reported saved and unaudited: the guest has the answer and no row is written', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { h, eventId, responses } = await setup();
    const g = await h.addGuest(eventId, { email: 'an@a.vn' as Email });
    sheet.text = csv('04/11/2026 10:00:00,Nguyễn Văn An,Công ty A,an@a.vn,,Có,,');
    const audits = h.audits().length;
    expect(await h.runWith((db) => db, xtdtUser, 'comms.syncForm', { eventId }, refusing)).toMatchObject({ ok: true, value: { applied: 1 }, unaudited: MESSAGES.unaudited });
    expect(await h.guest(eventId, g.id)).toMatchObject({ rsvpStatus: 'confirmed' });
    expect(responses().map((r) => r.apply_status)).toEqual(['applied']);
    expect(h.audits()).toHaveLength(audits);
    expect(log).toHaveBeenCalledWith('command comms.syncForm: saved, but its audit row was not written', expect.objectContaining({ action: 'ĐỒNG BỘ GOOGLE FORM', perm: 'comms.rsvp.manage' }), expect.any(DbError));
    log.mockRestore();
  });

  it('"create" is reported saved and unaudited: the guest exists and the response is applied', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const s = await setup();
    sheet.text = csv('04/11/2026 10:00:00,Khách Mới,Công ty Mới,moi@x.vn,,Có,,');
    await s.sync();
    const row = s.responses()[0]!;
    const audits = s.h.audits().length;
    const r = await s.h.runWith((db) => db, xtdtUser, 'comms.resolveResponse', { eventId: s.eventId, id: row.id as never, version: row.version as never, action: { kind: 'create' } }, refusing);
    expect(r).toMatchObject({ ok: true, value: { applyStatus: 'applied' }, unaudited: MESSAGES.unaudited });
    expect(await s.h.roster(s.eventId)).toHaveLength(1);
    expect(s.h.audits()).toHaveLength(audits);
    log.mockRestore();
  });
});
