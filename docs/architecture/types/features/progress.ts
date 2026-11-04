// Contract of feature `progress` (M2). Events are the root aggregate; every
// event-scoped table references sce_tcsk_events(id) ON DELETE CASCADE.
// Other features read events only through these types and functions.

import type { EventId, GroupId, HHmm, Instant, IsoDate, SafeUrl, StepId, UserId, Vnd, Version } from '../core/brand';
import type { RequestContext } from '../core/auth';
import type { Countdown, WorkCalendar } from '../core/dates';
import type { SystemSettings } from '../core/settings';
import type { DepartmentName, EventType } from '../core/vocab';
import type { Sig } from '../core/commands';

export type EventStatus = 'preparing' | 'completed';

export interface SceEvent {
  id: EventId;
  name: string;
  type: EventType;
  eventDate: IsoDate;
  eventTime: HHmm;
  location: string;
  /** Chủ trì. */
  department: DepartmentName;
  /** Phối hợp. Grants these departments the same department-scoped access (Q1 default). */
  supportingDepartments: ReadonlyArray<DepartmentName>;
  leadPerson: string;
  budget: Vnd | null;
  targetGuests: number;
  status: EventStatus;
  note: string;
  /** Soft delete; hidden from everyone but admin, restorable, purged by admin only. */
  deletedAt: Instant | null;
  version: Version;
  createdAt: Instant;
  createdBy: UserId | null;
  updatedAt: Instant;
}

export type GroupPhase = 'phase_prepare' | 'phase_dday';
export type StepPhase = 'before' | 'dday' | 'after';
export type DayType = 'workday' | 'calendar';

export interface TaskGroup {
  id: GroupId;
  eventId: EventId;
  phase: GroupPhase;
  name: string;
  leadPerson: string;
  note: string;
  sort: number;
  version: Version;
}

export interface SubTask { id: string; name: string; completed: boolean }
export interface StepLink { id: string; name: string; url: SafeUrl }

export interface Step {
  id: StepId;
  eventId: EventId;
  groupId: GroupId;
  name: string;
  requirement: string;
  offsetDays: number;
  dayType: DayType;
  targetPhase: StepPhase;
  /** Deadline is derived (deadlineOf), never stored (m2 Q4). */
  completedAt: Instant | null;
  completedBy: string | null;
  assignee: string;
  /** Resolved by templates.resolveTemplateKey; unknown keys show "Chưa gắn biểu mẫu". */
  templateKey: string;
  subTasks: ReadonlyArray<SubTask>;
  links: ReadonlyArray<StepLink>;
  sort: number;
  version: Version;
}

export interface EventPlan {
  event: SceEvent;
  groups: ReadonlyArray<TaskGroup & { steps: ReadonlyArray<Step> }>;
}

// ---- pure selectors other features must use instead of re-deriving ----
export function deadlineOf(cal: WorkCalendar, eventDate: IsoDate, step: Pick<Step, 'offsetDays' | 'dayType' | 'targetPhase'>): IsoDate {
  throw new Error('not implemented');
}
export type StepState = 'done' | 'overdue' | 'due_soon' | 'upcoming';
export function stepState(cal: WorkCalendar, eventDate: IsoDate, step: Step, today: IsoDate): StepState {
  throw new Error('not implemented');
}
export interface EventProgress {
  total: number;
  done: number;
  overdue: number;
  dueSoon: number;
  percent: number;
}
export function eventProgress(cal: WorkCalendar, plan: EventPlan, today: IsoDate): EventProgress {
  throw new Error('not implemented');
}
export function eventCountdown(cal: WorkCalendar, event: SceEvent, today: IsoDate): Countdown {
  throw new Error('not implemented');
}
/** today <= T0 and workdays until T0 <= settings.dailyReportThresholdDays (m2 §3.5 intended). */
export function isInDailyReportWindow(cal: WorkCalendar, event: SceEvent, today: IsoDate, s: SystemSettings): boolean {
  throw new Error('not implemented');
}

// ---- server reads (import from '@/features/progress/server') ----
export interface EventListFilter {
  includeDeleted?: boolean;
}
export function listEvents(ctx: RequestContext, f?: EventListFilter): Promise<ReadonlyArray<SceEvent>> {
  throw new Error('not implemented');
}
/** null when absent or not visible; the event layout turns null into notFound(). */
export function readEvent(ctx: RequestContext, id: EventId): Promise<SceEvent | null> {
  throw new Error('not implemented');
}
export function readEventPlan(ctx: RequestContext, id: EventId): Promise<EventPlan | null> {
  throw new Error('not implemented');
}

// ---- commands other features or the shell call ----
export interface EventDraft {
  name: string;
  type: EventType;
  eventDate: IsoDate;
  eventTime: HHmm;
  location: string;
  department: DepartmentName;
  supportingDepartments: ReadonlyArray<DepartmentName>;
  leadPerson: string;
  budget: Vnd | null;
  targetGuests: number;
  note: string;
  applyStandardTemplate: boolean;
}

declare module '../core/commands' {
  interface CommandMap {
    'progress.createEvent': Sig<{ id: EventId; draft: EventDraft }, SceEvent>;
    'progress.updateEvent': Sig<{ id: EventId; version: Version; patch: Partial<Omit<EventDraft, 'applyStandardTemplate'>> }, SceEvent>;
    'progress.deleteEvent': Sig<{ id: EventId; version: Version }, null>;
    'progress.restoreEvent': Sig<{ id: EventId }, SceEvent>;
    'progress.setStepDone': Sig<{ eventId: EventId; stepId: StepId; done: boolean }, Step>;
  }
}
declare module '../core/permissions' {
  interface PermissionMap {
    'progress.read': true;
    'progress.write': true;
    'progress.create': true;
    'progress.delete': true;
  }
}
