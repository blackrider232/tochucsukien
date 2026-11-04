import { describe, expect, it } from 'vitest';
import { newId, type EventId, type Instant } from '@/core/brand';
import { DbError, type Db } from '@/core/db';
import { decodeFigures } from '../domain/figures';
import { dailyReportsTable } from '../server/tables';
import { admin, harness, head, ISSUE, leader, NOW, outsider, staff } from './harness';

/**
 * T0 Tue 15/12/2026, issued Tue 08/12 at 08:00: (08/12, 15/12] holds 9, 10, 11, 14, 15 -> T-5.
 * Steps T-20 done, T-10 and T-8 late, T-7 due today, T-3 done, T-2 and T-1 ahead -> round(2/7) = 29%, 2 late, 1 due soon.
 * Target 10 at 130% -> quota ceil(13) = 13; 8 confirmed + 2 substituted + 3 pending + 1 declined = 14 invitations, 10 attending.
 * Booths 2 confirmed + 1 reviewing. Packages 465.000.000 awarded for 449.500.000 (3,33%) plus 50.000.000 not awarded.
 */
async function seeded() {
  const h = harness();
  const eventId = await h.createEvent({ targetGuests: 10 });
  await h.addSteps(eventId, [[20, true], [10, false], [8, false], [7, false], [3, true], [2, false], [1, false]]);
  await h.addGuests(eventId, 8, 'confirmed');
  await h.addGuests(eventId, 2, 'substituted');
  await h.addGuests(eventId, 3, 'pending');
  await h.addGuests(eventId, 1, 'declined');
  await h.addBooth(eventId, 'confirmed');
  await h.addBooth(eventId, 'confirmed');
  await h.addBooth(eventId, 'reviewing');
  await h.addPackage(eventId, 'TB-2026-001', 220_000_000, 215_000_000);
  await h.addPackage(eventId, 'TB-2026-002', 160_000_000, 152_500_000);
  await h.addPackage(eventId, 'TB-2026-003', 85_000_000, 82_000_000);
  await h.addPackage(eventId, 'TB-2026-004', 50_000_000, null);
  await h.ok(admin, 'reports.createClipping', {
    eventId, id: newId<'MediaClipping'>(),
    draft: { outlet: 'Hanoitv', title: 'Phóng sự chuẩn bị hội nghị', publishedOn: '2026-12-01', mediaType: 'Truyền hình', url: null, author: '' } as never,
  });
  return { h, eventId };
}

const EXPECTED = {
  progressPercent: 29, overdueSteps: 2, dueSoonSteps: 1, stepsDone: 2, stepsTotal: 7, guestsInvited: 14, guestsAttending: 10, guestsDeclined: 1, guestQuota: 13,
  guestTarget: 10, quotaReached: true, boothsConfirmed: 2, boothsReviewing: 1, boothsTotal: 3, packages: 4, packagesAwarded: 3, biddingBudget: 515_000_000,
  biddingAwardedBudget: 465_000_000, biddingWinning: 449_500_000, biddingSavingsPercent: 3.33, clippings: 1,
};

describe('reports.issueDailyReport', () => {
  it('freezes the figures computed at issue time, the VN date, the T-5 milestone, the event and the department head as signer', async () => {
    const { h, eventId } = await seeded();
    const id = newId<'DailyReport'>();
    const r = await h.issue(head, eventId, ISSUE, id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.already).toBe(false);
    expect(r.value.report).toMatchObject({
      id, eventId, reportDate: '2026-12-08', workdaysToEvent: 5, progressPercent: 29, keyHighlight: ISSUE.keyHighlight, signatory: 'Trần Văn Bình',
      signatoryTitle: 'TRƯỞNG PHÒNG XÚC TIẾN ĐẦU TƯ', documentNumber: '12/BC-SCE', eventName: 'Hội nghị Xúc tiến Đầu tư 2026', eventDate: '2026-12-15',
      issuedAt: NOW, issuedBy: head.profile.id,
    });
    expect(decodeFigures(r.value.report.figures)).toEqual(EXPECTED);
  });

  it('is audited with the figures it froze', async () => {
    const { h, eventId } = await seeded();
    const id = newId<'DailyReport'>();
    await h.issue(head, eventId, ISSUE, id);
    expect(h.audits().at(-1)).toMatchObject({
      action: 'PHÁT HÀNH BÁO CÁO HÀNG NGÀY', entity: 'daily_report', entity_id: id, event_id: eventId,
      summary: 'Phát hành báo cáo ngày 08/12/2026 (T-5): tiến độ 29%, 2 bước quá hạn, 14/13 thư mời, 10 đại biểu tham dự; người ký TRƯỞNG PHÒNG XÚC TIẾN ĐẦU TƯ Trần Văn Bình',
    });
  });

  it('a second issue the same day returns the first report unchanged, writes no second row, and says so in the audit', async () => {
    const { h, eventId } = await seeded();
    const first = await h.issue(head, eventId);
    h.clock.now = '2026-12-08T09:30:00.000Z' as Instant;
    const second = await h.issue(leader, eventId, { ...ISSUE, keyHighlight: 'Nội dung khác', signatory: 'Người khác' });
    expect(second).toMatchObject({ ok: true, value: { already: true } });
    if (!first.ok || !second.ok) return;
    expect(second.value.report).toEqual(first.value.report);
    expect(await h.reports(eventId)).toHaveLength(1);
    expect(h.audits().at(-1)?.summary).toBe('Báo cáo ngày 08/12/2026 đã phát hành lúc 08:00; không phát hành lại, số liệu giữ nguyên');
  });

  it('a retry with the same id converges on the same report', async () => {
    const { h, eventId } = await seeded();
    const id = newId<'DailyReport'>();
    await h.issue(head, eventId, ISSUE, id);
    expect(await h.issue(head, eventId, ISSUE, id)).toMatchObject({ ok: true, value: { already: true, report: { id } } });
  });

  it('the snapshot does not move when the data changes; the next day issues the new numbers', async () => {
    const { h, eventId } = await seeded();
    const first = await h.issue(head, eventId);
    if (!first.ok) throw new Error(first.message);
    await h.addGuests(eventId, 5, 'confirmed');
    await h.addSteps(eventId, [[1, true]]);
    const [pkg] = await h.packages(eventId);
    await h.ok(admin, 'reports.updatePackage', { eventId, id: pkg!.id, version: pkg!.version, draft: h.packageDraft('TB-2026-001', 220_000_000, 250_000_000) });
    await h.ok(admin, 'progress.updateEvent', { id: eventId, version: (h.rows('sce_tcsk_events')[0]!.version as never), patch: { name: 'Tên đã đổi' } });

    const [stored] = await h.reports(eventId);
    expect(stored).toEqual(first.value.report);
    expect(decodeFigures(stored!.figures)).toEqual(EXPECTED);

    h.clock.now = '2026-12-09T01:00:00.000Z' as Instant;
    const next = await h.issue(head, eventId);
    if (!next.ok) throw new Error(next.message);
    expect(next.value.report).toMatchObject({ reportDate: '2026-12-09', workdaysToEvent: 4, eventName: 'Tên đã đổi' });
    // 3 of 8 steps done -> 38%; 19 invitations; 465M awarded for 484.5M -> overrun of 4,19%.
    expect(decodeFigures(next.value.report.figures)).toMatchObject({ progressPercent: 38, guestsInvited: 19, guestsAttending: 15, biddingWinning: 484_500_000, biddingSavingsPercent: -4.19 });
    expect((await h.reports(eventId)).map((r) => r.reportDate)).toEqual(['2026-12-09', '2026-12-08']);
  });

  it('the day turns at midnight in Hà Nội, not in UTC', async () => {
    const { h, eventId } = await seeded();
    h.clock.now = '2026-12-08T17:30:00.000Z' as Instant; // 00:30 on 09/12 in Hà Nội
    const r = await h.issue(head, eventId);
    expect(r).toMatchObject({ ok: true, value: { report: { reportDate: '2026-12-09' } } });
  });

  it.each([
    ['23:59:59 on 08/12', '2026-12-08T16:59:59.000Z', '2026-12-08', '08/12/2026 (T-5)'],
    ['00:00:01 on 09/12', '2026-12-08T17:00:01.000Z', '2026-12-09', '09/12/2026 (T-4)'],
  ])('issued at %s in Hà Nội, the report and its audit row carry that day', async (_at, now, day, label) => {
    const { h, eventId } = await seeded();
    h.clock.now = now as Instant;
    const r = await h.issue(head, eventId);
    expect(r).toMatchObject({ ok: true, value: { report: { reportDate: day } } });
    expect(h.audits().at(-1)?.summary).toMatch(new RegExp(`^Phát hành báo cáo ngày ${label.replace(/[()]/g, '\\$&')}:`));
  });

  it('when the database stamps the next day (the request began at 23:59:59.9), the stored day is the one returned and audited', async () => {
    const { h, eventId } = await seeded();
    h.clock.now = '2026-12-08T16:59:59.900Z' as Instant;
    const stampsNextDay = (db: Db): Db => ({
      rpc: db.rpc.bind(db),
      table(def) {
        const t = db.table(def);
        if (def.name !== 'sce_tcsk_daily_reports') return t;
        return { ...t, insert: (draft) => t.insert({ ...draft, reportDate: '2026-12-09', workdaysToEvent: 4 } as typeof draft) } as typeof t;
      },
    });
    const r = await h.runWith(head, stampsNextDay, 'reports.issueDailyReport', { eventId, id: newId<'DailyReport'>(), draft: ISSUE });
    expect(r).toMatchObject({ ok: true, value: { already: false, report: { reportDate: '2026-12-09' } } });
    expect(h.audits().at(-1)?.summary).toMatch(/^Phát hành báo cáo ngày 09\/12\/2026 \(T-4\):/);
  });

  it('a retry with the same id that lands after midnight converges on the report it issued', async () => {
    const { h, eventId } = await seeded();
    const id = newId<'DailyReport'>();
    h.clock.now = '2026-12-08T16:59:59.000Z' as Instant;
    const first = await h.issue(head, eventId, ISSUE, id);
    h.clock.now = '2026-12-08T17:00:30.000Z' as Instant;
    const retry = await h.issue(head, eventId, ISSUE, id);
    if (!first.ok) throw new Error(first.message);
    expect(retry).toMatchObject({ ok: true, value: { already: true, report: first.value.report } });
    expect(await h.reports(eventId)).toHaveLength(1);
  });

  it('takes nothing but the narrative from the client: figures, date and issuer in the payload are ignored', async () => {
    const { h, eventId } = await seeded();
    const forged = { ...ISSUE, figures: { progressPercent: 100 }, reportDate: '2026-01-01', issuedBy: admin.profile.id, progressPercent: 100 } as never;
    const r = await h.issue(head, eventId, forged);
    if (!r.ok) throw new Error(r.message);
    expect(r.value.report).toMatchObject({ progressPercent: 29, reportDate: '2026-12-08', issuedBy: head.profile.id });
  });

  it('needs the narrative and the signer', async () => {
    const { h, eventId } = await seeded();
    const r = await h.issue(head, eventId, { ...ISSUE, keyHighlight: ' ', signatory: '' });
    expect(r).toMatchObject({ ok: false, kind: 'invalid', fieldErrors: { 'draft.keyHighlight': 'Nhập tình hình triển khai nổi bật trong ngày', 'draft.signatory': 'Nhập họ tên người ký' } });
    expect(h.rows('sce_tcsk_daily_reports')).toEqual([]);
  });

  it('when another desk issues between the check and the insert, theirs stands and this one returns it', async () => {
    const { h, eventId } = await seeded();
    let raced: unknown = null;
    const wrap = (db: Db): Db => ({
      rpc: db.rpc.bind(db),
      table(def) {
        const t = db.table(def);
        if (def.name !== 'sce_tcsk_daily_reports') return t;
        return {
          ...t,
          insert: async (draft) => {
            raced ??= await h.issue(leader, eventId, { ...ISSUE, signatory: 'Bàn kia' });
            return t.insert(draft);
          },
        } as typeof t;
      },
    });
    const r = await h.runWith(head, wrap, 'reports.issueDailyReport', { eventId, id: newId<'DailyReport'>(), draft: ISSUE });
    expect(raced).toMatchObject({ ok: true, value: { already: false } });
    expect(r).toMatchObject({ ok: true, value: { already: true, report: { signatory: 'Bàn kia' } } });
    expect(await h.reports(eventId)).toHaveLength(1);
  });
});

describe('who may issue (decision 17: dept_leader and above)', () => {
  it.each([
    ['admin', admin],
    ['leader', leader],
    ['the event department head', head],
  ])('%s issues', async (_label, actor) => {
    const { h, eventId } = await seeded();
    expect((await h.issue(actor, eventId)).ok).toBe(true);
  });

  async function refused(run: (eventId: EventId) => Promise<{ ok: boolean; kind?: string }>, h: Awaited<ReturnType<typeof seeded>>['h'], eventId: EventId) {
    const auditsBefore = h.audits().length;
    const r = await run(eventId);
    expect(r.ok).toBe(false);
    expect(h.rows('sce_tcsk_daily_reports')).toEqual([]);
    expect(h.audits()).toHaveLength(auditsBefore);
    return r;
  }

  it('a chuyên viên of the department is refused, through RLS and by the command itself', async () => {
    const { h, eventId } = await seeded();
    expect(await refused((e) => h.issue(staff, e), h, eventId)).toMatchObject({ kind: 'forbidden' });
    expect(await refused((e) => h.runWithoutRls(staff, 'reports.issueDailyReport', { eventId: e, id: newId<'DailyReport'>(), draft: ISSUE }), h, eventId)).toMatchObject({ kind: 'forbidden' });
  });

  it('the head of another department is refused, through RLS and by the command itself', async () => {
    const { h, eventId } = await seeded();
    await refused((e) => h.issue(outsider, e), h, eventId);
    expect(await refused((e) => h.runWithoutRls(outsider, 'reports.issueDailyReport', { eventId: e, id: newId<'DailyReport'>(), draft: ISSUE }), h, eventId)).toMatchObject({ kind: 'forbidden' });
  });

  it('an issued report cannot be edited or deleted, even by its issuer', async () => {
    const { h, eventId } = await seeded();
    const r = await h.issue(head, eventId);
    if (!r.ok) throw new Error(r.message);
    const table = h.ctx(head).db.table(dailyReportsTable);
    await expect(table.update(r.value.report.id, { keyHighlight: 'sửa' }, { overwrite: 'idempotent-set' })).rejects.toBeInstanceOf(DbError);
    await expect(table.remove(r.value.report.id)).rejects.toBeInstanceOf(DbError);
    expect((await h.reports(eventId))[0]?.keyHighlight).toBe(ISSUE.keyHighlight);
  });
});
