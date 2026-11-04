// Every write of the progress feature. Each mutation audits with the legacy
// summary strings (m2 §4.1) and returns the inverse command its undo runs.

import { z } from 'zod';
import type { EventId, GroupId, StepId, Version } from '@/core/brand';
// Type-only: a runtime import of '@/core/commands' re-exports dispatch.ts, which reads the feature
// registry while this module is still loading (import cycle). Failures are DbErrors instead of CommandErrors.
import type { AuditEntry, CommandContext, CommandOutcome, CommandsOf, CommandSpec, Inverse, InputOf, Sig } from '@/core/commands';
import { formatVNDate } from '@/core/dates';
import { DbError, type Schema } from '@/core/db';
import { uuidV5 } from '@/core/legacy';
import { can } from '@/core/permissions';
import type { EventType } from '@/core/vocab';
import type { EventDraft, SceEvent, Step, StepLink, SubTask, TaskGroup } from '../contract';
import { instantiateTemplate } from '../domain/instantiate';
import {
  EVENT_TYPE_VALUES, eventDraftSchema, eventIdSchema, eventPatchSchema, groupFields, groupIdSchema, groupInputSchema,
  stepIdSchema, stepInputSchema, stepLinkSchema, stepPatchSchema, subTaskSchema, versionSchema,
  type GroupDraft, type GroupInput, type StepDraft, type StepInput,
} from '../domain/schemas';
import { eventsTable, groupsTable, stepInsertRow, stepsTable, type CompletionStamp, type EventRow, type GroupRow, type StepRow } from './tables';

declare module '@/core/commands' {
  interface CommandMap {
    'progress.createStep': Sig<{ eventId: EventId; groupId: GroupId; step: StepInput }, Step>;
    'progress.updateStep': Sig<{ eventId: EventId; stepId: StepId; version: Version; patch: Partial<StepDraft> }, Step>;
    'progress.deleteStep': Sig<{ eventId: EventId; stepId: StepId; version: Version }, null>;
    'progress.addSubTask': Sig<{ eventId: EventId; stepId: StepId; subTask: SubTask; index?: number }, Step>;
    'progress.setSubTaskDone': Sig<{ eventId: EventId; stepId: StepId; subTaskId: string; done: boolean }, Step>;
    'progress.removeSubTask': Sig<{ eventId: EventId; stepId: StepId; subTaskId: string }, Step>;
    'progress.addLink': Sig<{ eventId: EventId; stepId: StepId; link: StepLink; index?: number }, Step>;
    'progress.removeLink': Sig<{ eventId: EventId; stepId: StepId; linkId: string }, Step>;
    'progress.setGroupNote': Sig<{ eventId: EventId; groupId: GroupId; note: string }, TaskGroup>;
    'progress.createGroups': Sig<{ eventId: EventId; groups: ReadonlyArray<GroupInput> }, ReadonlyArray<TaskGroup>>;
    'progress.updateGroup': Sig<{ eventId: EventId; groupId: GroupId; version: Version; patch: Partial<GroupDraft> }, TaskGroup>;
    'progress.deleteGroups': Sig<{ eventId: EventId; groupIds: ReadonlyArray<GroupId> }, null>;
    'progress.applyTemplate': Sig<{ eventId: EventId; type: EventType }, ReadonlyArray<TaskGroup>>;
  }
}

const inverse = <K extends Inverse['command']>(command: K, input: InputOf<K>, label: string) => ({ command, input, label }) as Inverse;

const audit = (action: string, summary: string, eventId: EventId | null, entity: string, entityId: string): AuditEntry => ({ action, summary, eventId, entity, entityId });

const asSchema = <T>(s: z.ZodType): Schema<T> => s as unknown as Schema<T>;

const writeOnEvent = { perm: 'progress.write', event: (i: { eventId: EventId }) => i.eventId } as const;

async function eventRow(ctx: CommandContext, id: EventId): Promise<EventRow> {
  const event = await ctx.db.table(eventsTable).get(id);
  if (!event) throw new DbError('not_found');
  return event;
}

/** Editing the event row is for the lead department only (design: RBAC matrix). */
const leadDepartmentOf = async (ctx: CommandContext, id: EventId) => ({ departments: [(await ctx.db.table(eventsTable).get(id))?.department].filter((d) => d !== undefined) });

async function stepOf(ctx: CommandContext, eventId: EventId, stepId: StepId): Promise<{ event: EventRow; step: StepRow }> {
  const [event, step] = await Promise.all([eventRow(ctx, eventId), ctx.db.table(stepsTable).get(stepId)]);
  if (!step || step.eventId !== eventId) throw new DbError('not_found');
  return { event, step };
}

async function groupOf(ctx: CommandContext, eventId: EventId, groupId: GroupId): Promise<{ event: EventRow; group: GroupRow }> {
  const [event, group] = await Promise.all([eventRow(ctx, eventId), ctx.db.table(groupsTable).get(groupId)]);
  if (!group || group.eventId !== eventId) throw new DbError('not_found');
  return { event, group };
}

/** The only source of a completion stamp: the acting user and the command clock. */
const completionStamp = (ctx: CommandContext): CompletionStamp => ({ at: ctx.now, by: ctx.actor.profile.fullname || ctx.actor.profile.email });

const toEvent = (row: EventRow, status: SceEvent['status'] = 'preparing'): SceEvent => ({ ...row, status });

function stepSnapshot(s: Step): StepInput {
  return {
    id: s.id, name: s.name, requirement: s.requirement, targetPhase: s.targetPhase, offsetDays: s.offsetDays, dayType: s.dayType,
    assignee: s.assignee, templateKey: s.templateKey, subTasks: [...s.subTasks], links: [...s.links], sort: s.sort,
    done: s.completedAt !== null,
  };
}

async function insertGroups(ctx: CommandContext, eventId: EventId, groups: ReadonlyArray<GroupInput>): Promise<GroupRow[]> {
  const created = await ctx.db.table(groupsTable).insertMany(
    groups.map((g) => ({ id: g.id, eventId, phase: g.phase, name: g.name, leadPerson: g.leadPerson, note: g.note, sort: g.sort })),
  );
  const stamp = completionStamp(ctx);
  await ctx.db.table(stepsTable).insertMany(groups.flatMap((g) => g.steps.map((s) => stepInsertRow(s, eventId, g.id, stamp))));
  return created;
}

/** Template ids derive from the event, so applying a template twice converges instead of duplicating. */
function templateGroups(ctx: CommandContext, event: Pick<EventRow, 'id' | 'leadPerson'>, type: EventType): GroupInput[] {
  const scoped = (key: string) => uuidV5(event.id, `${type}|${key}`);
  return instantiateTemplate(type, { leadPerson: event.leadPerson, settings: ctx.settings }, {
    group: (key) => scoped(`group|${key}`) as GroupId,
    step: (key) => scoped(`step|${key}`) as StepId,
    subTask: (key, i) => scoped(`subtask|${key}|${i}`),
  });
}

type Spec<I, O> = CommandSpec<I, O>;
type EventDraftInput = { id: EventId; draft: EventDraft };

const createEvent: Spec<EventDraftInput, SceEvent> = {
  kind: 'mutation',
  input: asSchema(z.object({ id: eventIdSchema, draft: eventDraftSchema })),
  authorize: { perm: 'progress.create', resource: async (_ctx, i) => ({ departments: [i.draft.department] }) },
  async run(ctx, { id, draft }) {
    const { applyStandardTemplate, ...fields } = draft;
    const row = await ctx.db.table(eventsTable).insert({ ...fields, id, supportingDepartments: [...fields.supportingDepartments], deletedAt: null });
    if (applyStandardTemplate) await insertGroups(ctx, id, templateGroups(ctx, row, row.type));
    const outcome = { value: toEvent(row), audit: audit('TẠO SỰ KIỆN', `Tạo sự kiện mới: "${row.name}" (${formatVNDate(row.eventDate)})`, id, 'event', id) };
    // Undoing a create is a delete; offer it only to an actor the matrix lets delete (a chuyên viên may not).
    return can(ctx.actor, 'progress.delete', { departments: [row.department] })
      ? { ...outcome, inverse: inverse('progress.deleteEvent', { id, version: row.version }, `Tạo sự kiện "${row.name}"`) }
      : outcome;
  },
};

type EventPatch = InputOf<'progress.updateEvent'>['patch'];
const updateEvent: Spec<InputOf<'progress.updateEvent'>, SceEvent> = {
  kind: 'mutation',
  input: asSchema(z.object({ id: eventIdSchema, version: versionSchema, patch: eventPatchSchema })),
  authorize: { perm: 'progress.write', resource: (ctx, i) => leadDepartmentOf(ctx, i.id) },
  async run(ctx, { id, version, patch }) {
    const before = await eventRow(ctx, id);
    if (patch.department && patch.department !== before.department && !can(ctx.actor, 'progress.write', { departments: [patch.department] })) {
      throw new DbError('forbidden');
    }
    const department = patch.department ?? before.department;
    const supportingDepartments = (patch.supportingDepartments ?? before.supportingDepartments).filter((d) => d !== department);
    const next: EventPatch = { ...patch, ...(patch.department || patch.supportingDepartments ? { supportingDepartments } : {}) };
    const after = await ctx.db.table(eventsTable).update(id, { ...next, supportingDepartments: next.supportingDepartments && [...next.supportingDepartments] }, { expectedVersion: version });
    const old = Object.fromEntries(Object.keys(next).map((k) => [k, before[k as keyof EventPatch]])) as EventPatch;
    return {
      value: toEvent(after),
      audit: audit('CẬP NHẬT SỰ KIỆN', `Cập nhật thông tin sự kiện: "${after.name}"`, id, 'event', id),
      inverse: inverse('progress.updateEvent', { id, version: after.version, patch: old }, `Sửa sự kiện "${after.name}"`),
    };
  },
};

const deleteEvent: Spec<InputOf<'progress.deleteEvent'>, null> = {
  kind: 'mutation',
  input: asSchema(z.object({ id: eventIdSchema, version: versionSchema })),
  authorize: { perm: 'progress.delete', resource: (ctx, i) => leadDepartmentOf(ctx, i.id) },
  async run(ctx, { id, version }) {
    const row = await ctx.db.table(eventsTable).update(id, { deletedAt: ctx.now }, { expectedVersion: version });
    const outcome = { value: null, audit: audit('XÓA SỰ KIỆN', `Xóa sự kiện: "${row.name}"`, id, 'event', id) };
    // The restore finds the event through the same read: offer it only to an actor who can still see what they deleted.
    return (await ctx.db.table(eventsTable).get(id)) ? { ...outcome, inverse: inverse('progress.restoreEvent', { id }, `Xóa sự kiện "${row.name}"`) } : outcome;
  },
};

const restoreEvent: Spec<InputOf<'progress.restoreEvent'>, SceEvent> = {
  kind: 'mutation',
  input: asSchema(z.object({ id: eventIdSchema })),
  authorize: { perm: 'progress.delete', resource: (ctx, i) => leadDepartmentOf(ctx, i.id) },
  async run(ctx, { id }) {
    const row = await ctx.db.table(eventsTable).update(id, { deletedAt: null }, { overwrite: 'idempotent-set' });
    return {
      value: toEvent(row),
      audit: audit('KHÔI PHỤC SỰ KIỆN', `Khôi phục sự kiện: "${row.name}"`, id, 'event', id),
      inverse: inverse('progress.deleteEvent', { id, version: row.version }, `Khôi phục sự kiện "${row.name}"`),
    };
  },
};

const setStepDone: Spec<InputOf<'progress.setStepDone'>, Step> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, stepId: stepIdSchema, done: z.boolean() })),
  authorize: writeOnEvent,
  async run(ctx, { eventId, stepId, done }) {
    const { event, step } = await stepOf(ctx, eventId, stepId);
    const { at, by } = completionStamp(ctx);
    const next = done === (step.completedAt !== null) ? step : await ctx.db.table(stepsTable).update(stepId, done ? { completedAt: at, completedBy: by } : { completedAt: null, completedBy: null }, { overwrite: 'idempotent-set' });
    return {
      value: next,
      audit: audit('CẬP NHẬT TIẾN ĐỘ', `Cập nhật tiến độ: ${done ? 'Hoàn thành' : 'Chưa xong'} bước "${step.name}" (${event.name})`, eventId, 'step', stepId),
      inverse: inverse('progress.setStepDone', { eventId, stepId, done: !done }, `${done ? 'Hoàn thành' : 'Bỏ hoàn thành'} bước "${step.name}"`),
    };
  },
};

const createStep: Spec<InputOf<'progress.createStep'>, Step> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, groupId: groupIdSchema, step: stepInputSchema })),
  authorize: writeOnEvent,
  async run(ctx, { eventId, groupId, step }) {
    const { event } = await groupOf(ctx, eventId, groupId);
    const row = await ctx.db.table(stepsTable).insert(stepInsertRow(step, eventId, groupId, completionStamp(ctx)));
    return {
      value: row,
      audit: audit('CẬP NHẬT BƯỚC VIỆC', `Thêm bước việc: "${row.name}" (${event.name})${step.done ? ', đánh dấu hoàn thành' : ''}`, eventId, 'step', row.id),
      inverse: inverse('progress.deleteStep', { eventId, stepId: row.id, version: row.version }, `Thêm bước "${row.name}"`),
    };
  },
};

const updateStep: Spec<InputOf<'progress.updateStep'>, Step> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, stepId: stepIdSchema, version: versionSchema, patch: stepPatchSchema })),
  authorize: writeOnEvent,
  async run(ctx, { eventId, stepId, version, patch }) {
    const { event, step } = await stepOf(ctx, eventId, stepId);
    const row = await ctx.db.table(stepsTable).update(stepId, patch, { expectedVersion: version });
    const old = Object.fromEntries(Object.keys(patch).map((k) => [k, step[k as keyof StepDraft]])) as Partial<StepDraft>;
    return {
      value: row,
      audit: audit('CẬP NHẬT BƯỚC VIỆC', `Cập nhật bước việc: "${row.name}" (${event.name})`, eventId, 'step', stepId),
      inverse: inverse('progress.updateStep', { eventId, stepId, version: row.version, patch: old }, `Sửa bước "${row.name}"`),
    };
  },
};

const deleteStep: Spec<InputOf<'progress.deleteStep'>, null> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, stepId: stepIdSchema, version: versionSchema })),
  authorize: writeOnEvent,
  async run(ctx, { eventId, stepId, version }) {
    const { event, step } = await stepOf(ctx, eventId, stepId);
    await ctx.db.table(stepsTable).remove(stepId, { expectedVersion: version });
    return {
      value: null,
      audit: audit('XÓA BƯỚC VIỆC', `Xóa bước việc: "${step.name}" (${event.name})`, eventId, 'step', stepId),
      inverse: inverse('progress.createStep', { eventId, groupId: step.groupId, step: stepSnapshot(step) }, `Xóa bước "${step.name}"`),
    };
  },
};

/** Read-modify-write of one jsonb array on the step, guarded by the version just read. */
async function editStepList<K extends 'subTasks' | 'links'>(
  ctx: CommandContext,
  eventId: EventId,
  stepId: StepId,
  key: K,
  edit: (items: ReadonlyArray<Step[K][number]>) => ReadonlyArray<Step[K][number]>,
): Promise<{ event: EventRow; before: StepRow; after: StepRow }> {
  const { event, step } = await stepOf(ctx, eventId, stepId);
  const items = edit(step[key]);
  const after = items === step[key] ? step : await ctx.db.table(stepsTable).update(stepId, { [key]: items } as Partial<Step>, { expectedVersion: step.version });
  return { event, before: step, after };
}

const insertAt = <T>(items: ReadonlyArray<T>, item: T, index: number | undefined): T[] => {
  const at = index === undefined ? items.length : Math.max(0, Math.min(index, items.length));
  return [...items.slice(0, at), item, ...items.slice(at)];
};

const stepItemTarget = { eventId: eventIdSchema, stepId: stepIdSchema };

const addSubTask: Spec<InputOf<'progress.addSubTask'>, Step> = {
  kind: 'mutation',
  input: asSchema(z.object({ ...stepItemTarget, subTask: subTaskSchema, index: z.number().int().min(0).optional() })),
  authorize: writeOnEvent,
  async run(ctx, { eventId, stepId, subTask, index }) {
    const { after } = await editStepList(ctx, eventId, stepId, 'subTasks', (items) => (items.some((t) => t.id === subTask.id) ? items : insertAt(items, subTask, index)));
    return {
      value: after,
      audit: audit('CẬP NHẬT VIỆC NHỎ', `Thêm việc nhỏ: "${subTask.name}" (${after.name})`, eventId, 'step', stepId),
      inverse: inverse('progress.removeSubTask', { eventId, stepId, subTaskId: subTask.id }, `Thêm việc nhỏ "${subTask.name}"`),
    };
  },
};

const setSubTaskDone: Spec<InputOf<'progress.setSubTaskDone'>, Step> = {
  kind: 'mutation',
  input: asSchema(z.object({ ...stepItemTarget, subTaskId: z.string().min(1), done: z.boolean() })),
  authorize: writeOnEvent,
  async run(ctx, { eventId, stepId, subTaskId, done }) {
    const { before, after } = await editStepList(ctx, eventId, stepId, 'subTasks', (items) =>
      items.some((t) => t.id === subTaskId && t.completed !== done) ? items.map((t) => (t.id === subTaskId ? { ...t, completed: done } : t)) : items,
    );
    const task = before.subTasks.find((t) => t.id === subTaskId);
    if (!task) throw new DbError('not_found');
    return {
      value: after,
      audit: audit('CẬP NHẬT VIỆC NHỎ', `Cập nhật việc nhỏ: "${task.name}"`, eventId, 'step', stepId),
      inverse: inverse('progress.setSubTaskDone', { eventId, stepId, subTaskId, done: !done }, `${done ? 'Xong' : 'Bỏ xong'} việc nhỏ "${task.name}"`),
    };
  },
};

const removeSubTask: Spec<InputOf<'progress.removeSubTask'>, Step> = {
  kind: 'mutation',
  input: asSchema(z.object({ ...stepItemTarget, subTaskId: z.string().min(1) })),
  authorize: writeOnEvent,
  async run(ctx, { eventId, stepId, subTaskId }) {
    const { before, after } = await editStepList(ctx, eventId, stepId, 'subTasks', (items) => (items.some((t) => t.id === subTaskId) ? items.filter((t) => t.id !== subTaskId) : items));
    const index = before.subTasks.findIndex((t) => t.id === subTaskId);
    const task = before.subTasks[index];
    if (!task) return { value: after, audit: audit('CẬP NHẬT VIỆC NHỎ', `Xóa việc nhỏ trong bước "${after.name}"`, eventId, 'step', stepId) };
    return {
      value: after,
      audit: audit('CẬP NHẬT VIỆC NHỎ', `Xóa việc nhỏ "${task.name}" trong bước "${after.name}"`, eventId, 'step', stepId),
      inverse: inverse('progress.addSubTask', { eventId, stepId, subTask: task, index }, `Xóa việc nhỏ "${task.name}"`),
    };
  },
};

const addLink: Spec<InputOf<'progress.addLink'>, Step> = {
  kind: 'mutation',
  input: asSchema(z.object({ ...stepItemTarget, link: stepLinkSchema, index: z.number().int().min(0).optional() })),
  authorize: writeOnEvent,
  async run(ctx, { eventId, stepId, link, index }) {
    const { after } = await editStepList(ctx, eventId, stepId, 'links', (items) => (items.some((l) => l.id === link.id) ? items : insertAt(items, link, index)));
    return {
      value: after,
      audit: audit('CẬP NHẬT TÀI LIỆU', `Thêm liên kết tài liệu: "${link.name}" (${after.name})`, eventId, 'step', stepId),
      inverse: inverse('progress.removeLink', { eventId, stepId, linkId: link.id }, `Thêm liên kết "${link.name}"`),
    };
  },
};

const removeLink: Spec<InputOf<'progress.removeLink'>, Step> = {
  kind: 'mutation',
  input: asSchema(z.object({ ...stepItemTarget, linkId: z.string().min(1) })),
  authorize: writeOnEvent,
  async run(ctx, { eventId, stepId, linkId }) {
    const { before, after } = await editStepList(ctx, eventId, stepId, 'links', (items) => (items.some((l) => l.id === linkId) ? items.filter((l) => l.id !== linkId) : items));
    const index = before.links.findIndex((l) => l.id === linkId);
    const link = before.links[index];
    if (!link) return { value: after, audit: audit('CẬP NHẬT TÀI LIỆU', `Xóa đính kèm trong bước "${after.name}"`, eventId, 'step', stepId) };
    return {
      value: after,
      audit: audit('CẬP NHẬT TÀI LIỆU', `Xóa đính kèm "${link.name}" trong bước "${after.name}"`, eventId, 'step', stepId),
      inverse: inverse('progress.addLink', { eventId, stepId, link, index }, `Xóa liên kết "${link.name}"`),
    };
  },
};

const setGroupNote: Spec<InputOf<'progress.setGroupNote'>, TaskGroup> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, groupId: groupIdSchema, note: groupFields.shape.note })),
  authorize: writeOnEvent,
  async run(ctx, { eventId, groupId, note }) {
    const { event, group } = await groupOf(ctx, eventId, groupId);
    const row = note === group.note ? group : await ctx.db.table(groupsTable).update(groupId, { note }, { overwrite: 'idempotent-set' });
    const summary = note ? `Cập nhật ghi chú nhóm "${group.name}" (${event.name})` : `Xóa ghi chú nhóm "${group.name}"`;
    return {
      value: row,
      audit: audit('CẬP NHẬT GHI CHÚ', summary, eventId, 'group', groupId),
      inverse: inverse('progress.setGroupNote', { eventId, groupId, note: group.note }, note ? `Ghi chú nhóm "${group.name}"` : `Xóa ghi chú nhóm "${group.name}"`),
    };
  },
};

const createGroups: Spec<InputOf<'progress.createGroups'>, ReadonlyArray<TaskGroup>> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, groups: z.array(groupInputSchema).min(1).max(50) })),
  authorize: writeOnEvent,
  async run(ctx, { eventId, groups }) {
    const event = await eventRow(ctx, eventId);
    const created = await insertGroups(ctx, eventId, groups);
    const label = groups.length === 1 ? `"${groups[0]!.name}"` : `${groups.length} nhóm việc`;
    const completed = groups.reduce((n, g) => n + g.steps.filter((s) => s.done).length, 0);
    return {
      value: created,
      audit: audit('CẬP NHẬT NHÓM VIỆC', `Thêm nhóm việc ${label} (${event.name})${completed > 0 ? `, đánh dấu hoàn thành ${completed} bước` : ''}`, eventId, 'group', groups.map((g) => g.id).join(',')),
      inverse: inverse('progress.deleteGroups', { eventId, groupIds: groups.map((g) => g.id) }, `Thêm nhóm việc ${label}`),
    };
  },
};

const updateGroup: Spec<InputOf<'progress.updateGroup'>, TaskGroup> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, groupId: groupIdSchema, version: versionSchema, patch: groupFields.partial() })),
  authorize: writeOnEvent,
  async run(ctx, { eventId, groupId, version, patch }) {
    const { event, group } = await groupOf(ctx, eventId, groupId);
    const row = await ctx.db.table(groupsTable).update(groupId, patch, { expectedVersion: version });
    const old = Object.fromEntries(Object.keys(patch).map((k) => [k, group[k as keyof GroupDraft]])) as Partial<GroupDraft>;
    return {
      value: row,
      audit: audit('CẬP NHẬT NHÓM VIỆC', `Cập nhật nhóm việc "${row.name}" (${event.name})`, eventId, 'group', groupId),
      inverse: inverse('progress.updateGroup', { eventId, groupId, version: row.version, patch: old }, `Sửa nhóm "${row.name}"`),
    };
  },
};

const deleteGroups: Spec<InputOf<'progress.deleteGroups'>, null> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, groupIds: z.array(groupIdSchema).min(1).max(50) })),
  authorize: writeOnEvent,
  async run(ctx, { eventId, groupIds }) {
    const event = await eventRow(ctx, eventId);
    const ids = [...groupIds];
    const [groups, steps] = await Promise.all([
      ctx.db.table(groupsTable).list({ eventId, id: ids }),
      ctx.db.table(stepsTable).list({ eventId, groupId: ids }),
    ]);
    if (groups.length === 0) throw new DbError('not_found');
    // Postgres cascades steps with their group; deleting them first keeps the in-memory test Db equivalent.
    if (steps.length > 0) await ctx.db.table(stepsTable).removeWhere({ eventId, groupId: groups.map((g) => g.id) });
    await ctx.db.table(groupsTable).removeWhere({ eventId, id: groups.map((g) => g.id) });
    const snapshot: GroupInput[] = groups.map((g) => ({
      id: g.id, phase: g.phase, name: g.name, leadPerson: g.leadPerson, note: g.note, sort: g.sort,
      steps: steps.filter((s) => s.groupId === g.id).map(stepSnapshot),
    }));
    const label = groups.length === 1 ? `"${groups[0]!.name}"` : `${groups.length} nhóm việc`;
    return {
      value: null,
      audit: audit('XÓA NHÓM VIỆC', `Xóa nhóm việc ${label} (${event.name})`, eventId, 'group', groups.map((g) => g.id).join(',')),
      inverse: inverse('progress.createGroups', { eventId, groups: snapshot }, `Xóa nhóm việc ${label}`),
    };
  },
};

const applyTemplate: Spec<InputOf<'progress.applyTemplate'>, ReadonlyArray<TaskGroup>> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, type: z.enum(EVENT_TYPE_VALUES) })),
  authorize: writeOnEvent,
  async run(ctx, { eventId, type }) {
    const event = await eventRow(ctx, eventId);
    const existing = new Set((await ctx.db.table(groupsTable).list({ eventId })).map((g) => g.id));
    const fresh = templateGroups(ctx, event, type).filter((g) => !existing.has(g.id));
    const created = fresh.length > 0 ? await insertGroups(ctx, eventId, fresh) : [];
    const outcome: CommandOutcome<ReadonlyArray<TaskGroup>> = {
      value: created,
      audit: audit('ÁP DỤNG QUY TRÌNH CHUẨN', `Áp dụng quy trình chuẩn SCE (${fresh.length} nhóm việc) cho "${event.name}"`, eventId, 'event', eventId),
    };
    return fresh.length > 0 ? { ...outcome, inverse: inverse('progress.deleteGroups', { eventId, groupIds: fresh.map((g) => g.id) }, 'Áp dụng quy trình chuẩn') } : outcome;
  },
};

export const commands: CommandsOf<'progress'> = {
  createEvent, updateEvent, deleteEvent, restoreEvent, setStepDone,
  createStep, updateStep, deleteStep,
  addSubTask, setSubTaskDone, removeSubTask, addLink, removeLink,
  setGroupNote, createGroups, updateGroup, deleteGroups, applyTemplate,
};
