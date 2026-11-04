'use client';

import { useEffect } from 'react';
import { useWatch } from 'react-hook-form';
import { Button, Checkbox, Dialog, EmptyState, Form, FormField, IconButton, NumberInput, Select, Textarea, TextInput, useDialogs, useZodForm } from '@/components/ui';
import { useCalendar } from '@/core/auth';
import { newId } from '@/core/brand';
import { useCommand } from '@/core/commands';
import { formatVNDate } from '@/core/dates';
import type { SceEvent, Step, TaskGroup } from '../contract';
import { deadlineOf, offsetLabel } from '../domain/schedule';
import { groupFields, groupNoteFields, linkFields, stepDraftSchema, subTaskFields, type GroupDraft, type StepDraft } from '../domain/schemas';

const PHASE_OPTIONS = [
  { value: 'before' as const, label: 'Trước sự kiện' },
  { value: 'dday' as const, label: 'Trong ngày diễn ra' },
  { value: 'after' as const, label: 'Sau sự kiện' },
];
const DAY_TYPE_OPTIONS = [
  { value: 'workday' as const, label: 'Ngày làm việc (trừ T7, CN, ngày lễ)' },
  { value: 'calendar' as const, label: 'Ngày lịch (liên tục)' },
];

export function StepDialog({ event, group, step, nextSort, onClose }: { event: SceEvent; group: TaskGroup; step?: Step; nextSort: number; onClose: () => void }) {
  const run = useCommand();
  const cal = useCalendar();
  const form = useZodForm(stepDraftSchema, {
    defaultValues: step
      ? { name: step.name, requirement: step.requirement, targetPhase: step.targetPhase, offsetDays: step.offsetDays, dayType: step.dayType, assignee: step.assignee, templateKey: step.templateKey }
      : { name: '', requirement: '', targetPhase: 'before', offsetDays: 5, dayType: 'workday', assignee: '', templateKey: '' },
  });
  const [phase, offset, dayType] = useWatch({ control: form.control, name: ['targetPhase', 'offsetDays', 'dayType'] });
  useEffect(() => {
    if (phase !== 'dday' && form.getValues('offsetDays') === 0) form.setValue('offsetDays', 3);
  }, [phase, form]);
  const timing = { targetPhase: phase ?? 'before', offsetDays: phase === 'dday' ? 0 : Number(offset) || 0, dayType: dayType ?? 'workday' };

  const submit = async (draft: StepDraft) => {
    const done = step
      ? await run('progress.updateStep', { eventId: event.id, stepId: step.id, version: step.version, patch: draft }, { success: `Đã cập nhật bước "${draft.name}"` })
      : await run('progress.createStep', {
          eventId: event.id, groupId: group.id,
          step: { ...draft, id: newId<'Step'>(), subTasks: [], links: [], sort: nextSort, done: false },
        }, { success: `Đã thêm bước "${draft.name}"` });
    if (done) onClose();
  };

  return (
    <Dialog open onClose={onClose} dirty={form.formState.isDirty} size="lg" icon="pencil" accent="blue"
      title={step ? 'Chỉnh Sửa Bước Việc' : 'Thêm Bước Việc'} subtitle={`${group.name} · Cập nhật định mức thời hạn và tiêu chuẩn quy trình`}>
      <Form form={form} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormField label="Tên Công Việc" name="name" required><TextInput name="name" /></FormField>
        </div>
        <div className="sm:col-span-2">
          <FormField label="Yêu Cầu Tiêu Chuẩn Quy Trình SCE" name="requirement"><Textarea name="requirement" rows={3} /></FormField>
        </div>
        <FormField label="Giai Đoạn" name="targetPhase"><Select name="targetPhase" options={PHASE_OPTIONS} /></FormField>
        {phase !== 'dday' ? (
          <FormField label="Số Ngày Lệch (Offset)" name="offsetDays" suffix={phase === 'after' ? 'ngày sau T0' : 'ngày trước T0'}>
            <NumberInput name="offsetDays" min={0} max={365} />
          </FormField>
        ) : (
          <p className="self-end pb-3 text-sm text-ink-2">Hạn chót là ngày diễn ra (T0).</p>
        )}
        {phase !== 'dday' && (
          <FormField label="Cách Tính Ngày" name="dayType"><Select name="dayType" options={DAY_TYPE_OPTIONS} /></FormField>
        )}
        <FormField label="Cán Bộ Phụ Trách" name="assignee"><TextInput name="assignee" placeholder="Ví dụ: Trần Thị B" /></FormField>
        <FormField label="Mã Biểu Mẫu Liên Kết" name="templateKey" hint="Mã trong Kho biểu mẫu, ví dụ form_dskhach, form_giaymoi">
          <TextInput name="templateKey" placeholder="Ví dụ: form_dskhach, form_giaymoi..." />
        </FormField>
        <p className="rounded-control bg-surface-2 px-3 py-2 text-sm text-ink-2 sm:col-span-2" aria-live="polite">
          Hạn chót: <strong>{formatVNDate(deadlineOf(cal, event.eventDate, timing), { weekday: true })}</strong> · {offsetLabel(timing)}
        </p>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button type="submit" icon="check" loading={form.formState.isSubmitting}>Lưu Bước Việc</Button>
        </div>
      </Form>
    </Dialog>
  );
}

export function SubTasksDialog({ event, step, canWrite, onClose }: { event: SceEvent; step: Step; canWrite: boolean; onClose: () => void }) {
  const run = useCommand();
  const dialogs = useDialogs();
  const form = useZodForm(subTaskFields, { defaultValues: { name: '' } });
  const target = { eventId: event.id, stepId: step.id };
  const add = async ({ name }: { name: string }) => {
    if (await run('progress.addSubTask', { ...target, subTask: { id: newId(), name, completed: false } })) form.reset({ name: '' });
  };
  const remove = async (id: string, name: string) => {
    if (await dialogs.confirm({ title: 'Xóa việc nhỏ?', text: `Xóa "${name}" khỏi bước "${step.name}".`, confirmLabel: 'Xóa', cancelLabel: 'Hủy', tone: 'danger' })) {
      await run('progress.removeSubTask', { ...target, subTaskId: id }, { success: 'Đã xóa việc nhỏ' });
    }
  };
  const done = step.subTasks.filter((t) => t.completed).length;
  return (
    <Dialog open onClose={onClose} title="Việc Nhỏ Chi Tiết" subtitle={step.name} icon="check" accent="emerald" size="lg"
      footer={<Button variant="secondary" onClick={onClose}>Đóng</Button>}>
      {canWrite && (
        <Form form={form} onSubmit={add} className="mb-4 flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <FormField label="Thêm việc nhỏ" name="name"><TextInput name="name" placeholder="Thêm việc nhỏ cần làm..." /></FormField>
          </div>
          <Button type="submit" icon="plus">Thêm</Button>
        </Form>
      )}
      <p className="mb-1 text-xs font-semibold text-ink-muted">Đã xong {done}/{step.subTasks.length}. Việc nhỏ không tự hoàn thành bước.</p>
      {step.subTasks.length === 0 ? (
        <EmptyState icon="check" title="Chưa có việc nhỏ nào." text={canWrite ? 'Hãy thêm vào bên trên.' : undefined} />
      ) : (
        <ul className="divide-y divide-line">
          {step.subTasks.map((t) => (
            <li key={t.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Checkbox name={`subtask-${t.id}`} checked={t.completed} strike label={t.name} disabled={!canWrite}
                  onChange={(v) => void run('progress.setSubTaskDone', { ...target, subTaskId: t.id, done: v })} />
              </div>
              {canWrite && <IconButton icon="trash" tone="rose" label={`Xóa việc nhỏ "${t.name}"`} onClick={() => void remove(t.id, t.name)} />}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

export function LinksDialog({ event, step, canWrite, onClose }: { event: SceEvent; step: Step; canWrite: boolean; onClose: () => void }) {
  const run = useCommand();
  const dialogs = useDialogs();
  const form = useZodForm(linkFields, { defaultValues: { name: '', url: '' } });
  const target = { eventId: event.id, stepId: step.id };
  const add = async (link: { name: string; url: Step['links'][number]['url'] }) => {
    if (await run('progress.addLink', { ...target, link: { ...link, id: newId() } }, { success: 'Đã thêm liên kết' })) form.reset({ name: '', url: '' });
  };
  const remove = async (id: string, name: string) => {
    if (await dialogs.confirm({ title: 'Xóa liên kết?', text: `Gỡ "${name}" khỏi bước "${step.name}". Tệp gốc không bị xóa.`, confirmLabel: 'Xóa', cancelLabel: 'Hủy', tone: 'danger' })) {
      await run('progress.removeLink', { ...target, linkId: id }, { success: 'Đã xóa liên kết' });
    }
  };
  return (
    <Dialog open onClose={onClose} title="Tài Liệu & Đính Kèm" subtitle={step.name} icon="file-text" accent="indigo" size="lg"
      footer={<Button variant="secondary" onClick={onClose}>Đóng</Button>}>
      {canWrite && (
        <Form form={form} onSubmit={add} className="mb-4 grid gap-3">
          <FormField label="Tên tài liệu / Văn bản" name="name"><TextInput name="name" placeholder="Ví dụ: Danh sách khách mời VIP.xlsx" /></FormField>
          <FormField label="Đường dẫn URL" name="url" hint="Google Drive, Docs, trang web... chỉ nhận http:// hoặc https://">
            <TextInput name="url" type="url" placeholder="https://" />
          </FormField>
          <div className="flex justify-end"><Button type="submit" icon="plus">Thêm</Button></div>
        </Form>
      )}
      {step.links.length === 0 ? (
        <EmptyState icon="file-text" title="Chưa có liên kết hoặc tài liệu đính kèm nào." />
      ) : (
        <ul className="divide-y divide-line">
          {step.links.map((l) => (
            <li key={l.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-semibold text-link underline-offset-2 hover:underline">{l.name}</a>
                <p className="truncate text-xs text-ink-muted">{l.url}</p>
              </div>
              {canWrite && <IconButton icon="trash" tone="rose" label={`Xóa liên kết "${l.name}"`} onClick={() => void remove(l.id, l.name)} />}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

export function NoteDialog({ event, group, onClose }: { event: SceEvent; group: TaskGroup; onClose: () => void }) {
  const run = useCommand();
  const form = useZodForm(groupNoteFields, { defaultValues: { note: group.note } });
  const save = async (note: string, success: string) => {
    if (await run('progress.setGroupNote', { eventId: event.id, groupId: group.id, note }, { success })) onClose();
  };
  return (
    <Dialog open onClose={onClose} dirty={form.formState.isDirty} title="Ghi Chú Nhanh Nhóm Việc" subtitle={`${group.name} (${event.name})`} icon="pencil" accent="amber">
      <Form form={form} onSubmit={({ note }) => save(note, 'Đã lưu ghi chú nhóm')} className="grid gap-4">
        <FormField label="Nội Dung Ghi Chú Lưu Ý" name="note" required>
          <Textarea name="note" rows={4} placeholder="Nhập các chỉ đạo gấp, số điện thoại đầu mối hoặc lưu ý kiểm tra..." />
        </FormField>
        <div className="flex flex-wrap items-center gap-2">
          {group.note && <Button variant="danger" icon="trash" onClick={() => void save('', 'Đã xóa ghi chú nhóm')}>Xóa ghi chú</Button>}
          <span className="flex-1" />
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button type="submit" icon="check">Lưu Ghi Chú</Button>
        </div>
      </Form>
    </Dialog>
  );
}

const GROUP_PHASE_OPTIONS = [
  { value: 'phase_prepare' as const, label: 'Giai đoạn I: Chuẩn bị trước sự kiện' },
  { value: 'phase_dday' as const, label: 'Giai đoạn II: Ngày diễn ra và sau sự kiện' },
];

export function GroupDialog({ event, group, phase, nextSort, onClose }: { event: SceEvent; group?: TaskGroup; phase: TaskGroup['phase']; nextSort: number; onClose: () => void }) {
  const run = useCommand();
  const form = useZodForm(groupFields, { defaultValues: group ? { phase: group.phase, name: group.name, leadPerson: group.leadPerson, note: group.note } : { phase, name: '', leadPerson: '', note: '' } });
  const submit = async (draft: GroupDraft) => {
    const done = group
      ? await run('progress.updateGroup', { eventId: event.id, groupId: group.id, version: group.version, patch: draft }, { success: `Đã cập nhật nhóm "${draft.name}"` })
      : await run('progress.createGroups', { eventId: event.id, groups: [{ ...draft, id: newId<'TaskGroup'>(), sort: nextSort, steps: [] }] }, { success: `Đã thêm nhóm "${draft.name}"` });
    if (done) onClose();
  };
  return (
    <Dialog open onClose={onClose} dirty={form.formState.isDirty} title={group ? 'Sửa Nhóm Việc' : 'Thêm Nhóm Việc'} subtitle={event.name} icon="plus" accent="blue">
      <Form form={form} onSubmit={submit} className="grid gap-4">
        <FormField label="Tên Nhóm Việc" name="name" required><TextInput name="name" placeholder="Ví dụ: Nhóm 7: Hậu cần bổ sung" /></FormField>
        <FormField label="Giai Đoạn" name="phase"><Select name="phase" options={GROUP_PHASE_OPTIONS} /></FormField>
        <FormField label="Phụ Trách Nhóm" name="leadPerson"><TextInput name="leadPerson" placeholder="Ví dụ: Đ/c phụ trách Hậu cần" /></FormField>
        <FormField label="Ghi Chú" name="note"><Textarea name="note" /></FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button type="submit" icon="check">Lưu Nhóm Việc</Button>
        </div>
      </Form>
    </Dialog>
  );
}
