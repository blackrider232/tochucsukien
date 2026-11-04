'use client';

// Shared by the dashboard and the plan page: the current plans, what the
// actor may do on each event, and every dialog and confirm of the plan.
// Dialog targets are ids resolved against the latest plans, so a dialog that
// stays open across router.refresh() shows fresh data.

import { useRouter } from 'next/navigation';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Dialog, useDialogs } from '@/components/ui';
import type { EventId, GroupId, IsoDate, StepId } from '@/core/brand';
import { useCommand } from '@/core/commands';
import { EVENT_TYPES, type DepartmentName } from '@/core/vocab';
import type { EventPlan, SceEvent, Step, TaskGroup } from '../contract';
import { templateStepCount } from '../domain/instantiate';
import { EventForm } from './event-form';
import { GroupDialog, LinksDialog, NoteDialog, StepDialog, SubTasksDialog } from './plan-dialogs';
import { useToday } from './use-today';

export interface EventPerms {
  /** Steps, groups, notes: lead and supporting departments. */
  write: boolean;
  /** The event row itself: lead department only. */
  edit: boolean;
  remove: boolean;
}
export interface PlanScreenData {
  plans: ReadonlyArray<EventPlan>;
  perms: Readonly<Record<string, EventPerms>>;
  today: IsoDate;
  /** Departments the actor may create an event for; empty when they may not create. */
  createDepartments: ReadonlyArray<DepartmentName>;
}

type Target =
  | { kind: 'event'; eventId: EventId }
  | { kind: 'step'; eventId: EventId; groupId: GroupId; stepId: StepId | null }
  | { kind: 'subtasks' | 'links'; eventId: EventId; stepId: StepId }
  | { kind: 'note'; eventId: EventId; groupId: GroupId }
  | { kind: 'group'; eventId: EventId; groupId: GroupId | null; phase: TaskGroup['phase'] };

interface PlanApi {
  data: PlanScreenData;
  today: IsoDate;
  permsOf(eventId: EventId): EventPerms;
  editEvent(eventId: EventId): void;
  deleteEvent(event: SceEvent): Promise<void>;
  applyTemplate(event: SceEvent): Promise<void>;
  openStep(eventId: EventId, groupId: GroupId, stepId?: StepId): void;
  openSubTasks(eventId: EventId, stepId: StepId): void;
  openLinks(eventId: EventId, stepId: StepId): void;
  openNote(eventId: EventId, groupId: GroupId): void;
  openGroup(eventId: EventId, phase: TaskGroup['phase'], groupId?: GroupId): void;
  toggleStep(eventId: EventId, step: Step, done: boolean): Promise<void>;
  setSubTask(eventId: EventId, stepId: StepId, subTaskId: string, done: boolean): Promise<void>;
  deleteStep(event: SceEvent, step: Step): Promise<void>;
  deleteGroup(event: SceEvent, group: EventPlan['groups'][number]): Promise<void>;
  clearNote(event: SceEvent, group: TaskGroup): Promise<void>;
}

const NO_PERMS: EventPerms = { write: false, edit: false, remove: false };
const Ctx = createContext<PlanApi | null>(null);

export function usePlan(): PlanApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('usePlan needs <PlanProvider> above it.');
  return api;
}

export function PlanProvider({ data, children, afterDelete }: { data: PlanScreenData; children: ReactNode; afterDelete?: () => void }) {
  const run = useCommand();
  const dialogs = useDialogs();
  const router = useRouter();
  const today = useToday(data.today);
  const [target, setTarget] = useState<Target | null>(null);
  const close = () => setTarget(null);

  const api = useMemo<PlanApi>(() => ({
    data,
    today,
    permsOf: (id) => data.perms[id] ?? NO_PERMS,
    editEvent: (eventId) => setTarget({ kind: 'event', eventId }),
    async deleteEvent(event) {
      const ok = await dialogs.confirm({
        title: 'Xác nhận xóa sự kiện?',
        text: `Sự kiện "${event.name}" cùng toàn bộ tiến độ sẽ bị gỡ khỏi danh sách. Quản trị viên có thể khôi phục.`,
        confirmLabel: 'Đồng ý xóa', cancelLabel: 'Hủy', tone: 'danger',
      });
      if (ok && (await run('progress.deleteEvent', { id: event.id, version: event.version }, { success: `Đã xóa sự kiện "${event.name}"` })) !== undefined) afterDelete?.();
    },
    async applyTemplate(event) {
      const ok = await dialogs.confirm({
        title: 'Áp dụng quy trình chuẩn SCE?',
        text: `Thêm 7 nhóm việc và ${templateStepCount(event.type)} bước của quy trình chuẩn ${EVENT_TYPES[event.type].short} vào "${event.name}".`,
        confirmLabel: 'Áp dụng', cancelLabel: 'Hủy',
      });
      if (ok) await run('progress.applyTemplate', { eventId: event.id, type: event.type }, { success: 'Đã áp dụng quy trình chuẩn SCE' });
    },
    openStep: (eventId, groupId, stepId) => setTarget({ kind: 'step', eventId, groupId, stepId: stepId ?? null }),
    openSubTasks: (eventId, stepId) => setTarget({ kind: 'subtasks', eventId, stepId }),
    openLinks: (eventId, stepId) => setTarget({ kind: 'links', eventId, stepId }),
    openNote: (eventId, groupId) => setTarget({ kind: 'note', eventId, groupId }),
    openGroup: (eventId, phase, groupId) => setTarget({ kind: 'group', eventId, phase, groupId: groupId ?? null }),
    async toggleStep(eventId, step, done) {
      await run('progress.setStepDone', { eventId, stepId: step.id, done });
    },
    async setSubTask(eventId, stepId, subTaskId, done) {
      await run('progress.setSubTaskDone', { eventId, stepId, subTaskId, done });
    },
    async deleteStep(event, step) {
      const ok = await dialogs.confirm({ title: 'Xóa bước công việc?', text: `Bạn có chắc muốn xóa bước "${step.name}"?`, confirmLabel: 'Xóa', cancelLabel: 'Hủy', tone: 'danger' });
      if (ok) await run('progress.deleteStep', { eventId: event.id, stepId: step.id, version: step.version }, { success: `Đã xóa bước "${step.name}"` });
    },
    async deleteGroup(event, group) {
      const ok = await dialogs.confirm({
        title: 'Xóa nhóm việc?', text: `Nhóm "${group.name}" và ${group.steps.length} bước việc của nhóm sẽ bị xóa.`, confirmLabel: 'Xóa nhóm', cancelLabel: 'Hủy', tone: 'danger',
      });
      if (ok) await run('progress.deleteGroups', { eventId: event.id, groupIds: [group.id] }, { success: `Đã xóa nhóm "${group.name}"` });
    },
    async clearNote(event, group) {
      const ok = await dialogs.confirm({ title: 'Xóa ghi chú nhóm?', text: `Xóa ghi chú của "${group.name}".`, confirmLabel: 'Xóa', cancelLabel: 'Hủy', tone: 'danger' });
      if (ok) await run('progress.setGroupNote', { eventId: event.id, groupId: group.id, note: '' }, { success: 'Đã xóa ghi chú nhóm' });
    },
  }), [data, today, dialogs, run, afterDelete]);

  const plan = target ? data.plans.find((p) => p.event.id === target.eventId) : undefined;
  const findStep = (id: StepId) => plan?.groups.flatMap((g) => g.steps).find((s) => s.id === id);
  const findGroup = (id: GroupId | null) => plan?.groups.find((g) => g.id === id);
  const perms = plan ? api.permsOf(plan.event.id) : NO_PERMS;
  const nextSort = (items: ReadonlyArray<{ sort: number }>) => items.reduce((m, x) => Math.max(m, x.sort), -1) + 1;

  let dialog: ReactNode = null;
  if (plan && target) {
    const { event } = plan;
    switch (target.kind) {
      case 'event':
        dialog = (
          <Dialog open onClose={close} title="Sửa Thông Tin Sự Kiện" subtitle="Khởi tạo kế hoạch tổ chức sự kiện theo chuẩn quy trình SCE" icon="calendar-check" accent="blue" size="xl">
            <EventForm event={event} departments={data.createDepartments} today={today} onCancel={close} onDone={() => { close(); router.refresh(); }} />
          </Dialog>
        );
        break;
      case 'step': {
        const group = findGroup(target.groupId);
        const step = target.stepId ? findStep(target.stepId) : undefined;
        if (group && (step || !target.stepId)) dialog = <StepDialog event={event} group={group} step={step} nextSort={nextSort(group.steps)} onClose={close} />;
        break;
      }
      case 'subtasks':
      case 'links': {
        const step = findStep(target.stepId);
        const Cmp = target.kind === 'subtasks' ? SubTasksDialog : LinksDialog;
        if (step) dialog = <Cmp event={event} step={step} canWrite={perms.write} onClose={close} />;
        break;
      }
      case 'note': {
        const group = findGroup(target.groupId);
        if (group) dialog = <NoteDialog event={event} group={group} onClose={close} />;
        break;
      }
      case 'group': {
        const group = findGroup(target.groupId) ?? undefined;
        if (group || !target.groupId) dialog = <GroupDialog event={event} group={group} phase={target.phase} nextSort={nextSort(plan.groups)} onClose={close} />;
        break;
      }
    }
  }

  return (
    <Ctx.Provider value={api}>
      {children}
      {dialog}
    </Ctx.Provider>
  );
}
