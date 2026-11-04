// Dashboard read model: per-event summary, filters, search, KPI counts and
// the lists behind the four KPI pop-ups. Pure; the page computes it per render.

import type { IsoDate } from '@/core/brand';
import { calendarDaysBetween, type Countdown, type WorkCalendar } from '@/core/dates';
import type { SystemSettings } from '@/core/settings';
import { matchesQuery } from '@/core/text';
import { departmentByName, type DepartmentName, type EventType } from '@/core/vocab';
import type { EventPlan, EventProgress, SceEvent, Step, TaskGroup } from '../contract';
import { deadlineOf, eventCountdown, eventProgress, isInDailyReportWindow, isPlanComplete } from './schedule';

export type PlanGroup = EventPlan['groups'][number];

export interface PlanSummary {
  plan: EventPlan;
  progress: EventProgress;
  countdown: Countdown;
  inDailyWindow: boolean;
  complete: boolean;
}

export function summarize(cal: WorkCalendar, plan: EventPlan, today: IsoDate, settings: SystemSettings): PlanSummary {
  return {
    plan,
    progress: eventProgress(cal, plan, today),
    countdown: eventCountdown(cal, plan.event, today),
    inDailyWindow: isInDailyReportWindow(cal, plan.event, today, settings),
    complete: isPlanComplete(plan),
  };
}

/** Upcoming events first, nearest T0 first; then past events, most recent first (m2 Q12 default). */
export function sortSummaries(rows: ReadonlyArray<PlanSummary>, today: IsoDate): PlanSummary[] {
  const key = (r: PlanSummary) => calendarDaysBetween(today, r.plan.event.eventDate);
  return [...rows].sort((a, b) => {
    const [ka, kb] = [key(a), key(b)];
    if (ka >= 0 !== kb >= 0) return ka >= 0 ? -1 : 1;
    return ka >= 0 ? ka - kb : kb - ka;
  });
}

export type StatusFilter = 'all' | 'daily_report' | 'dday_today' | 'has_overdue' | 'preparing' | 'completed';
export interface PlanFilter {
  q: string;
  type: 'all' | EventType;
  department: 'all' | DepartmentName;
  status: StatusFilter;
}
export const NO_FILTER: PlanFilter = { q: '', type: 'all', department: 'all', status: 'all' };

const STATUS_TEST: Readonly<Record<StatusFilter, (r: PlanSummary) => boolean>> = {
  all: () => true,
  daily_report: (r) => r.inDailyWindow,
  dday_today: (r) => r.countdown.kind === 'today',
  has_overdue: (r) => r.progress.overdue > 0,
  preparing: (r) => !r.complete && r.countdown.kind !== 'past',
  completed: (r) => r.complete,
};

const eventText = (e: SceEvent) => [e.name, e.location, e.leadPerson, e.note, e.department, departmentByName(e.department).shortName];
const groupText = (g: TaskGroup) => [g.name, g.note, g.leadPerson];
const stepText = (s: Step) => [s.name, s.requirement, s.assignee, s.templateKey, ...s.subTasks.map((t) => t.name)];

export interface VisiblePlan {
  summary: PlanSummary;
  /** Groups and steps that match the search; everything when the event itself matches or there is no query. */
  groups: ReadonlyArray<PlanGroup>;
}

/**
 * Type, department, status and a diacritic-insensitive search, ANDed (m2 §3.6, BUG-35).
 * A search that matches inside a group shows only the matching groups and steps.
 */
export function filterSummaries(rows: ReadonlyArray<PlanSummary>, f: PlanFilter): VisiblePlan[] {
  return rows.flatMap((summary): VisiblePlan[] => {
    const { event, groups } = summary.plan;
    if (f.type !== 'all' && event.type !== f.type) return [];
    if (f.department !== 'all' && event.department !== f.department) return [];
    if (!STATUS_TEST[f.status](summary)) return [];
    const q = f.q.trim();
    const ev = eventText(event);
    if (!q || matchesQuery(q, ...ev)) return [{ summary, groups }];
    const shown = groups.flatMap((g): PlanGroup[] => {
      const gt = [...ev, ...groupText(g)];
      if (matchesQuery(q, ...gt)) return [g];
      const steps = g.steps.filter((s) => matchesQuery(q, ...gt, ...stepText(s)));
      return steps.length > 0 ? [{ ...g, steps }] : [];
    });
    return shown.length > 0 ? [{ summary, groups: shown }] : [];
  });
}

export interface DashboardKpis {
  totalEvents: number;
  dailyReport: number;
  completedSteps: number;
  totalSteps: number;
  overdueSteps: number;
}
export function dashboardKpis(rows: ReadonlyArray<PlanSummary>): DashboardKpis {
  return {
    totalEvents: rows.length,
    dailyReport: rows.filter((r) => r.inDailyWindow).length,
    completedSteps: rows.reduce((n, r) => n + r.progress.done, 0),
    totalSteps: rows.reduce((n, r) => n + r.progress.total, 0),
    overdueSteps: rows.reduce((n, r) => n + r.progress.overdue, 0),
  };
}

export interface StepRef {
  event: SceEvent;
  group: TaskGroup;
  step: Step;
  deadline: IsoDate;
  /** Calendar days from today to the deadline; negative when late. */
  days: number;
}

function stepRefs(cal: WorkCalendar, rows: ReadonlyArray<PlanSummary>, today: IsoDate): StepRef[] {
  return rows.flatMap(({ plan }) =>
    plan.groups.flatMap((group) =>
      group.steps.map((step) => {
        const deadline = deadlineOf(cal, plan.event.eventDate, step);
        return { event: plan.event, group, step, deadline, days: calendarDaysBetween(today, deadline) };
      }),
    ),
  );
}

/** Not completed and past the deadline, most days late first. */
export function overdueSteps(cal: WorkCalendar, rows: ReadonlyArray<PlanSummary>, today: IsoDate): StepRef[] {
  return stepRefs(cal, rows, today)
    .filter((r) => !r.step.completedAt && r.days < 0)
    .sort((a, b) => a.days - b.days);
}

/** Completed steps, most recently completed first. */
export function completedSteps(cal: WorkCalendar, rows: ReadonlyArray<PlanSummary>, today: IsoDate): StepRef[] {
  return stepRefs(cal, rows, today)
    .filter((r) => r.step.completedAt)
    .sort((a, b) => (a.step.completedAt! < b.step.completedAt! ? 1 : -1));
}

/** "Nhiệm vụ trọng tâm": open steps due within 3 days or late, most urgent first. */
export function focusSteps(cal: WorkCalendar, summary: PlanSummary, today: IsoDate, limit = 4): { shown: StepRef[]; total: number } {
  const all = stepRefs(cal, [summary], today)
    .filter((r) => !r.step.completedAt && r.days <= 3)
    .sort((a, b) => a.days - b.days);
  return { shown: all.slice(0, limit), total: all.length };
}

/** Steps of a group in deadline order, ties by their stored order (m2 BUG-44). */
export function stepsByDeadline(cal: WorkCalendar, eventDate: IsoDate, steps: ReadonlyArray<Step>): Step[] {
  return [...steps].sort((a, b) => calendarDaysBetween(deadlineOf(cal, eventDate, b), deadlineOf(cal, eventDate, a)) || a.sort - b.sort);
}
