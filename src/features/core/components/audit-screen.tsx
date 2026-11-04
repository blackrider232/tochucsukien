'use client';

// /admin/audit: read-only, newest first, filters in the URL so a view can be
// shared by link (core B18). Every summary renders as React text (core B29).

import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Badge, Button, DataTable, DateInput, Form, FormField, SectionCard, Select, TextInput, useZodForm, type Column } from '@/components/ui';
import type { EventId, IsoDate } from '@/core/brand';
import { formatVNTime, parseIsoDate } from '@/core/dates';
import type { AuditEntry, AuditFilter } from '../server/reads';

/** What each feature's audit entity means; anything else shows as stored. */
const ENTITY_LABELS: Readonly<Record<string, string>> = {
  profile: 'Tài khoản', backup: 'Sao lưu', settings: 'Tham số hệ thống', holidays: 'Ngày nghỉ lễ',
  event: 'Sự kiện', group: 'Nhóm việc', step: 'Bước việc', guest: 'Khách mời', template: 'Biểu mẫu',
};
export const entityLabel = (entity: string) => ENTITY_LABELS[entity] ?? entity;

const filterSchema = z.object({
  action: z.string(),
  entity: z.string(),
  actor: z.string().trim().max(120, 'Tối đa 120 ký tự'),
  eventId: z.string(),
  from: z.string().refine((v) => v === '' || parseIsoDate(v) !== null, 'Ngày không hợp lệ'),
  to: z.string().refine((v) => v === '' || parseIsoDate(v) !== null, 'Ngày không hợp lệ'),
}).refine((v) => !v.from || !v.to || v.from <= v.to, { path: ['to'], message: 'Đến ngày phải sau Từ ngày' });
type FilterForm = z.output<typeof filterSchema>;

/** The query string of a filter (and an optional page cursor). */
export function auditHref(filter: AuditFilter, before?: number): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) if (v) q.set(k, String(v));
  if (before) q.set('before', String(before));
  const s = q.toString();
  return s ? `/admin/audit?${s}` : '/admin/audit';
}

export interface AuditScreenProps {
  rows: ReadonlyArray<AuditEntry>;
  filter: AuditFilter;
  before: number | null;
  nextBefore: number | null;
  facets: { actions: ReadonlyArray<string>; entities: ReadonlyArray<string> };
  events: ReadonlyArray<{ id: EventId; name: string }>;
}

export function AuditScreen({ rows, filter, before, nextBefore, facets, events }: AuditScreenProps) {
  const router = useRouter();
  const eventName = new Map<string, string>(events.map((e) => [e.id, e.name]));
  const form = useZodForm(filterSchema, {
    defaultValues: { action: filter.action ?? '', entity: filter.entity ?? '', actor: filter.actor ?? '', eventId: filter.eventId ?? '', from: filter.from ?? '', to: filter.to ?? '' },
  });
  const apply = (v: FilterForm) => {
    router.push(auditHref({ action: v.action || undefined, entity: v.entity || undefined, actor: v.actor || undefined, eventId: (v.eventId || undefined) as EventId | undefined, from: (v.from || undefined) as IsoDate | undefined, to: (v.to || undefined) as IsoDate | undefined }));
  };
  const filtered = Object.values(filter).some(Boolean);

  const columns: Column<AuditEntry>[] = [
    {
      id: 'what', header: 'Thao tác',
      cell: (a) => (
        <div className="min-w-0 space-y-1">
          <Badge tone="indigo">{a.action}</Badge>
          <p className="text-xs tabular-nums text-ink-2">{formatVNTime(a.at, { withDate: true })}</p>
          <p className="break-all text-xs text-ink-2">{a.actorEmail ?? 'Hệ thống'}</p>
        </div>
      ),
    },
    { id: 'summary', header: 'Chi tiết', cell: (a) => <p className="whitespace-pre-wrap break-words text-sm text-ink">{a.summary}</p> },
    {
      id: 'target', header: 'Đối tượng', hideOnMobile: true,
      cell: (a) => (
        <div className="space-y-0.5 text-sm">
          {a.entity && <p className="text-ink-2">{entityLabel(a.entity)}</p>}
          {a.eventId && <p className="text-ink">{eventName.get(a.eventId) ?? 'Sự kiện đã xóa'}</p>}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <SectionCard title="Lọc nhật ký" icon="filter">
        <Form form={form} onSubmit={apply} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <FormField label="Hành động" name="action">
            <Select name="action" placeholder="Tất cả hành động" options={facets.actions.map((x) => ({ value: x, label: x }))} />
          </FormField>
          <FormField label="Đối tượng" name="entity">
            <Select name="entity" placeholder="Tất cả đối tượng" options={facets.entities.map((x) => ({ value: x, label: entityLabel(x) }))} />
          </FormField>
          <FormField label="Sự kiện" name="eventId">
            <Select name="eventId" placeholder="Tất cả sự kiện" options={events.map((e) => ({ value: e.id, label: e.name }))} />
          </FormField>
          <FormField label="Người thực hiện" name="actor" hint="Một phần email, ví dụ nguyenvana@">
            <TextInput name="actor" type="text" />
          </FormField>
          <FormField label="Từ ngày" name="from">
            <DateInput name="from" />
          </FormField>
          <FormField label="Đến ngày" name="to">
            <DateInput name="to" />
          </FormField>
          <div className="flex flex-wrap justify-end gap-2 sm:col-span-2 xl:col-span-3">
            {filtered && <Button variant="secondary" icon="x" href="/admin/audit">Bỏ lọc</Button>}
            <Button type="submit" icon="search">Lọc</Button>
          </div>
        </Form>
      </SectionCard>
      <SectionCard title="Nhật ký kiểm toán" subtitle="Ghi lại mọi thao tác thay đổi dữ liệu, ai làm và lúc nào. Không ai sửa hay xóa được." icon="list-check">
        <div className="space-y-3">
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(a) => String(a.id)}
            empty={{ icon: 'list-check', title: filtered ? 'Không có nhật ký khớp bộ lọc' : 'Chưa có nhật ký hoạt động nào', text: filtered ? 'Đổi hoặc bỏ bộ lọc.' : undefined }}
          />
          {(before || nextBefore) && (
            <nav aria-label="Trang nhật ký" className="flex flex-wrap justify-between gap-2">
              {before ? <Button variant="secondary" icon="arrow-left" href={auditHref(filter)}>Về mới nhất</Button> : <span />}
              {nextBefore && <Button variant="secondary" icon="chevron-right" href={auditHref(filter, nextBefore)}>Cũ hơn</Button>}
            </nav>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
