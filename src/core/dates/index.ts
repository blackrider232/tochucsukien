// The only date module. Pure plain-date arithmetic on 'YYYY-MM-DD', independent
// of the runtime time zone. "Today" and "now" are always Asia/Ho_Chi_Minh.
// There is deliberately no weekend-only variant: every working-day function
// takes a WorkCalendar, so holidays cannot be forgotten (m2 BUG-06, core Q12).

import type { HHmm, Instant, IsoDate } from '@/core/brand';

export const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';
/** Vietnam has kept UTC+7 without DST since 1975, so a fixed offset is exact. */
const VN_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;

export type HolidayKind = 'holiday' | 'compensatory_workday';
export interface Holiday {
  date: IsoDate;
  name: string;
  /** compensatory_workday = a Saturday/Sunday declared a working day (làm bù). */
  kind: HolidayKind;
}

/**
 * Built once per request from sce_tcsk_holidays (RequestContext.calendar) and
 * shipped to the client through AppContext. Opaque so callers cannot bypass it.
 */
export interface WorkCalendar {
  readonly isWorkday: (date: IsoDate) => boolean;
  /** Range the table covers. Outside it, the calendar falls back to Mon-Fri and says so. */
  readonly coverage: { from: IsoDate; to: IsoDate };
}
export function buildWorkCalendar(holidays: ReadonlyArray<Holiday>): WorkCalendar {
  const kinds = new Map<string, HolidayKind>(holidays.map((h) => [h.date, h.kind]));
  const years = holidays.map((h) => Number(h.date.slice(0, 4))).sort((a, b) => a - b);
  const first = years[0];
  const last = years[years.length - 1];
  return {
    isWorkday: (date) => {
      const kind = kinds.get(date);
      if (kind === 'holiday') return false;
      if (kind === 'compensatory_workday') return true;
      const weekday = weekdayOf(date);
      return weekday !== 0 && weekday !== 6;
    },
    coverage:
      first === undefined || last === undefined
        ? { from: '1970-01-02' as IsoDate, to: '1970-01-01' as IsoDate }
        : { from: `${first}-01-01` as IsoDate, to: `${last}-12-31` as IsoDate },
  };
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(raw: unknown): IsoDate | null {
  if (typeof raw !== 'string') return null;
  const m = ISO_DATE.exec(raw.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const back = new Date(Date.UTC(y, mo - 1, d));
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return raw.trim() as IsoDate;
}

/** Accepts 'H:mm', 'HH:mm' and Postgres 'HH:mm:ss'. */
export function parseHHmm(raw: unknown): HHmm | null {
  if (typeof raw !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return `${pad2(h)}:${pad2(mi)}` as HHmm;
}

/** Only strings with an explicit offset or Z; a zone-less string would be read as runtime-local time. */
export function parseInstant(raw: unknown): Instant | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().replace(' ', 'T');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) || !/(?:[zZ]|[+-]\d{2}(?::?\d{2})?)$/.test(s)) return null;
  const ms = Date.parse(s.replace(/(\.\d{3})\d+/, '$1').replace(/([+-]\d{2})$/, '$1:00'));
  return Number.isNaN(ms) ? null : (new Date(ms).toISOString() as Instant);
}

export function todayVN(now?: Instant): IsoDate {
  const ms = (now ? Date.parse(now) : Date.now()) + VN_OFFSET_MS;
  return new Date(ms).toISOString().slice(0, 10) as IsoDate;
}
export function nowInstant(): Instant {
  return new Date().toISOString() as Instant;
}

export function addCalendarDays(date: IsoDate, n: number): IsoDate {
  return fromDayNumber(dayNumber(date) + n);
}
/** n > 0 forward, n < 0 back. Counts only working days; n = 0 returns date. Legacy semantics m2 §3.1. */
export function addWorkdays(cal: WorkCalendar, date: IsoDate, n: number): IsoDate {
  const step = Math.sign(n);
  let day = dayNumber(date);
  let counted = 0;
  while (counted < Math.abs(n)) {
    day += step;
    if (cal.isWorkday(fromDayNumber(day))) counted += 1;
  }
  return fromDayNumber(day);
}
/** Signed calendar days from a to b. */
export function calendarDaysBetween(a: IsoDate, b: IsoDate): number {
  return dayNumber(b) - dayNumber(a);
}
/** Signed working days in the half-open interval (min, max]. */
export function workdaysBetween(cal: WorkCalendar, a: IsoDate, b: IsoDate): number {
  const [lo, hi] = dayNumber(a) <= dayNumber(b) ? [dayNumber(a), dayNumber(b)] : [dayNumber(b), dayNumber(a)];
  let count = 0;
  for (let day = lo + 1; day <= hi; day++) {
    if (cal.isWorkday(fromDayNumber(day))) count += 1;
  }
  return dayNumber(a) <= dayNumber(b) || count === 0 ? count : -count;
}

/**
 * Countdown with an explicit unit, the one vocabulary every module prints
 * (m2 §7.3, BUG-03/BUG-23): today | future (calendar + working days) | past.
 */
export type Countdown =
  | { kind: 'today' }
  | { kind: 'future'; calendarDays: number; workdays: number }
  | { kind: 'past'; calendarDays: number };
export function countdown(cal: WorkCalendar, target: IsoDate, today: IsoDate): Countdown {
  const days = calendarDaysBetween(today, target);
  if (days === 0) return { kind: 'today' };
  if (days < 0) return { kind: 'past', calendarDays: -days };
  return { kind: 'future', calendarDays: days, workdays: workdaysBetween(cal, today, target) };
}
export function formatCountdown(c: Countdown): string {
  switch (c.kind) {
    case 'today':
      return 'Hôm nay';
    case 'future':
      return c.workdays > 0 ? `Còn ${c.workdays} ngày làm việc` : `Còn ${c.calendarDays} ngày`;
    case 'past':
      return `Đã diễn ra ${c.calendarDays} ngày trước`;
  }
}

const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'] as const;

/** 'dd/mm/yyyy' or 'Thứ Hai, dd/mm/yyyy'. */
export function formatVNDate(date: IsoDate, opts?: { weekday?: boolean }): string {
  const [y, m, d] = date.split('-');
  const text = `${d}/${m}/${y}`;
  return opts?.weekday ? `${WEEKDAYS[weekdayOf(date)]}, ${text}` : text;
}
/**
 * NĐ 30/2020 form: 'ngày 04 tháng 11 năm 2026' (m3 B13). The decree pads days
 * below 10 and months 1 and 2 with a zero, and no other month.
 */
export function formatNd30Date(date: IsoDate): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return `ngày ${pad2(d)} tháng ${m <= 2 ? pad2(m) : String(m)} năm ${y}`;
}
/** 'HH:mm' or 'HH:mm dd/mm/yyyy' in VN time. */
export function formatVNTime(at: Instant, opts?: { withDate?: boolean }): string {
  const local = new Date(Date.parse(at) + VN_OFFSET_MS).toISOString();
  const time = local.slice(11, 16);
  return opts?.withDate ? `${time} ${formatVNDate(local.slice(0, 10) as IsoDate)}` : time;
}
/** Combine a VN wall-clock date + time into an absolute instant. */
export function combineVN(date: IsoDate, time: HHmm): Instant {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = time.split(':').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, d, h, mi) - VN_OFFSET_MS).toISOString() as Instant;
}
export function addHours(at: Instant, hours: number): Instant {
  return new Date(Date.parse(at) + hours * 3_600_000).toISOString() as Instant;
}
/** Local VN date for file names, never UTC (m2 BUG-31, m3 B14, m6 BUG-31). */
export function fileDateStamp(now?: Instant): string {
  return todayVN(now);
}

function dayNumber(date: IsoDate): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / DAY_MS;
}
function fromDayNumber(day: number): IsoDate {
  return new Date(day * DAY_MS).toISOString().slice(0, 10) as IsoDate;
}
function weekdayOf(date: IsoDate): number {
  return new Date(dayNumber(date) * DAY_MS).getUTCDay();
}
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
