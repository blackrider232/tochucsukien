'use client';

// "Sổ xử lý sự cố hiện trường" (m5 §1.5, §3.4): open first, then urgency;
// the lifecycle open -> in progress -> resolved, reopen, edit, and the
// report dialog the header opens too (BUG-27, BUG-28).

import { useState } from 'react';
import { Badge, Button, DataTable, Dialog, Form, FormField, Icon, RowMenu, SectionCard, Select, StatusBadge, Textarea, TextInput, useDialogs, useToast, useZodForm, type Column, type RowMenuItem } from '@/components/ui';
import { newId, type EventId } from '@/core/brand';
import { useCommand } from '@/core/commands';
import type { Incident, IncidentStatus } from '../contract';
import { formatAt } from '../domain/desk';
import { INCIDENT_LOCATIONS, INCIDENT_STATUS, URGENCY, incidentCode, isOpenIncident, sortIncidents } from '../domain/incidents';
import { URGENCY_VALUES, incidentFields, type IncidentDraft } from '../domain/schemas';
import type { LiveScreenData } from '../domain/screen';

export function IncidentLog({ data, onReport }: { data: LiveScreenData; onReport: () => void }) {
  const { incidents, can, now, event } = data;
  const run = useCommand();
  const dialogs = useDialogs();
  const [editing, setEditing] = useState<Incident | null>(null);

  const move = async (i: Incident, status: IncidentStatus) => {
    const code = incidentCode(i.seq);
    let note = '';
    if (status === 'resolved') {
      const typed = await dialogs.prompt({
        title: `Xác nhận giải quyết ${code}?`, label: 'Ghi chú phương án khắc phục', defaultValue: '', confirmLabel: 'Đã khắc phục xong', cancelLabel: 'Hủy',
        text: 'Để trống sẽ ghi "Đã kiểm tra và xử lý thành công."',
      });
      if (typed === null) return;
      note = typed.trim();
    }
    const success = status === 'resolved' ? `Sự cố ${code} đã được giải quyết` : `Sự cố ${code}: ${INCIDENT_STATUS[status].label}`;
    await run('live.setIncidentStatus', { eventId: event.id, id: i.id, version: i.version, status, note }, { success });
  };

  const menu = (i: Incident): RowMenuItem[] => [
    ...(i.status === 'open' ? [{ id: 'progress', label: 'Chuyển sang đang xử lý', icon: 'refresh' as const, onSelect: () => void move(i, 'in_progress') }] : []),
    ...(i.status === 'resolved' ? [{ id: 'reopen', label: 'Mở lại sự cố', icon: 'undo' as const, onSelect: () => void move(i, 'open') }] : []),
    { id: 'edit', label: 'Sửa nội dung', icon: 'pencil', onSelect: () => setEditing(i) },
  ];

  const columns: Column<Incident>[] = [
    {
      id: 'what', header: 'Sự cố', width: '22rem',
      cell: (i) => (
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-sm font-bold text-ink">{incidentCode(i.seq)}</span>
            <StatusBadge registry={URGENCY} value={i.urgency} size="sm" />
            <span className="md:hidden"><StatusBadge registry={INCIDENT_STATUS} value={i.status} size="sm" /></span>
          </div>
          <p className="font-semibold break-words text-ink">{i.description}</p>
          <p className="flex items-center gap-1 text-xs break-words text-ink-muted"><Icon name="map-pin" size={12} />{i.location}</p>
          {i.resolutionNote && <p className="flex items-start gap-1 text-xs break-words text-ink-2"><Icon name="list-check" size={12} />{i.resolutionNote}</p>}
          <p className="text-xs text-ink-muted md:hidden">Phụ trách: {i.assignee || 'Chưa phân công'} • Báo lúc {formatAt(i.reportedAt, now)}{i.resolvedAt ? ` • Xử lý ${formatAt(i.resolvedAt, now)}` : ''}</p>
        </div>
      ),
    },
    { id: 'assignee', header: 'Phụ trách', hideOnMobile: true, cell: (i) => (i.assignee ? <span className="text-sm break-words text-ink-2">{i.assignee}</span> : <span className="text-sm italic text-ink-muted">Chưa phân công</span>) },
    {
      id: 'time', header: 'Thời gian', hideOnMobile: true, sortValue: (i) => i.reportedAt,
      cell: (i) => <div className="text-sm text-ink-2"><p>Báo lúc {formatAt(i.reportedAt, now)}</p>{i.resolvedAt && <p>Xử lý {formatAt(i.resolvedAt, now)}</p>}</div>,
    },
    { id: 'status', header: 'Trạng thái', hideOnMobile: true, cell: (i) => <StatusBadge registry={INCIDENT_STATUS} value={i.status} size="sm" /> },
    ...(can.manage
      ? [{
          id: 'action', header: 'Thao tác', align: 'right' as const,
          cell: (i: Incident) => (
            <div className="flex items-center justify-end gap-1">
              {isOpenIncident(i) ? <Button variant="secondary" icon="check" onClick={() => void move(i, 'resolved')}>Đã xử lý xong</Button> : <span className="max-md:hidden"><Badge tone="emerald">Đã khắc phục</Badge></span>}
              <RowMenu label={`Thao tác với sự cố ${incidentCode(i.seq)}`} items={menu(i)} />
            </div>
          ),
        }]
      : []),
  ];

  return (
    <SectionCard
      title="Sổ nhật ký xử lý sự cố & điều phối kỹ thuật hiện trường"
      subtitle="Tiếp nhận, phân loại và điều phối xử lý tức thì các sự cố âm thanh, ánh sáng, điện lưới, trùng ghế ngồi hoặc khiếu nại gian hàng."
      icon="siren"
      actions={can.manage ? <Button icon="plus" onClick={onReport}>Báo cáo sự cố mới</Button> : undefined}
    >
      <DataTable
        rows={sortIncidents(incidents)}
        columns={columns}
        rowKey={(i) => i.id}
        rowTone={(i) => (i.status === 'resolved' ? null : i.urgency === 'high' ? 'rose' : null)}
        empty={{
          icon: 'circle-check', title: 'Hiện trường hoạt động an toàn',
          text: 'Chưa ghi nhận sự cố kỹ thuật nào phát sinh. Bấm "Báo cáo sự cố mới" nếu có vấn đề cần điều phối xử lý tức thì.',
        }}
      />
      {editing && <IncidentDialog eventId={event.id} incident={editing} onClose={() => setEditing(null)} />}
    </SectionCard>
  );
}

const URGENCY_OPTIONS = URGENCY_VALUES.map((u) => ({ value: u, label: URGENCY[u].label }));

/** Report a new incident or edit one. The assignee starts empty: nobody is assigned by default (BUG-27). */
export function IncidentDialog({ eventId, incident, onClose }: { eventId: EventId; incident: Incident | null; onClose: () => void }) {
  const run = useCommand();
  const toast = useToast();
  const [id] = useState(() => incident?.id ?? newId<'Incident'>());
  const form = useZodForm(incidentFields, {
    defaultValues: incident
      ? { location: incident.location, urgency: incident.urgency, description: incident.description, assignee: incident.assignee }
      : { location: INCIDENT_LOCATIONS[0], urgency: 'high', description: '', assignee: '' },
  });
  const locations = incident && !INCIDENT_LOCATIONS.includes(incident.location) ? [incident.location, ...INCIDENT_LOCATIONS] : INCIDENT_LOCATIONS;
  const submit = async (draft: IncidentDraft) => {
    const done = incident
      ? await run('live.updateIncident', { eventId, id, version: incident.version, draft }, { success: `Đã cập nhật sự cố ${incidentCode(incident.seq)}` })
      : await run('live.createIncident', { eventId, id, draft });
    if (!done) return;
    // The code is the server's sequence, known only once the report is saved.
    if (!incident) toast.warning(`Đã phát lệnh điều phối sự cố ${incidentCode(done.seq)}`);
    onClose();
  };
  return (
    <Dialog open onClose={onClose} icon="siren" title={incident ? `Sửa sự cố ${incidentCode(incident.seq)}` : 'Báo cáo sự cố hiện trường'} subtitle="Điều phối giải quyết tức thì các phát sinh" dirty={form.formState.isDirty}>
      <Form form={form} onSubmit={submit} className="grid gap-4">
        <FormField label="Vị trí xảy ra sự cố" name="location" required>
          <Select name="location" options={locations.map((l) => ({ value: l, label: l }))} />
        </FormField>
        <FormField label="Mức độ nghiêm trọng" name="urgency" required>
          <Select name="urgency" options={URGENCY_OPTIONS} />
        </FormField>
        <FormField label="Nội dung sự cố cần xử lý" name="description" required>
          <Textarea name="description" rows={3} placeholder="Mô tả cụ thể sự cố: mất mic, màn hình LED lỗi, khách VIP phát sinh ngoài danh sách, trùng ghế ngồi..." />
        </FormField>
        <FormField label="Cán bộ phụ trách khắc phục" name="assignee" hint="Để trống nếu chưa phân công.">
          <TextInput name="assignee" placeholder="Ghi rõ họ tên cán bộ hoặc tổ phụ trách" />
        </FormField>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button type="submit" icon="check" loading={form.formState.isSubmitting}>{incident ? 'Lưu thay đổi' : 'Tiếp nhận & điều phối'}</Button>
        </div>
      </Form>
    </Dialog>
  );
}
