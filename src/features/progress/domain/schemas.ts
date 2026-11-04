// Zod schemas shared by the forms (useZodForm) and the commands (input
// parsing), so the browser and the server validate the same rules.

import { z } from 'zod';
import { parseUuid, type EventId, type GroupId, type HHmm, type IsoDate, type SafeUrl, type StepId, type Uuid, type Vnd, type Version } from '@/core/brand';
import { parseHHmm, parseIsoDate } from '@/core/dates';
import { parseSafeUrl } from '@/core/text';
import { DEPARTMENTS, type DepartmentName, type EventType } from '@/core/vocab';
import type { DayType, GroupPhase, StepLink, StepPhase, SubTask } from '../contract';

export const uuidOf = <E extends string>() =>
  z.string().refine((v) => parseUuid(v) !== null, 'Mã không hợp lệ').transform((v) => parseUuid<E>(v) as Uuid<E>);
export const eventIdSchema = uuidOf<'Event'>() as z.ZodType<EventId, string>;
export const groupIdSchema = uuidOf<'TaskGroup'>() as z.ZodType<GroupId, string>;
export const stepIdSchema = uuidOf<'Step'>() as z.ZodType<StepId, string>;
export const versionSchema = z.number().int().positive().transform((v) => v as Version);

const isoDate = (message: string) =>
  z.string({ error: message }).refine((v) => parseIsoDate(v) !== null, message).transform((v) => v as IsoDate);
const hhmm = z.string().refine((v) => parseHHmm(v) !== null, 'Giờ không hợp lệ').transform((v) => parseHHmm(v) as HHmm);
const text = (max: number) => z.string().trim().max(max, `Tối đa ${max} ký tự`);
const required = (max: number, message: string) => z.string({ error: message }).trim().min(1, message).max(max, `Tối đa ${max} ký tự`);

export const CHAIR_DEPARTMENTS: ReadonlyArray<DepartmentName> = DEPARTMENTS.filter((d) => d.canChairEvents).map((d) => d.name);
const departmentSchema = z.enum(CHAIR_DEPARTMENTS as [DepartmentName, ...DepartmentName[]], { error: 'Vui lòng chọn phòng ban chủ trì' });

export const EVENT_TYPE_VALUES = ['hoi_nghi', 'hoi_cho'] as const satisfies ReadonlyArray<EventType>;
export const STEP_PHASES = ['before', 'dday', 'after'] as const satisfies ReadonlyArray<StepPhase>;
export const DAY_TYPES = ['workday', 'calendar'] as const satisfies ReadonlyArray<DayType>;
export const GROUP_PHASES = ['phase_prepare', 'phase_dday'] as const satisfies ReadonlyArray<GroupPhase>;

export const MAX_GUESTS = 100_000;
export const MAX_OFFSET_DAYS = 365;

export const eventFields = z.object({
  name: required(300, 'Vui lòng nhập tên sự kiện'),
  type: z.enum(EVENT_TYPE_VALUES),
  eventDate: isoDate('Vui lòng chọn ngày tổ chức'),
  eventTime: hhmm,
  location: text(300),
  department: departmentSchema,
  supportingDepartments: z.array(departmentSchema).max(CHAIR_DEPARTMENTS.length),
  leadPerson: text(200),
  budget: z.number().int().min(0, 'Kinh phí không âm').max(Number.MAX_SAFE_INTEGER).nullable().transform((v) => v as Vnd | null),
  targetGuests: z.number({ error: 'Vui lòng nhập số khách dự kiến' }).int('Số khách là số nguyên').min(1, 'Ít nhất 1 khách').max(MAX_GUESTS),
  note: text(5000),
});

/** The lead department never doubles as a supporting one. */
const withoutLead = <T extends { department?: DepartmentName; supportingDepartments?: ReadonlyArray<DepartmentName> }>(d: T): T =>
  d.supportingDepartments ? { ...d, supportingDepartments: [...new Set(d.supportingDepartments)].filter((x) => x !== d.department) } : d;

export const eventDraftSchema = eventFields.extend({ applyStandardTemplate: z.boolean() }).transform(withoutLead);
export const eventPatchSchema = eventFields.partial().transform(withoutLead);

export const stepFields = z.object({
  name: required(300, 'Vui lòng nhập tên công việc'),
  requirement: text(5000),
  targetPhase: z.enum(STEP_PHASES),
  offsetDays: z.number({ error: 'Nhập số ngày' }).int('Số ngày là số nguyên').min(0, 'Không âm').max(MAX_OFFSET_DAYS, `Tối đa ${MAX_OFFSET_DAYS} ngày`),
  dayType: z.enum(DAY_TYPES),
  assignee: text(200),
  /** Shown as text and passed to templates.resolveTemplateKey only (m2 BUG-18). */
  templateKey: text(100).regex(/^[A-Za-z0-9_-]*$/, 'Mã biểu mẫu chỉ gồm chữ không dấu, số, "_" và "-"'),
});
/** A day-of step is due on T0, so its offset is 0. */
const ddayOffset = <T extends { targetPhase?: StepPhase; offsetDays?: number }>(d: T): T => (d.targetPhase === 'dday' ? { ...d, offsetDays: 0 } : d);
export const stepDraftSchema = stepFields.transform(ddayOffset);
export const stepPatchSchema = stepFields.partial().transform(ddayOffset);
export type StepDraft = z.output<typeof stepDraftSchema>;

export const subTaskFields = z.object({ name: required(300, 'Vui lòng nhập tên việc nhỏ') });
export const subTaskSchema: z.ZodType<SubTask, unknown> = subTaskFields.extend({ id: z.string().min(1).max(64), completed: z.boolean() });

/** http(s) only: `javascript:` and friends never parse (m2 BUG-19). */
export const safeUrlSchema = z
  .string({ error: 'Vui lòng nhập đường dẫn' })
  .trim()
  .refine((v) => parseSafeUrl(v) !== null, 'Đường dẫn phải bắt đầu bằng http:// hoặc https://')
  .transform((v) => parseSafeUrl(v) as SafeUrl);
export const linkFields = z.object({ name: required(300, 'Vui lòng nhập tên tài liệu'), url: safeUrlSchema });
export const stepLinkSchema: z.ZodType<StepLink, unknown> = linkFields.extend({ id: z.string().min(1).max(64) });

export const groupFields = z.object({
  phase: z.enum(GROUP_PHASES),
  name: required(300, 'Vui lòng nhập tên nhóm việc'),
  leadPerson: text(200),
  note: text(2000),
});
export type GroupDraft = z.output<typeof groupFields>;
export const groupNoteFields = z.object({ note: groupFields.shape.note.min(1, 'Vui lòng nhập nội dung ghi chú') });

/**
 * A whole step as the commands take it, for template instantiation and for undoing a delete. `done` asks the server to stamp
 * the step as completed by the caller now; who and when are never read from input (review finding 1).
 */
export const stepInputSchema = stepFields.extend({
  id: stepIdSchema,
  subTasks: z.array(subTaskSchema).max(100),
  links: z.array(stepLinkSchema).max(100),
  sort: z.number().int(),
  done: z.boolean(),
});
export type StepInput = z.output<typeof stepInputSchema>;

export const groupInputSchema = groupFields.extend({
  id: groupIdSchema,
  sort: z.number().int(),
  steps: z.array(stepInputSchema).max(200),
});
export type GroupInput = z.output<typeof groupInputSchema>;
