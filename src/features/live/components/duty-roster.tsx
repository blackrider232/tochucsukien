'use client';

// "Phân công ca trực" (m5 §1.4, §3.3): the four desks from one registry, the
// roster with presence judged against the event opening minus the configured
// hours, and edit, delete and undo (BUG-13, BUG-18, BUG-25, BUG-26).

import { useState } from 'react';
import { Badge, Button, DataTable, Dialog, Form, FormField, Icon, RowMenu, SectionCard, Select, TextInput, useDialogs, useSettings, useZodForm, type Column } from '@/components/ui';
import { newId } from '@/core/brand';
import { useCommand } from '@/core/commands';
import { formatVNDate, formatVNTime } from '@/core/dates';
import { foldVi } from '@/core/text';
import type { DutyStaff } from '../contract';
import { formatAt } from '../domain/desk';
import { DUTY_DESKS, dutyStatus, type DutyState } from '../domain/duty';
import { DESK_VALUES, DUTY_DEPARTMENTS, dutyFields, type DutyDraft } from '../domain/schemas';
import type { LiveScreenData } from '../domain/screen';

const STATE_BADGE = (s: DutyState) =>
  s.kind === 'pending' ? <Badge tone="amber">Chờ điểm danh</Badge> : s.kind === 'on_time' ? <Badge tone="emerald" icon="circle-check">Đúng giờ</Badge> : <Badge tone="rose" icon="clock">Trễ {s.minutes} phút</Badge>;

export function DutyRoster({ data }: { data: LiveScreenData }) {
  const { staff, requiredAt, now, can, event } = data;
  const settings = useSettings();
  const run = useCommand();
  const dialogs = useDialogs();
  const [editing, setEditing] = useState<DutyStaff | 'new' | null>(null);

  const present = async (s: DutyStaff, value: boolean) => {
    if (!value) {
      const ok = await dialogs.confirm({ title: `Hủy điểm danh của ${s.name}?`, text: 'Giờ điểm danh hiện tại sẽ bị xóa. Hoàn tác sẽ điểm danh lại theo giờ lúc hoàn tác.', confirmLabel: 'Hủy điểm danh', tone: 'danger' });
      if (!ok) return;
    }
    await run('live.setDutyPresence', { eventId: event.id, id: s.id, version: s.version, present: value }, { success: value ? `Đã điểm danh ca trực: ${s.name}` : `Đã hủy điểm danh: ${s.name}` });
  };
  const remove = async (s: DutyStaff) => {
    const ok = await dialogs.confirm({ title: `Xóa phân công của ${s.name}?`, text: 'Có thể hoàn tác ngay sau khi xóa.', confirmLabel: 'Xóa phân công', tone: 'danger' });
    if (ok) await run('live.deleteDuty', { eventId: event.id, id: s.id, version: s.version }, { success: `Đã xóa phân công: ${s.name}` });
  };

  const columns: Column<DutyStaff>[] = [
    {
      id: 'name', header: 'Họ và tên cán bộ', sortValue: (s) => foldVi(s.name), width: '15rem',
      cell: (s) => (
        <div className="min-w-0 space-y-0.5">
          <p className="font-semibold break-words text-ink">{s.name}</p>
          {s.roleLabel && <p className="text-xs break-words text-ink-muted">{s.roleLabel}</p>}
          <p className="text-xs text-ink-muted md:hidden">{DUTY_DESKS[s.desk].short} • {s.department}</p>
          <span className="md:hidden">{STATE_BADGE(dutyStatus(s, requiredAt))}</span>
        </div>
      ),
    },
    { id: 'dept', header: 'Phòng ban công tác', hideOnMobile: true, cell: (s) => <span className="text-sm text-ink-2">{s.department}</span> },
    { id: 'desk', header: 'Bàn trực', hideOnMobile: true, sortValue: (s) => s.desk, cell: (s) => <span className="text-sm text-ink-2">{DUTY_DESKS[s.desk].short}</span> },
    {
      id: 'arrived', header: 'Giờ điểm danh', hideOnMobile: true, sortValue: (s) => s.checkedInAt ?? '~',
      cell: (s) => (s.checkedInAt ? <span className="inline-flex items-center gap-1 text-sm font-semibold text-ink"><Icon name="clock" size={14} />{formatAt(s.checkedInAt, now)}</span> : <span className="text-sm italic text-ink-muted">Chưa điểm danh</span>),
    },
    { id: 'state', header: 'Trạng thái đến', hideOnMobile: true, cell: (s) => STATE_BADGE(dutyStatus(s, requiredAt)) },
    ...(can.manage
      ? [{
          id: 'action', header: 'Thao tác', align: 'right' as const,
          cell: (s: DutyStaff) => (
            <div className="flex items-center justify-end gap-1">
              {!s.checkedInAt && <Button variant="secondary" icon="check" onClick={() => void present(s, true)}>Điểm danh</Button>}
              <RowMenu label={`Thao tác với ${s.name}`} items={[
                { id: 'edit', label: 'Sửa phân công', icon: 'pencil', onSelect: () => setEditing(s) },
                { id: 'unmark', label: 'Hủy điểm danh', icon: 'undo', disabled: !s.checkedInAt, onSelect: () => void present(s, false) },
                { id: 'delete', label: 'Xóa phân công', icon: 'trash', tone: 'danger', disabled: s.checkedInAt !== null, onSelect: () => void remove(s) },
              ]} />
            </div>
          ),
        }]
      : []),
  ];

  return (
    <SectionCard
      title={`Phân công 4 bàn trực trọng yếu (có mặt trước ≥ ${settings.fieldPresenceHours} giờ)`}
      subtitle={`Toàn bộ cán bộ trực phải có mặt trước giờ khai mạc ít nhất ${settings.fieldPresenceHours} giờ để kiểm tra cơ sở vật chất và tiếp nhận bàn lễ tân.`}
      icon="shield"
      actions={can.manage ? <Button icon="plus" onClick={() => setEditing('new')}>Phân công cán bộ trực</Button> : undefined}
    >
      <div className="space-y-4">
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
          <Icon name="clock" size={16} />
          Giờ quy định có mặt: <span className="font-semibold text-ink">{formatVNTime(requiredAt, { withDate: true })}</span>
          (khai mạc {event.eventTime} ngày {formatVNDate(event.eventDate)})
        </p>
        <ul aria-label="Tình hình 4 bàn trực" className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {DESK_VALUES.map((d) => {
            const at = staff.filter((s) => s.desk === d);
            const here = at.filter((s) => s.checkedInAt).length;
            return (
              <li key={d} className="flex items-start gap-3 border-b border-line pb-3">
                <span className="mt-0.5 text-ink-muted"><Icon name={DUTY_DESKS[d].icon} size={18} /></span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-ink">{DUTY_DESKS[d].short}</p>
                    <Badge tone={at.length > 0 && here === at.length ? 'emerald' : 'amber'}>{here}/{at.length} có mặt</Badge>
                  </div>
                  <p className="text-sm break-words text-ink-muted">{at.length > 0 ? at.map((s) => s.name).join(', ') : 'Chưa phân công'}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <DataTable
          rows={staff}
          columns={columns}
          rowKey={(s) => s.id}
          numbered
          empty={{
            icon: 'users', title: 'Chưa phân công cán bộ trực',
            text: can.manage ? 'Bấm "Phân công cán bộ trực" để thêm cán bộ cho 4 bàn trực.' : 'Cán bộ phụ trách sự kiện chưa phân công ca trực.',
          }}
        />
      </div>
      {editing && <DutyDialog eventId={event.id} staff={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </SectionCard>
  );
}

const DEPT_OPTIONS = DUTY_DEPARTMENTS.map((d) => ({ value: d, label: d }));
const DESK_OPTIONS = DESK_VALUES.map((d) => ({ value: String(d), label: DUTY_DESKS[d].label }));

function DutyDialog({ eventId, staff, onClose }: { eventId: LiveScreenData['event']['id']; staff: DutyStaff | null; onClose: () => void }) {
  const run = useCommand();
  const form = useZodForm(dutyFields, {
    defaultValues: staff
      ? { name: staff.name, department: staff.department, desk: String(staff.desk), roleLabel: staff.roleLabel }
      : { name: '', department: DUTY_DEPARTMENTS[0], desk: '1', roleLabel: '' },
  });
  const submit = async (draft: DutyDraft) => {
    const done = staff
      ? await run('live.updateDuty', { eventId, id: staff.id, version: staff.version, draft }, { success: 'Đã cập nhật phân công trực' })
      : await run('live.createDuty', { eventId, id: newId<'DutyStaff'>(), draft }, { success: 'Đã phân công cán bộ trực' });
    if (done) onClose();
  };
  return (
    <Dialog open onClose={onClose} icon="shield" title={staff ? 'Sửa phân công cán bộ trực' : 'Phân công cán bộ trực'} subtitle="Giờ có mặt tính từ giờ khai mạc trừ số giờ quy định" dirty={form.formState.isDirty}>
      <Form form={form} onSubmit={submit} className="grid gap-4">
        <FormField label="Họ và tên cán bộ SCE" name="name" required>
          <TextInput name="name" placeholder="Ví dụ: Nguyễn Văn Cường" autoComplete="off" />
        </FormField>
        <FormField label="Phòng ban công tác" name="department" required>
          <Select name="department" options={DEPT_OPTIONS} />
        </FormField>
        <FormField label="Vị trí / bàn trực phụ trách" name="desk" required>
          <Select name="desk" options={DESK_OPTIONS} />
        </FormField>
        <FormField label="Vai trò (nếu có)" name="roleLabel">
          <TextInput name="roleLabel" placeholder="Ví dụ: Trưởng bàn" />
        </FormField>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button type="submit" icon="check" loading={form.formState.isSubmitting}>Lưu phân công</Button>
        </div>
      </Form>
    </Dialog>
  );
}
