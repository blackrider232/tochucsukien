import { describe, expect, it } from 'vitest';
import type { EventId, GroupId, Instant, IsoDate, StepId, Version } from '@/core/brand';
import { buildWorkCalendar, countdown, formatCountdown, workdaysBetween } from '@/core/dates';
import type { EventPlan, SceEvent, Step } from '../contract';
import { stepsByDeadline } from '../domain/dashboard';
import { countdownBadge, deadlineOf, eventProgress, isInDailyReportWindow, offsetLabel, stepState } from '../domain/schedule';
import { HOLIDAYS, SETTINGS } from './harness';

const d = (s: string) => s as IsoDate;
const weekendsOnly = buildWorkCalendar([]);
const withHolidays = buildWorkCalendar(HOLIDAYS);

describe('deadlineOf, m2 §3.2 worked examples (weekends only, as the legacy app counted)', () => {
  it.each([
    ['2026-12-15', 10, 'workday', 'before', '2026-12-01'],
    ['2026-12-15', 3, 'workday', 'before', '2026-12-10'],
    ['2026-12-14', 1, 'workday', 'before', '2026-12-11'],
    ['2026-12-19', 2, 'workday', 'before', '2026-12-17'],
    ['2026-12-15', 20, 'calendar', 'before', '2026-11-25'],
    ['2026-12-18', 1, 'workday', 'after', '2026-12-21'],
    ['2026-12-18', 3, 'calendar', 'after', '2026-12-21'],
    ['2026-12-15', 0, 'workday', 'before', '2026-12-15'],
    ['2026-12-15', 5, 'workday', 'dday', '2026-12-15'],
  ] as const)('T0 %s, %i %s %s -> %s', (t0, offsetDays, dayType, targetPhase, expected) => {
    expect(deadlineOf(weekendsOnly, d(t0), { offsetDays, dayType, targetPhase })).toBe(expected);
  });
});

describe('deadlineOf with the holiday calendar (m2 BUG-06, decision 1)', () => {
  it('skips a public holiday when counting working days back', () => {
    // T0 Thu 03/09/2026; Wed 02/09 is Quốc khánh, so T-2 is Mon 31/08.
    expect(deadlineOf(withHolidays, d('2026-09-03'), { offsetDays: 2, dayType: 'workday', targetPhase: 'before' })).toBe('2026-08-31');
    expect(deadlineOf(weekendsOnly, d('2026-09-03'), { offsetDays: 2, dayType: 'workday', targetPhase: 'before' })).toBe('2026-09-01');
  });
  it('skips a holiday counting forward, and calendar days ignore holidays', () => {
    expect(deadlineOf(withHolidays, d('2026-12-31'), { offsetDays: 1, dayType: 'workday', targetPhase: 'after' })).toBe('2027-01-04');
    expect(deadlineOf(withHolidays, d('2026-12-31'), { offsetDays: 1, dayType: 'calendar', targetPhase: 'after' })).toBe('2027-01-01');
  });
  it('counts a compensatory working Saturday', () => {
    const cal = buildWorkCalendar([{ date: d('2026-12-12'), name: 'Làm bù', kind: 'compensatory_workday' }]);
    expect(deadlineOf(cal, d('2026-12-14'), { offsetDays: 1, dayType: 'workday', targetPhase: 'before' })).toBe('2026-12-12');
  });
});

describe('offsetLabel says the unit and the direction (m2 BUG-27/28)', () => {
  it.each([
    [10, 'workday', 'before', 'T-10 (ngày làm việc)'],
    [3, 'calendar', 'after', 'T+3 (ngày lịch)'],
    [0, 'workday', 'before', 'T0'],
    [5, 'calendar', 'dday', 'T0'],
  ] as const)('%i %s %s -> %s', (offsetDays, dayType, targetPhase, label) => {
    expect(offsetLabel({ offsetDays, dayType, targetPhase })).toBe(label);
  });
});

function step(over: Partial<Step>): Step {
  return {
    id: 'a0000000-0000-4000-8000-000000000001' as StepId, eventId: 'e0000000-0000-4000-8000-000000000001' as EventId,
    groupId: 'b0000000-0000-4000-8000-000000000001' as GroupId, name: 'Bước', requirement: '', offsetDays: 3, dayType: 'calendar',
    targetPhase: 'before', completedAt: null, completedBy: null, assignee: '', templateKey: '', subTasks: [], links: [], sort: 0, version: 1 as Version,
    ...over,
  };
}
const event = (eventDate: string): SceEvent => ({
  id: 'e0000000-0000-4000-8000-000000000001' as EventId, name: 'HN', type: 'hoi_nghi', eventDate: d(eventDate), eventTime: '08:30' as SceEvent['eventTime'],
  location: '', department: 'Phòng Xúc tiến đầu tư', supportingDepartments: [], leadPerson: '', budget: null, targetGuests: 150, status: 'preparing',
  note: '', deletedAt: null, version: 1 as Version, createdAt: '2026-11-01T00:00:00.000Z' as Instant, createdBy: null, updatedAt: '2026-11-01T00:00:00.000Z' as Instant,
});

describe('stepState in calendar days (m2 §3.3)', () => {
  const t0 = d('2026-12-15');
  it.each([
    ['2026-12-13', 'overdue'],
    ['2026-12-12', 'due_soon'],
    ['2026-12-10', 'due_soon'],
    ['2026-12-09', 'upcoming'],
  ] as const)('deadline 12/12, today %s -> %s', (today, state) => {
    expect(stepState(weekendsOnly, t0, step({}), d(today))).toBe(state);
  });
  it('the deadline day itself is not overdue, and completion wins', () => {
    expect(stepState(weekendsOnly, t0, step({}), d('2026-12-12'))).toBe('due_soon');
    expect(stepState(weekendsOnly, t0, step({ completedAt: '2026-12-01T00:00:00.000Z' as Instant }), d('2026-12-20'))).toBe('done');
  });
});

describe('eventProgress', () => {
  it('counts done, overdue and due soon over every step, sub-tasks not counted', () => {
    const plan: EventPlan = {
      event: event('2026-12-15'),
      groups: [{
        id: 'b0000000-0000-4000-8000-000000000001' as GroupId, eventId: event('2026-12-15').id, phase: 'phase_prepare', name: 'N1', leadPerson: '', note: '', sort: 0, version: 1 as Version,
        steps: [
          step({ offsetDays: 30, completedAt: '2026-11-01T00:00:00.000Z' as Instant }),
          step({ offsetDays: 30, subTasks: [{ id: '1', name: 'x', completed: true }] }),
          step({ offsetDays: 3 }),
        ],
      }],
    };
    expect(eventProgress(weekendsOnly, plan, d('2026-12-11'))).toEqual({ total: 3, done: 1, overdue: 1, dueSoon: 1, percent: 33 });
    expect(eventProgress(weekendsOnly, { ...plan, groups: [] }, d('2026-12-11')).percent).toBe(0);
  });

  it('rounds the percent to the nearest whole number: 1 of 3 is 33, 2 of 3 is 67', () => {
    const done = '2026-11-01T00:00:00.000Z' as Instant;
    const planOf = (...steps: Step[]): EventPlan => ({
      event: event('2026-12-15'),
      groups: [{ id: 'b0000000-0000-4000-8000-000000000001' as GroupId, eventId: event('2026-12-15').id, phase: 'phase_prepare', name: 'N1', leadPerson: '', note: '', sort: 0, version: 1 as Version, steps }],
    });
    expect(eventProgress(weekendsOnly, planOf(step({ completedAt: done }), step({}), step({})), d('2026-12-01')).percent).toBe(33);
    expect(eventProgress(weekendsOnly, planOf(step({ completedAt: done }), step({ completedAt: done }), step({})), d('2026-12-01')).percent).toBe(67);
    expect(eventProgress(weekendsOnly, planOf(step({ completedAt: done })), d('2026-12-01')).percent).toBe(100);
  });
});

describe('stepsByDeadline orders a group by deadline, ties by stored order (m2 BUG-44)', () => {
  const t0 = d('2026-12-15');
  const at = (name: string, sort: number, over: Partial<Step>) => step({ name, sort, ...over });
  const names = (steps: Step[]) => steps.map((s) => s.name);

  it('sorts the earliest deadline first whatever the stored order', () => {
    const stored = [
      at('hậu sự kiện', 0, { targetPhase: 'after', offsetDays: 2 }),
      at('ngày diễn ra', 1, { targetPhase: 'dday', offsetDays: 0 }),
      at('T-3', 2, { offsetDays: 3 }),
      at('T-20', 3, { offsetDays: 20 }),
      at('T-1', 4, { offsetDays: 1 }),
    ];
    expect(names(stepsByDeadline(weekendsOnly, t0, stored))).toEqual(['T-20', 'T-3', 'T-1', 'ngày diễn ra', 'hậu sự kiện']);
  });

  it('keeps the stored order between steps that fall due on the same day', () => {
    const stored = [at('thứ ba', 2, { offsetDays: 3 }), at('thứ nhất', 0, { offsetDays: 3 }), at('thứ hai', 1, { offsetDays: 3 }), at('sớm hơn', 5, { offsetDays: 9 })];
    expect(names(stepsByDeadline(weekendsOnly, t0, stored))).toEqual(['sớm hơn', 'thứ nhất', 'thứ hai', 'thứ ba']);
  });

  it('does not reorder the caller’s array', () => {
    const stored = [at('b', 0, { offsetDays: 1 }), at('a', 1, { offsetDays: 9 })];
    stepsByDeadline(weekendsOnly, t0, stored);
    expect(names(stored)).toEqual(['b', 'a']);
  });
});

describe('countdown and the daily-report window, m2 §3.4 "intended" column (BUG-03)', () => {
  it.each([
    ['2026-11-04', '2026-11-04', 0, 'HÔM NAY: NGÀY DIỄN RA', true],
    ['2026-11-04', '2026-11-05', 1, 'Còn 1 ngày làm việc (Báo cáo hàng ngày)', true],
    ['2026-11-06', '2026-11-07', 0, 'Còn 1 ngày (Báo cáo hàng ngày)', true],
    ['2026-11-06', '2026-11-08', 0, 'Còn 2 ngày (Báo cáo hàng ngày)', true],
    ['2026-11-06', '2026-11-09', 1, 'Còn 1 ngày làm việc (Báo cáo hàng ngày)', true],
    ['2026-11-04', '2026-11-18', 10, 'Còn 10 ngày làm việc (Báo cáo hàng ngày)', true],
    ['2026-11-04', '2026-11-19', 11, 'Còn 11 ngày làm việc', false],
    ['2026-11-08', '2026-11-07', 0, 'Đã diễn ra 1 ngày trước', false],
    ['2026-11-09', '2026-11-07', -1, 'Đã diễn ra 2 ngày trước', false],
  ] as const)('today %s, T0 %s', (today, t0, workdays, badge, inWindow) => {
    expect(workdaysBetween(weekendsOnly, d(today), d(t0))).toBe(workdays);
    const ev = event(t0);
    const window = isInDailyReportWindow(weekendsOnly, ev, d(today), SETTINGS);
    expect(window).toBe(inWindow);
    expect(countdownBadge(countdown(weekendsOnly, ev.eventDate, d(today)), window).text).toBe(badge);
  });
  it('reads the threshold from settings (m2 BUG-07)', () => {
    const ev = event('2026-11-19');
    expect(isInDailyReportWindow(weekendsOnly, ev, d('2026-11-04'), { ...SETTINGS, dailyReportThresholdDays: 11 })).toBe(true);
    expect(isInDailyReportWindow(weekendsOnly, ev, d('2026-11-04'), { ...SETTINGS, dailyReportThresholdDays: 5 })).toBe(false);
  });
  it('a holiday shortens nothing: Quốc khánh is not a working day of the countdown', () => {
    expect(formatCountdown(countdown(withHolidays, d('2026-09-03'), d('2026-09-01')))).toBe('Còn 1 ngày làm việc');
  });
});
