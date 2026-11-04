import { describe, expect, it } from 'vitest';
import { buildWorkCalendar } from '@/core/dates';
import { biddingTotals, dailyReportState, dashboardFigures, decodeFigures, encodeFigures, formatPercent2, milestoneLabel, reportFigures, savingsPercent, workdaysToEvent } from '../domain/figures';
import { nextPackageCode } from '../domain/schemas';
import { booth, d, event, guest, guests, HOLIDAYS, pkg, plan, SETTINGS, step, weekendsOnly, withHolidays } from './fixtures';

const TODAY = d('2026-12-08');

describe('reportFigures, worked example (m6 §3.3 correct versions)', () => {
  // T0 Tue 15/12/2026, today Tue 08/12. Calendar-day steps: T-20 done, T-10 and T-8 late, T-7 due today, T-3 done, T-2 and T-1 upcoming.
  const steps = [step(20, true), step(10), step(8), step(7), step(3, true), step(2), step(1)];
  // Target 150 at 130% -> quota ceil(195) = 195. 120 confirmed + 30 substituted + 40 pending + 10 declined = 200 guests.
  const roster = [...guests(120, 'confirmed'), ...guests(30, 'substituted'), ...guests(40, 'pending'), ...guests(10, 'declined')];
  const booths = [booth('confirmed'), booth('confirmed'), booth('confirmed'), booth('reviewing'), booth('reviewing'), booth('available')];
  // The legacy seed's three packages (465.000.000 / 449.500.000) plus one not yet awarded.
  const packages = [pkg(220_000_000, 215_000_000), pkg(160_000_000, 152_500_000), pkg(85_000_000, 82_000_000), pkg(50_000_000, null)];
  const f = reportFigures({ plan: plan(steps), roster, booths, packages }, withHolidays, SETTINGS, TODAY);

  it('progress is round(2 / 7) = 29% and two steps are late, from the deadline rule, not a stored flag (BUG-05)', () => {
    expect(f.progressPercent).toBe(29);
    expect(f.overdueSteps).toBe(2);
  });
  it('guests: every roster row is an invitation, attending = confirmed + substituted, quota from the guests selector (BUG-02/08/40)', () => {
    expect(f.guestsInvited).toBe(200);
    expect(f.guestsAttending).toBe(150);
    expect(f.guestQuota).toBe(195);
    expect(f.quotaReached).toBe(true);
  });
  it('booths: confirmed over the real count, never a fallback of 16 (BUG-22)', () => {
    expect(f.boothsConfirmed).toBe(3);
    expect(f.boothsTotal).toBe(6);
  });
  it('bidding: the dự toán counts every package, savings only the awarded ones: 15.500.000 / 465.000.000 = 3,33%', () => {
    expect(f.biddingBudget).toBe(515_000_000);
    expect(f.biddingWinning).toBe(449_500_000);
    expect(f.biddingSavingsPercent).toBe(3.33);
  });
  it('the dashboard adds the detail counts the screens show', () => {
    const full = dashboardFigures({ plan: plan(steps), roster, booths, packages, clippings: 4 }, withHolidays, SETTINGS, TODAY);
    expect(full).toMatchObject({ stepsTotal: 7, stepsDone: 2, dueSoonSteps: 1, guestTarget: 150, guestsDeclined: 10, boothsReviewing: 2, packages: 4, packagesAwarded: 3, biddingAwardedBudget: 465_000_000, clippings: 4 });
  });
});

describe('zero denominators', () => {
  it('an empty event reads 0%, no quota reached, 0/0 booths and no savings rate', () => {
    const f = reportFigures({ plan: plan([]), roster: [], booths: [], packages: [] }, weekendsOnly, SETTINGS, TODAY);
    expect(f).toEqual({
      progressPercent: 0, overdueSteps: 0, guestsInvited: 0, guestsAttending: 0, guestQuota: 195, quotaReached: false,
      boothsConfirmed: 0, boothsTotal: 0, biddingBudget: 0, biddingWinning: 0, biddingSavingsPercent: null,
    });
  });
  it('packages without a winning price give no rate, not 100%', () => {
    expect(biddingTotals([pkg(100_000_000, null)]).savingsPercent).toBeNull();
  });
  it('an awarded package with a zero budget gives no rate instead of dividing by zero', () => {
    expect(savingsPercent(0, 0)).toBeNull();
    expect(savingsPercent(0, 5)).toBeNull();
  });
});

describe('signed savings rate (BUG-35)', () => {
  it.each([
    [465_000_000, 449_500_000, 3.33],
    [100_000_000, 112_500_000, -12.5],
    [3, 1, 66.67],
    [3, 2, 33.33],
    [3, 5, -66.67],
    [300_000_000, 299_000_000, 0.33],
    [100, 100, 0],
  ])('budget %i, winning %i -> %f%%', (budget, winning, rate) => {
    expect(savingsPercent(budget, winning)).toBe(rate);
  });
  it('an overrun lowers the total instead of vanishing at 0', () => {
    const t = biddingTotals([pkg(100_000_000, 90_000_000), pkg(100_000_000, 120_000_000)]);
    expect(t.savings).toBe(-10_000_000);
    expect(t.savingsPercent).toBe(-5);
  });
  it('one formatter, two decimals, Vietnamese comma, sign kept', () => {
    expect(formatPercent2(3.33)).toBe('3,33%');
    expect(formatPercent2(-12.5)).toBe('-12,50%');
    expect(formatPercent2(0)).toBe('0,00%');
    expect(formatPercent2(null)).toBe('Chưa có');
  });
});

describe('invite quota through the guests selector (decision 2)', () => {
  const figuresFor = (invited: number, targetGuests: number, percent = 130) =>
    reportFigures({ plan: plan([], { targetGuests }), roster: guests(invited), booths: [], packages: [] }, weekendsOnly, { ...SETTINGS, guestQuotaPercent: percent }, TODAY);
  it.each([
    [194, 150, 130, 195, false],
    [195, 150, 130, 195, true],
    [9, 7, 130, 10, false],
    [10, 7, 130, 10, true],
    [150, 150, 100, 150, true],
    [299, 150, 200, 300, false],
  ])('%i invited for target %i at %i%% -> quota %i, reached %s', (invited, target, percent, quota, reached) => {
    const f = figuresFor(invited, target, percent);
    expect(f.guestQuota).toBe(quota);
    expect(f.quotaReached).toBe(reached);
  });
  it('declined guests still count as invitations sent, and not as attending', () => {
    const f = reportFigures({ plan: plan([]), roster: [guest('declined'), guest('confirmed', 'VIP')], booths: [], packages: [] }, weekendsOnly, SETTINGS, TODAY);
    expect(f.guestsInvited).toBe(2);
    expect(f.guestsAttending).toBe(1);
  });
});

describe('T-10 daily report state on the holiday calendar (BUG-03/04, decision 1)', () => {
  const state = (today: string, eventDate: string, cal = withHolidays, threshold = 10) =>
    dailyReportState(cal, event({ eventDate: d(eventDate) }), d(today), { ...SETTINGS, dailyReportThresholdDays: threshold });

  it('T0 Tue 15/12: Tue 01/12 is T-10 (active), Mon 30/11 is T-11 (not yet)', () => {
    expect(state('2026-12-01', '2026-12-15')).toEqual({ kind: 'active', workdays: 10, calendarDays: 14 });
    expect(state('2026-11-30', '2026-12-15')).toEqual({ kind: 'not_yet', workdays: 11, calendarDays: 15 });
  });
  it('30/04 and 01/05 are holidays: Tue 28/04 to Tue 05/05 is T-3, where weekends alone give T-5', () => {
    expect(state('2026-04-28', '2026-05-05')).toEqual({ kind: 'active', workdays: 3, calendarDays: 7 });
    expect(state('2026-04-28', '2026-05-05', weekendsOnly)).toEqual({ kind: 'active', workdays: 5, calendarDays: 7 });
  });
  it('Quốc khánh 02/09 on the eve of T0: Mon 31/08 to Thu 03/09 is T-2', () => {
    expect(state('2026-08-31', '2026-09-03')).toMatchObject({ kind: 'active', workdays: 2 });
  });
  it('a weekend today counts from Monday: Sat 12/12 and Fri 11/12 are both T-2 before Tue 15/12', () => {
    expect(state('2026-12-12', '2026-12-15')).toMatchObject({ workdays: 2 });
    expect(state('2026-12-11', '2026-12-15')).toMatchObject({ workdays: 2 });
  });
  it('a compensatory working Saturday counts', () => {
    const cal = buildWorkCalendar([...HOLIDAYS, { date: d('2026-12-12'), name: 'Làm bù', kind: 'compensatory_workday' }]);
    expect(state('2026-12-11', '2026-12-15', cal)).toMatchObject({ workdays: 3 });
  });
  it('an event on a Sunday two days away is in the window with no working day left', () => {
    expect(state('2026-12-11', '2026-12-13')).toEqual({ kind: 'active', workdays: 0, calendarDays: 2 });
  });
  it('event day and after', () => {
    expect(state('2026-12-15', '2026-12-15')).toEqual({ kind: 'event_day' });
    expect(state('2026-12-17', '2026-12-15')).toEqual({ kind: 'past', calendarDays: 2 });
  });
  it('the threshold comes from settings', () => {
    expect(state('2026-12-04', '2026-12-15', withHolidays, 5).kind).toBe('not_yet');
    expect(state('2026-12-08', '2026-12-15', withHolidays, 5)).toMatchObject({ kind: 'active', workdays: 5 });
  });
  it('labels', () => {
    expect(milestoneLabel({ kind: 'active', workdays: 3, calendarDays: 7 })).toBe('T-3');
    expect(milestoneLabel({ kind: 'not_yet', workdays: 11, calendarDays: 15 })).toBe('T-11');
    expect(milestoneLabel({ kind: 'event_day' })).toBe('T0');
    expect(milestoneLabel({ kind: 'past', calendarDays: 2 })).toBe('T+2');
  });
  it('signed working days to the event, for the issued snapshot', () => {
    expect(workdaysToEvent(withHolidays, d('2026-05-05'), d('2026-04-28'))).toBe(3);
    expect(workdaysToEvent(withHolidays, d('2026-05-05'), d('2026-05-05'))).toBe(0);
    expect(workdaysToEvent(withHolidays, d('2026-04-28'), d('2026-05-05'))).toBe(-3);
  });
});

describe('snapshot encoding (BUG-12/13)', () => {
  it('round-trips, with a missing savings rate and a boolean quota', () => {
    const f = dashboardFigures({ plan: plan([step(3, true)]), roster: guests(2), booths: [], packages: [pkg(10, null)], clippings: 1 }, weekendsOnly, SETTINGS, TODAY);
    const stored = encodeFigures(f);
    expect(Object.values(stored).every((v) => typeof v === 'number')).toBe(true);
    expect(decodeFigures(stored)).toEqual(f);
  });
  it('decodes a row stored before a field existed as zero, and ignores unknown keys', () => {
    expect(decodeFigures({ progressPercent: 40, unknown: 7 })).toMatchObject({ progressPercent: 40, clippings: 0, biddingSavingsPercent: null, quotaReached: false });
  });
});

describe('next package code (BUG-33)', () => {
  it.each([
    [[], 'TB-2026-001'],
    [['TB-2026-001', 'TB-2026-002'], 'TB-2026-003'],
    [['TB-2026-009'], 'TB-2026-010'],
    [['tb-2026-004', 'TB-2025-099', 'GOI-1'], 'TB-2026-005'],
  ])('%j -> %s', (codes, next) => {
    expect(nextPackageCode(codes, 2026)).toBe(next);
  });
});
