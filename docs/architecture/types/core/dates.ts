// The only date module. Pure plain-date arithmetic on 'YYYY-MM-DD', independent
// of the runtime time zone. "Today" and "now" are always Asia/Ho_Chi_Minh.
// There is deliberately no weekend-only variant: every working-day function
// takes a WorkCalendar, so holidays cannot be forgotten (m2 BUG-06, core Q12).

import type { HHmm, Instant, IsoDate } from './brand';

export const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';

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
  throw new Error('not implemented');
}

export function parseIsoDate(raw: unknown): IsoDate | null {
  throw new Error('not implemented');
}
export function parseHHmm(raw: unknown): HHmm | null {
  throw new Error('not implemented');
}

export function todayVN(now?: Instant): IsoDate {
  throw new Error('not implemented');
}
export function nowInstant(): Instant {
  throw new Error('not implemented');
}

export function addCalendarDays(date: IsoDate, n: number): IsoDate {
  throw new Error('not implemented');
}
/** n > 0 forward, n < 0 back. Counts only working days; n = 0 returns date. Legacy semantics m2 §3.1. */
export function addWorkdays(cal: WorkCalendar, date: IsoDate, n: number): IsoDate {
  throw new Error('not implemented');
}
/** Signed calendar days from a to b. */
export function calendarDaysBetween(a: IsoDate, b: IsoDate): number {
  throw new Error('not implemented');
}
/** Signed working days in the half-open interval (min, max]. */
export function workdaysBetween(cal: WorkCalendar, a: IsoDate, b: IsoDate): number {
  throw new Error('not implemented');
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
  throw new Error('not implemented');
}
export function formatCountdown(c: Countdown): string {
  throw new Error('not implemented');
}

/** 'dd/mm/yyyy' or 'Thứ Hai, dd/mm/yyyy'. */
export function formatVNDate(date: IsoDate, opts?: { weekday?: boolean }): string {
  throw new Error('not implemented');
}
/** NĐ 30/2020 form: 'ngày 04 tháng 11 năm 2026' (m3 B13). */
export function formatNd30Date(date: IsoDate): string {
  throw new Error('not implemented');
}
/** 'HH:mm' or 'HH:mm dd/mm/yyyy' in VN time. */
export function formatVNTime(at: Instant, opts?: { withDate?: boolean }): string {
  throw new Error('not implemented');
}
/** Combine a VN wall-clock date + time into an absolute instant. */
export function combineVN(date: IsoDate, time: HHmm): Instant {
  throw new Error('not implemented');
}
export function addHours(at: Instant, hours: number): Instant {
  throw new Error('not implemented');
}
/** Local VN date for file names, never UTC (m2 BUG-31, m3 B14, m6 BUG-31). */
export function fileDateStamp(now?: Instant): string {
  throw new Error('not implemented');
}
