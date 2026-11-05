// Deadlines, step states, progress and countdowns. Pure functions of the
// event date, the work calendar and "today"; nothing here is ever stored
// (m2 Q4: deadlines are derived, so a date change needs no cascade).

import type { IsoDate } from '@/core/brand';
import { addCalendarDays, addWorkdays, calendarDaysBetween, countdown, formatCountdown, workdaysBetween, type Countdown, type WorkCalendar } from '@/core/dates';
import type * as C from '../contract';
import type { Step, StepState } from '../contract';

/** Steps due within this many calendar days are "Cận hạn". */
export const DUE_SOON_DAYS = 2;

export const deadlineOf: typeof C.deadlineOf = (cal, eventDate, step) => {
  if (step.targetPhase === 'dday' || step.offsetDays === 0) return eventDate;
  const n = step.targetPhase === 'after' ? step.offsetDays : -step.offsetDays;
  return step.dayType === 'workday' ? addWorkdays(cal, eventDate, n) : addCalendarDays(eventDate, n);
};

/** Calendar days from today to the step's deadline; negative when late. */
export function daysToDeadline(cal: WorkCalendar, eventDate: IsoDate, step: Pick<Step, 'offsetDays' | 'dayType' | 'targetPhase'>, today: IsoDate): number {
  return calendarDaysBetween(today, deadlineOf(cal, eventDate, step));
}

export const stepState: typeof C.stepState = (cal, eventDate, step, today) => {
  if (step.completedAt) return 'done';
  const d = daysToDeadline(cal, eventDate, step, today);
  if (d < 0) return 'overdue';
  return d <= DUE_SOON_DAYS ? 'due_soon' : 'upcoming';
};

export const eventProgress: typeof C.eventProgress = (cal, plan, today) => {
  const steps = plan.groups.flatMap((g) => g.steps);
  const states = steps.map((s) => stepState(cal, plan.event.eventDate, s, today));
  const done = states.filter((s) => s === 'done').length;
  return {
    total: steps.length,
    done,
    overdue: states.filter((s) => s === 'overdue').length,
    dueSoon: states.filter((s) => s === 'due_soon').length,
    percent: steps.length === 0 ? 0 : Math.round((100 * done) / steps.length),
  };
};

export const eventCountdown: typeof C.eventCountdown = (cal, event, today) => countdown(cal, event.eventDate, today);

/**
 * Working days from today up to, not including, T0: the count of reports' `workdaysToEvent` and of the T-n deadlines
 * (the step due n working days before T0 is the one with n of them from its day to T0). A weekend or holiday T0 or
 * today therefore reads as the next working day, and a Sunday event opens its window on the weekend before T-10,
 * not a working day earlier as (today, T0] would.
 */
const workdaysBeforeEvent = (cal: WorkCalendar, today: IsoDate, eventDate: IsoDate): number =>
  workdaysBetween(cal, addCalendarDays(today, -1), addCalendarDays(eventDate, -1));

/** Today or later, and at most the settings' threshold of working days away (m2 §3.5 intended, BUG-03/BUG-07). */
export const isInDailyReportWindow: typeof C.isInDailyReportWindow = (cal, event, today, s) =>
  calendarDaysBetween(today, event.eventDate) >= 0 && workdaysBeforeEvent(cal, today, event.eventDate) <= s.dailyReportThresholdDays;

/** Decision 3: "Đã hoàn thành" iff the event has steps and every one is completed. */
export function isPlanComplete(plan: { groups: ReadonlyArray<{ steps: ReadonlyArray<Pick<Step, 'completedAt'>> }> }): boolean {
  const steps = plan.groups.flatMap((g) => g.steps);
  return steps.length > 0 && steps.every((s) => s.completedAt !== null);
}

/** 'T0', 'T-10 (ngày làm việc)', 'T+3 (ngày lịch)': one offset vocabulary for row, dialog and print (m2 §7.3, BUG-27/28). */
export function offsetLabel(step: Pick<Step, 'offsetDays' | 'dayType' | 'targetPhase'>): string {
  if (step.targetPhase === 'dday' || step.offsetDays === 0) return 'T0';
  const unit = step.dayType === 'workday' ? 'ngày làm việc' : 'ngày lịch';
  return `T${step.targetPhase === 'after' ? '+' : '-'}${step.offsetDays} (${unit})`;
}

export type CountdownTone = 'emerald' | 'rose' | 'blue' | 'slate';

/** The event countdown badge (m2 §3.4) with the unit always spelled out. */
export function countdownBadge(c: Countdown, inDailyWindow: boolean): { text: string; tone: CountdownTone; pulse: boolean } {
  if (c.kind === 'today') return { text: 'HÔM NAY: NGÀY DIỄN RA', tone: 'emerald', pulse: true };
  if (c.kind === 'past') return { text: formatCountdown(c), tone: 'slate', pulse: false };
  if (inDailyWindow) return { text: `${formatCountdown(c)} (Báo cáo hàng ngày)`, tone: 'rose', pulse: true };
  return { text: formatCountdown(c), tone: 'blue', pulse: false };
}

export function stepStateBadge(state: StepState, days: number): { text: string; tone: 'emerald' | 'rose' | 'amber' | 'slate'; pulse: boolean } {
  switch (state) {
    case 'done':
      return { text: 'Đã xong', tone: 'emerald', pulse: false };
    case 'overdue':
      return { text: `Quá hạn ${-days} ngày`, tone: 'rose', pulse: true };
    case 'due_soon':
      return { text: days === 0 ? 'Hạn hôm nay' : `Cận hạn: Còn ${days} ngày`, tone: 'amber', pulse: false };
    case 'upcoming':
      return { text: `Còn ${days} ngày`, tone: 'slate', pulse: false };
  }
}
