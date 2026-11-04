import { describe, expect, it } from 'vitest';
import type { HHmm, Instant, IsoDate } from '@/core/brand';
import {
  addCalendarDays,
  addHours,
  addWorkdays,
  buildWorkCalendar,
  calendarDaysBetween,
  combineVN,
  countdown,
  fileDateStamp,
  formatCountdown,
  formatNd30Date,
  formatVNDate,
  formatVNTime,
  parseHHmm,
  parseInstant,
  parseIsoDate,
  todayVN,
  workdaysBetween,
  type Holiday,
} from '@/core/dates';

const d = (s: string) => s as IsoDate;
const at = (s: string) => s as Instant;
const weekdaysOnly = buildWorkCalendar([]);
const holidays2026: Holiday[] = [
  { date: d('2026-04-30'), name: 'Ngày Giải phóng miền Nam', kind: 'holiday' },
  { date: d('2026-05-01'), name: 'Ngày Quốc tế Lao động', kind: 'holiday' },
  { date: d('2026-09-02'), name: 'Quốc khánh', kind: 'holiday' },
  { date: d('2026-04-25'), name: 'Làm bù', kind: 'compensatory_workday' },
];
const vn2026 = buildWorkCalendar(holidays2026);

describe('working-day arithmetic, m2 §3.2 worked examples (T0 2026-12-15 is a Tuesday)', () => {
  it.each([
    ['2026-12-15', -10, '2026-12-01', 'two full weeks back'],
    ['2026-12-15', -3, '2026-12-10', 'skips the 12-13 weekend'],
    ['2026-12-14', -1, '2026-12-11', 'Monday back one is Friday'],
    ['2026-12-19', -2, '2026-12-17', 'T0 on a Saturday: Fri=1, Thu=2'],
    ['2026-12-18', 1, '2026-12-21', 'Friday forward one is Monday'],
    ['2026-12-15', 0, '2026-12-15', 'offset 0 returns T0'],
  ])('addWorkdays(%s, %i) = %s (%s)', (from, n, expected) => {
    expect(addWorkdays(weekdaysOnly, d(from), n)).toBe(expected);
  });

  it('calendar offsets ignore weekends', () => {
    expect(addCalendarDays(d('2026-12-15'), -20)).toBe('2026-11-25');
    expect(addCalendarDays(d('2026-12-18'), 3)).toBe('2026-12-21');
    expect(addCalendarDays(d('2026-12-31'), 1)).toBe('2027-01-01');
    expect(addCalendarDays(d('2028-02-28'), 1)).toBe('2028-02-29');
  });
});

describe('holiday calendar (m2 BUG-06)', () => {
  it('skips public holidays when counting working days', () => {
    expect(addWorkdays(vn2026, d('2026-04-29'), 1)).toBe('2026-05-04');
    expect(addWorkdays(vn2026, d('2026-05-04'), -1)).toBe('2026-04-29');
    expect(addWorkdays(weekdaysOnly, d('2026-04-29'), 1)).toBe('2026-04-30');
  });

  it('counts a compensatory Saturday as a working day', () => {
    expect(vn2026.isWorkday(d('2026-04-25'))).toBe(true);
    expect(weekdaysOnly.isWorkday(d('2026-04-25'))).toBe(false);
    expect(addWorkdays(vn2026, d('2026-04-24'), 1)).toBe('2026-04-25');
  });

  it('a T-10 working-day deadline before 2 September moves back past the holiday', () => {
    expect(addWorkdays(weekdaysOnly, d('2026-09-10'), -10)).toBe('2026-08-27');
    expect(addWorkdays(vn2026, d('2026-09-10'), -10)).toBe('2026-08-26');
  });

  it('reports the years the holiday table covers', () => {
    expect(vn2026.coverage).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    const empty = weekdaysOnly.coverage;
    expect(empty.from > empty.to).toBe(true);
  });
});

describe('countdown, m2 §3.4 worked examples', () => {
  it.each([
    ['2026-11-04', '2026-11-04', { kind: 'today' }, 'Hôm nay'],
    ['2026-11-04', '2026-11-05', { kind: 'future', calendarDays: 1, workdays: 1 }, 'Còn 1 ngày làm việc'],
    ['2026-11-06', '2026-11-07', { kind: 'future', calendarDays: 1, workdays: 0 }, 'Còn 1 ngày'],
    ['2026-11-06', '2026-11-08', { kind: 'future', calendarDays: 2, workdays: 0 }, 'Còn 2 ngày'],
    ['2026-11-06', '2026-11-09', { kind: 'future', calendarDays: 3, workdays: 1 }, 'Còn 1 ngày làm việc'],
    ['2026-11-04', '2026-11-18', { kind: 'future', calendarDays: 14, workdays: 10 }, 'Còn 10 ngày làm việc'],
    ['2026-11-04', '2026-11-19', { kind: 'future', calendarDays: 15, workdays: 11 }, 'Còn 11 ngày làm việc'],
    ['2026-11-08', '2026-11-07', { kind: 'past', calendarDays: 1 }, 'Đã diễn ra 1 ngày trước'],
    ['2026-11-09', '2026-11-07', { kind: 'past', calendarDays: 2 }, 'Đã diễn ra 2 ngày trước'],
  ])('today %s, event %s', (today, target, expected, label) => {
    const c = countdown(weekdaysOnly, d(target), d(today));
    expect(c).toEqual(expected);
    expect(formatCountdown(c)).toBe(label);
  });

  it('a Saturday event seen on Friday is in the future, never "today" (BUG-03)', () => {
    expect(countdown(weekdaysOnly, d('2026-11-07'), d('2026-11-06')).kind).toBe('future');
  });

  it('a Saturday event seen on Sunday is past even though no working day passed (BUG-03)', () => {
    expect(workdaysBetween(weekdaysOnly, d('2026-11-08'), d('2026-11-07'))).toBe(0);
    expect(Object.is(workdaysBetween(weekdaysOnly, d('2026-11-08'), d('2026-11-07')), -0)).toBe(false);
    expect(countdown(weekdaysOnly, d('2026-11-07'), d('2026-11-08')).kind).toBe('past');
  });

  it('holidays shorten the working-day count', () => {
    const c = countdown(vn2026, d('2026-05-04'), d('2026-04-29'));
    expect(c).toEqual({ kind: 'future', calendarDays: 5, workdays: 1 });
  });

  it('signs working days and calendar days by direction', () => {
    expect(workdaysBetween(weekdaysOnly, d('2026-11-09'), d('2026-11-07'))).toBe(-1);
    expect(calendarDaysBetween(d('2026-11-09'), d('2026-11-07'))).toBe(-2);
  });
});

describe('Vietnam time', () => {
  it('today rolls over at 00:00 Hanoi, which is 17:00 UTC (m2 BUG-31)', () => {
    expect(todayVN(at('2026-11-03T16:59:59.000Z'))).toBe('2026-11-03');
    expect(todayVN(at('2026-11-03T17:00:00.000Z'))).toBe('2026-11-04');
    expect(fileDateStamp(at('2026-11-03T18:30:00.000Z'))).toBe('2026-11-04');
  });

  it('combines a VN wall-clock date and time into an instant', () => {
    expect(combineVN(d('2026-12-15'), '08:30' as HHmm)).toBe('2026-12-15T01:30:00.000Z');
    expect(combineVN(d('2026-12-15'), '01:00' as HHmm)).toBe('2026-12-14T18:00:00.000Z');
    expect(addHours(combineVN(d('2026-12-15'), '08:30' as HHmm), -2)).toBe('2026-12-14T23:30:00.000Z');
  });

  it('formats times in VN', () => {
    expect(formatVNTime(at('2026-12-14T23:30:00.000Z'))).toBe('06:30');
    expect(formatVNTime(at('2026-12-14T23:30:00.000Z'), { withDate: true })).toBe('06:30 15/12/2026');
  });
});

describe('formats', () => {
  it('formats VN dates with optional weekday', () => {
    expect(formatVNDate(d('2026-12-15'))).toBe('15/12/2026');
    expect(formatVNDate(d('2026-12-15'), { weekday: true })).toBe('Thứ Ba, 15/12/2026');
    expect(formatVNDate(d('2026-11-08'), { weekday: true })).toBe('Chủ Nhật, 08/11/2026');
  });

  it('formats NĐ30 dates, padding days below 10 and months 1-2 only', () => {
    expect(formatNd30Date(d('2026-11-04'))).toBe('ngày 04 tháng 11 năm 2026');
    expect(formatNd30Date(d('2026-02-09'))).toBe('ngày 09 tháng 02 năm 2026');
    expect(formatNd30Date(d('2026-03-15'))).toBe('ngày 15 tháng 3 năm 2026');
  });
});

describe('parsers', () => {
  it('parses only real calendar dates', () => {
    expect(parseIsoDate('2026-12-15')).toBe('2026-12-15');
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('15/12/2026')).toBeNull();
    expect(parseIsoDate('')).toBeNull();
    expect(parseIsoDate(null)).toBeNull();
  });

  it('parses wall-clock times, including Postgres seconds', () => {
    expect(parseHHmm('8:30')).toBe('08:30');
    expect(parseHHmm('08:30:00')).toBe('08:30');
    expect(parseHHmm('24:00')).toBeNull();
    expect(parseHHmm('8h30')).toBeNull();
  });

  it('parses instants only when they carry a zone', () => {
    expect(parseInstant('2026-11-04T01:30:00+00:00')).toBe('2026-11-04T01:30:00.000Z');
    expect(parseInstant('2026-11-04T08:30:00.123456+07:00')).toBe('2026-11-04T01:30:00.123Z');
    expect(parseInstant('2026-11-04 01:30:00+00')).toBe('2026-11-04T01:30:00.000Z');
    expect(parseInstant('2026-11-04T01:30:00')).toBeNull();
    expect(parseInstant('21:30:15')).toBeNull();
  });
});
