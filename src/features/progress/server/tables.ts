// The three tables progress owns, described once (0002_domain_tables.sql).

import { z } from 'zod';
import type { EventId, GroupId, HHmm, Instant, IsoDate, StepId, UserId, Vnd, Version } from '@/core/brand';
import { parseHHmm, parseInstant, parseIsoDate } from '@/core/dates';
import { defineTable, type BaseRow } from '@/core/db';
import { parseSafeUrl } from '@/core/text';
import { isDepartmentName, type DepartmentName } from '@/core/vocab';
import type { SceEvent, Step, StepLink, SubTask, TaskGroup } from '../contract';
import { DAY_TYPES, EVENT_TYPE_VALUES, GROUP_PHASES, STEP_PHASES } from '../domain/schemas';

const instant = z.string().transform((v) => (parseInstant(v) ?? v) as Instant);
const managed = {
  version: z.number().transform((v) => v as Version),
  createdAt: instant,
  createdBy: z.string().nullable().transform((v) => v as UserId | null),
  updatedAt: instant,
  updatedBy: z.string().nullable().transform((v) => v as UserId | null),
};
const department = z.string().refine(isDepartmentName).transform((v) => v as DepartmentName);

/** `status` is not read: whether an event is complete is derived from its steps (decision 3). */
export type EventRow = Omit<SceEvent, 'status'> & BaseRow & { id: EventId };
export const eventsTable = defineTable<EventRow>({
  name: 'sce_tcsk_events',
  owner: 'progress',
  eventScoped: false,
  columns: { budget: 'budget_vnd' },
  orderBy: [{ column: 'eventDate', ascending: true }],
  row: z.object({
    ...managed,
    id: z.string().transform((v) => v as EventId),
    name: z.string(),
    type: z.enum(EVENT_TYPE_VALUES),
    eventDate: z.string().refine((v) => parseIsoDate(v) !== null).transform((v) => v as IsoDate),
    eventTime: z.string().transform((v) => (parseHHmm(v) ?? '08:30') as HHmm),
    location: z.string(),
    department,
    supportingDepartments: z.array(department),
    leadPerson: z.string(),
    budget: z.number().nullable().transform((v) => v as Vnd | null),
    targetGuests: z.number(),
    note: z.string(),
    deletedAt: instant.nullable(),
  }),
});

export type GroupRow = TaskGroup & BaseRow & { id: GroupId };
export const groupsTable = defineTable<GroupRow>({
  name: 'sce_tcsk_task_groups',
  owner: 'progress',
  eventScoped: true,
  orderBy: [{ column: 'sort', ascending: true }],
  row: z.object({
    ...managed,
    id: z.string().transform((v) => v as GroupId),
    eventId: z.string().transform((v) => v as EventId),
    phase: z.enum(GROUP_PHASES),
    name: z.string(),
    leadPerson: z.string(),
    note: z.string(),
    sort: z.number(),
  }),
});

// jsonb arrays: a malformed entry is dropped rather than failing the whole plan.
const subTasks = z.array(z.unknown()).transform((items) =>
  items.flatMap((t): SubTask[] => {
    const r = z.object({ id: z.union([z.string(), z.number()]), name: z.string(), completed: z.boolean() }).safeParse(t);
    return r.success ? [{ id: String(r.data.id), name: r.data.name, completed: r.data.completed }] : [];
  }),
);
const links = z.array(z.unknown()).transform((items) =>
  items.flatMap((l): StepLink[] => {
    const r = z.object({ id: z.string(), name: z.string(), url: z.string() }).safeParse(l);
    const url = r.success ? parseSafeUrl(r.data.url) : null;
    return r.success && url ? [{ id: r.data.id, name: r.data.name, url }] : [];
  }),
);

export type StepRow = Step & BaseRow & { id: StepId };
export const stepsTable = defineTable<StepRow>({
  name: 'sce_tcsk_steps',
  owner: 'progress',
  eventScoped: true,
  orderBy: [{ column: 'sort', ascending: true }],
  row: z.object({
    ...managed,
    id: z.string().transform((v) => v as StepId),
    eventId: z.string().transform((v) => v as EventId),
    groupId: z.string().transform((v) => v as GroupId),
    name: z.string(),
    requirement: z.string(),
    offsetDays: z.number(),
    dayType: z.enum(DAY_TYPES),
    targetPhase: z.enum(STEP_PHASES),
    completedAt: instant.nullable(),
    completedBy: z.string().nullable(),
    assignee: z.string(),
    templateKey: z.string(),
    subTasks,
    links,
    sort: z.number(),
  }),
});
