// @vitest-environment node
// The dev memory runtime end to end (SCE_DEV_MEMORY=1): every feature's real
// dev seed, then the reports screen data a page would render, then the issue
// command through the real pipeline, as the dev identities the app offers.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { newId, type EventId, type Instant } from '@/core/brand';
import type { CommandId, CommandResult, InputOf, OutputOf } from '@/core/commands';
import { commandLookup, runCommand } from '@/core/commands/pipeline';
import { buildWorkCalendar } from '@/core/dates';
import { devContext } from '@/core/dev/runtime';
import { devIdentity, type DevRole } from '@/core/dev/mode';
import type { RequestContext } from '@/core/auth';
import { featureServers } from '@/features/registry-server';
import { eventProgress } from '@/features/progress';
import { listEvents, readEvent, readEventPlan } from '@/features/progress/server';
import { decodeFigures } from '../domain/figures';
import { reportsScreen } from '../server/screen-data';

vi.mock('next/dist/compiled/server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, delete: () => undefined }) }));

const NOW = '2026-12-08T01:00:00.000Z' as Instant;
const lookup = commandLookup(featureServers);

async function as(role: DevRole): Promise<RequestContext> {
  const dev = await devContext(devIdentity(role));
  if (!dev.ok) throw new Error(`dev ${role} gated`);
  return { actor: dev.actor, db: dev.db, settings: dev.settings, calendar: buildWorkCalendar(dev.holidays), now: new Date().toISOString() as Instant };
}
const run = async <K extends CommandId>(role: DevRole, id: K, input: InputOf<K>) => runCommand(await as(role), lookup, id, input) as Promise<CommandResult<OutputOf<K>>>;

let eventId: EventId;
beforeAll(async () => {
  vi.stubEnv('SCE_DEV_MEMORY', '1');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  const events = await listEvents(await as('admin'));
  eventId = events.find((e) => e.name.startsWith('[DEV] Hội nghị thử nghiệm Tiến độ'))!.id;
});
afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const ISSUE = { keyHighlight: 'Đã chốt kịch bản (dữ liệu giả).', blockers: 'Chờ xác nhận địa điểm.', signatory: 'Cán bộ Dev', documentNumber: null };

describe('seeded dev event -> dashboard -> issue -> idempotent -> frozen -> audited', () => {
  it('the dashboard shows the hand-computed numbers of the seeds', async () => {
    const ctx = await as('dept_leader');
    const screen = await reportsScreen(ctx, (await readEvent(ctx, eventId))!);
    // progress: T0 = today + 8 weekdays = Fri 18/12/2026; no holiday in between, so T-8 and in the 10-day window.
    expect(screen.event.eventDate).toBe('2026-12-18');
    expect(screen.state).toEqual({ kind: 'active', workdays: 8, calendarDays: 10 });
    // 32 standard steps, the first two done -> round(6,25) = 6%; Nhóm 1 is 2 of 5 = 40%.
    expect(screen.figures).toMatchObject({ stepsTotal: 32, stepsDone: 2, progressPercent: 6 });
    expect(screen.groups[0]).toMatchObject({ done: 2, total: 5, percent: 40 });
    // The late steps are progress's own count, so this screen and the plan screen agree.
    const plan = (await readEventPlan(ctx, eventId))!;
    expect(screen.figures!.overdueSteps).toBe(eventProgress(ctx.calendar, plan, screen.today).overdue);
    expect(screen.figures!.overdueSteps).toBeGreaterThan(0);
    // guests seed: 9 guests; confirmed 4 + substituted 1 = 5 attending; 1 declined. Target 120 at 130% -> 156.
    expect(screen.figures).toMatchObject({ guestsInvited: 9, guestsAttending: 5, guestsDeclined: 1, guestTarget: 120, guestQuota: 156, quotaReached: false });
    // venue seed: A01 confirmed, A02 reviewing, B01 available.
    expect(screen.figures).toMatchObject({ boothsConfirmed: 1, boothsReviewing: 1, boothsTotal: 3 });
    // reports seed: 120M won at 114M, 80M won at 84M (overrun), 40M not awarded -> 2.000.000 / 200.000.000 = 1,00%.
    expect(screen.figures).toMatchObject({ packages: 3, packagesAwarded: 2, biddingBudget: 240_000_000, biddingAwardedBudget: 200_000_000, biddingWinning: 198_000_000, biddingSavingsPercent: 1, clippings: 2 });
    expect(screen.missing).toEqual([]);
    expect(screen.reports).toEqual([]);
    expect(screen.can).toEqual({ write: true, issue: true });
  });

  it('a chuyên viên sees the dashboard but may not issue', async () => {
    const ctx = await as('user');
    const screen = await reportsScreen(ctx, (await readEvent(ctx, eventId))!);
    expect(screen.can).toEqual({ write: true, issue: false });
    expect(await run('user', 'reports.issueDailyReport', { eventId, id: newId<'DailyReport'>(), draft: ISSUE })).toMatchObject({ ok: false, kind: 'forbidden' });
  });

  it('issues, then a second issue the same day is the same report, the snapshot holds while data changes, and both are audited', async () => {
    const first = await run('dept_leader', 'reports.issueDailyReport', { eventId, id: newId<'DailyReport'>(), draft: ISSUE });
    if (!first.ok) throw new Error(first.message);
    expect(first.value.already).toBe(false);
    expect(first.value.report).toMatchObject({ reportDate: '2026-12-08', workdaysToEvent: 8, progressPercent: 6, signatoryTitle: 'TRƯỞNG PHÒNG XÚC TIẾN ĐẦU TƯ' });
    const frozen = decodeFigures(first.value.report.figures);
    expect(frozen).toMatchObject({ guestsInvited: 9, biddingSavingsPercent: 1, overdueSteps: (await reportsScreen(await as('admin'), (await readEvent(await as('admin'), eventId))!)).figures!.overdueSteps });

    const second = await run('leader', 'reports.issueDailyReport', { eventId, id: newId<'DailyReport'>(), draft: { ...ISSUE, signatory: 'Người khác' } });
    expect(second).toMatchObject({ ok: true, value: { already: true, report: first.value.report } });

    const plan = (await readEventPlan(await as('admin'), eventId))!;
    const open = plan.groups[0]!.steps.find((s) => s.completedAt === null)!;
    expect((await run('admin', 'progress.setStepDone', { eventId, stepId: open.id, done: true })).ok).toBe(true);
    expect((await run('admin', 'guests.create', {
      eventId, id: newId<'Guest'>(),
      draft: { name: 'Khách mới (giả)', group: 'DoanhNghiep', title: '', organization: 'Công ty giả', phone: '', email: null, sendMethod: 'direct', inviteStatus: 'sent', rsvpStatus: 'confirmed', rsvpSource: 'manual', substituteName: '', hasBanquet: false, notes: '', masterContactId: null },
    })).ok).toBe(true);

    const ctx = await as('dept_leader');
    const after = await reportsScreen(ctx, (await readEvent(ctx, eventId))!);
    expect(after.figures).toMatchObject({ stepsDone: 3, progressPercent: 9, guestsInvited: 10, guestsAttending: 6 });
    expect(after.reports).toHaveLength(1);
    expect(after.issuedToday).toEqual(first.value.report);
    expect(decodeFigures(after.reports[0]!.figures)).toEqual(frozen);

    const audit = await (await as('admin')).db.rpc('sce_tcsk_list_audit', { limit: 50, eventId, action: 'PHÁT HÀNH BÁO CÁO HÀNG NGÀY' });
    expect(audit.map((a) => a.summary)).toEqual([
      'Báo cáo ngày 08/12/2026 đã phát hành lúc 08:00; không phát hành lại, số liệu giữ nguyên',
      expect.stringMatching(/^Phát hành báo cáo ngày 08\/12\/2026 \(T-8\): tiến độ 6%, \d+ bước quá hạn, 9\/156 thư mời, 5 đại biểu tham dự; người ký TRƯỞNG PHÒNG XÚC TIẾN ĐẦU TƯ Cán bộ Dev$/),
    ]);
    expect(audit.every((a) => a.eventId === eventId && a.entity === 'daily_report')).toBe(true);
  });
});
