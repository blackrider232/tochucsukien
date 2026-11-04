'use client';

// "Đối tượng nhận thư": event guests with filters, and typed or pasted
// addresses. Nothing is preselected (m4a B32); "Chọn tất cả" takes the
// filtered rows that have an email. Every value renders as React text (m4a B02).

import { useMemo, useState } from 'react';
import { z } from 'zod';
import {
  Badge, Button, DataTable, FilterBar, Form, FormField, IconButton, SectionCard, StatusBadge, Tabs, Textarea, TextInput, useDialogs, useToast, useZodForm,
  type Column,
} from '@/components/ui';
import type { Email } from '@/core/brand';
import { matchesQuery } from '@/core/text';
import { GUEST_GROUPS, RSVP, enumOptions, type GuestGroup } from '@/core/vocab';
import { localPart, parseRecipientList } from '../domain/addresses';
import type { ManualRecipient } from '../domain/compose';
import type { GuestRecipient } from '../domain/screen';

export type GuestFilterKey = 'all' | 'pending' | 'attending';
type DeliveryFilter = 'all' | 'never' | 'sent' | 'error';

const ALL = { value: 'all', label: 'Tất cả' };
const GROUP_OPTIONS = [ALL, ...enumOptions(GUEST_GROUPS).map((g) => ({ value: g.value, label: g.short }))];
const RSVP_OPTIONS = [ALL, { value: 'pending', label: 'Chưa phản hồi' }, { value: 'attending', label: 'Đã xác nhận tham dự' }, { value: 'declined', label: 'Báo vắng' }];
const DELIVERY_OPTIONS = [ALL, { value: 'never', label: 'Chưa gửi thư' }, { value: 'sent', label: 'Đã gửi' }, { value: 'error', label: 'Lỗi gửi' }];

const manualSchema = z.object({ emails: z.string(), name: z.string().trim().max(200), organization: z.string().trim().max(300) });

function DeliveryBadge({ status }: { status: GuestRecipient['lastDelivery'] }) {
  if (status === 'sent') return <Badge tone="emerald" icon="circle-check">Đã gửi</Badge>;
  if (status === 'error') return <Badge tone="rose" icon="circle-x">Lỗi gửi</Badge>;
  if (status === 'unknown') return <Badge tone="amber" icon="alert-triangle">Không rõ</Badge>;
  return null;
}

export function RecipientsPanel(props: {
  guests: ReadonlyArray<GuestRecipient>;
  guestIds: ReadonlySet<string>;
  onGuestIds: (next: ReadonlySet<string>) => void;
  manual: ReadonlyArray<ManualRecipient>;
  manualIds: ReadonlySet<string>;
  onManual: (list: ReadonlyArray<ManualRecipient>, ids: ReadonlySet<string>) => void;
  rsvpFilter: string;
  onRsvpFilter: (v: string) => void;
  officer: { name: string; email: Email };
  agencyName: string;
  total: number;
  disabled: boolean;
}) {
  const { guests, guestIds, onGuestIds, manual, manualIds, onManual, officer } = props;
  const toast = useToast();
  const dialogs = useDialogs();
  const [tab, setTab] = useState<'guests' | 'manual'>('guests');
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('all');
  const [delivery, setDelivery] = useState<DeliveryFilter>('all');
  const manualForm = useZodForm(manualSchema, { defaultValues: { emails: '', name: '', organization: '' } });

  const rows = useMemo(
    () =>
      guests.filter((g) => {
        if (group !== 'all' && g.group !== (group as GuestGroup)) return false;
        if (props.rsvpFilter === 'pending' && g.rsvpStatus !== 'pending') return false;
        if (props.rsvpFilter === 'attending' && g.rsvpStatus !== 'confirmed' && g.rsvpStatus !== 'substituted') return false;
        if (props.rsvpFilter === 'declined' && g.rsvpStatus !== 'declined') return false;
        if (delivery === 'never' && g.lastDelivery !== null) return false;
        if (delivery === 'sent' && g.lastDelivery !== 'sent') return false;
        if (delivery === 'error' && g.lastDelivery !== 'error') return false;
        return matchesQuery(q, g.name, g.organization, g.title, g.email);
      }),
    [guests, group, props.rsvpFilter, delivery, q],
  );
  const emailable = useMemo(() => new Set<string>(guests.filter((g) => g.email).map((g) => g.id)), [guests]);

  const guestColumns: ReadonlyArray<Column<GuestRecipient>> = [
    {
      id: 'name',
      header: 'Đại biểu',
      cell: (g) => (
        <div className="min-w-0">
          <p className="font-semibold text-ink">{g.name}</p>
          <p className="text-xs text-ink-muted">{[g.title, g.organization].filter(Boolean).join(' - ')}</p>
          <p className={g.email ? 'text-xs text-ink-2' : 'text-xs text-danger-ink'}>{g.email ?? 'Chưa có email'}</p>
        </div>
      ),
      sortValue: (g) => g.name,
    },
    { id: 'rsvp', header: 'RSVP', cell: (g) => <StatusBadge registry={RSVP} value={g.rsvpStatus} size="sm" />, hideOnMobile: true, width: '9rem' },
    { id: 'delivery', header: 'Thư mời', cell: (g) => <DeliveryBadge status={g.lastDelivery} />, width: '7rem' },
  ];
  const manualColumns: ReadonlyArray<Column<ManualRecipient>> = [
    {
      id: 'name',
      header: 'Người nhận',
      cell: (m) => (
        <div className="min-w-0">
          <p className="font-semibold text-ink">{m.name || localPart(m.email)}</p>
          <p className="text-xs text-ink-2">{m.email}</p>
          <p className="text-xs text-ink-muted">{m.organization ? `Tự nhập - ${m.organization}` : 'Tự nhập'}</p>
        </div>
      ),
    },
    {
      id: 'remove',
      header: '',
      width: '3.5rem',
      align: 'right',
      cell: (m) => (
        <IconButton icon="x" tone="red" label={`Bỏ ${m.email} khỏi danh sách`} disabled={props.disabled} onClick={() => onManual(manual.filter((x) => x.email !== m.email), new Set([...manualIds].filter((e) => e !== m.email)))} />
      ),
    },
  ];

  const addManual = (values: z.output<typeof manualSchema>, extra: ManualRecipient[] = []) => {
    const parsed = parseRecipientList(values.emails);
    const fresh = [...extra, ...parsed.valid.map((p) => ({ email: p.email, name: values.name || p.name || localPart(p.email), organization: values.organization }))];
    const known = new Set(manual.map((m) => m.email));
    const added = fresh.filter((m) => !known.has(m.email));
    if (added.length === 0 && parsed.invalid.length === 0) {
      manualForm.setError('emails', { message: fresh.length ? 'Các email này đã có trong danh sách' : 'Nhập ít nhất một email (cách nhau bởi dấu phẩy, chấm phẩy hoặc xuống dòng)' });
      return;
    }
    // What could not be read stays in the box to correct; the rest has been added.
    manualForm.reset({ emails: parsed.invalid.join(', '), name: '', organization: '' });
    if (parsed.invalid.length > 0) manualForm.setError('emails', { message: `Không phải email hợp lệ: ${parsed.invalid.slice(0, 3).join(', ')}${parsed.invalid.length > 3 ? '…' : ''}` });
    if (added.length > 0) {
      onManual([...manual, ...added], new Set([...manualIds, ...added.map((m) => m.email)]));
      toast.success(`Đã thêm ${added.length} địa chỉ email nhận thư`);
    }
  };

  const clearManual = async () => {
    const ok = await dialogs.confirm({ title: 'Xóa danh sách email tự nhập?', text: 'Toàn bộ các email tự nhập ngoài danh sách sẽ bị xóa khỏi phiên gửi này.', confirmLabel: 'Xóa danh sách', tone: 'danger' });
    if (ok) onManual([], new Set());
  };

  const selectedGuests = guests.filter((g) => guestIds.has(g.id) && g.email).length;
  const selectedManual = manual.filter((m) => manualIds.has(m.email)).length;

  return (
    <SectionCard title="Đối tượng nhận thư" subtitle={`Đã chọn: ${props.total} người nhận (${selectedGuests}/${guests.length} đại biểu, ${selectedManual}/${manual.length} tự nhập)`} icon="users">
      <div className="space-y-4">
        <Tabs
          variant="segmented"
          value={tab}
          onChange={(id) => setTab(id as 'guests' | 'manual')}
          items={[
            { id: 'guests', label: 'Đại biểu', count: selectedGuests },
            { id: 'manual', label: 'Tự nhập email', count: selectedManual },
          ]}
        />
        {tab === 'guests' ? (
          <div className="space-y-3">
            <FilterBar
              search={{ value: q, onChange: setQ, placeholder: 'Tìm theo tên, cơ quan, email...' }}
              filters={[
                { id: 'group', label: 'Nhóm', value: group, options: GROUP_OPTIONS, onChange: setGroup },
                { id: 'rsvp', label: 'Phản hồi', value: props.rsvpFilter, options: RSVP_OPTIONS, onChange: props.onRsvpFilter },
                { id: 'delivery', label: 'Thư mời', value: delivery, options: DELIVERY_OPTIONS, onChange: (v) => setDelivery(v as DeliveryFilter) },
              ]}
            />
            <DataTable
              rows={rows}
              columns={guestColumns}
              rowKey={(g) => g.id}
              maxHeight="28rem"
              stickyHeader
              selection={{
                selected: guestIds,
                // Only guests with an address can be chosen, whatever the table's own "select all" picks.
                onChange: (next) => onGuestIds(props.disabled ? guestIds : new Set([...next].filter((id) => emailable.has(id)))),
              }}
              empty={{ icon: 'users', title: 'Không tìm thấy đại biểu phù hợp bộ lọc.', text: guests.length === 0 ? 'Sự kiện chưa có khách mời.' : undefined }}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <Form form={manualForm} onSubmit={(v) => addManual(v)} className="space-y-3">
              <FormField label="Địa chỉ email người nhận" name="emails" hint="Có thể dán nhiều địa chỉ, kể cả dạng Họ tên <email@domain.vn>">
                <Textarea name="emails" rows={3} placeholder="Gõ 1 email hoặc nhiều email (cách nhau bởi dấu phẩy, chấm phẩy hoặc xuống dòng)..." />
              </FormField>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Họ tên (tùy chọn)" name="name">
                  <TextInput name="name" autoComplete="off" />
                </FormField>
                <FormField label="Cơ quan / Đơn vị (tùy chọn)" name="organization">
                  <TextInput name="organization" autoComplete="off" />
                </FormField>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="secondary" icon="plus" disabled={props.disabled}>Thêm người nhận</Button>
                <Button
                  variant="ghost"
                  icon="mail"
                  disabled={props.disabled}
                  onClick={() => addManual({ emails: '', name: '', organization: '' }, [{ email: officer.email, name: officer.name, organization: props.agencyName }])}
                >
                  Dùng email của tôi để thử nghiệm
                </Button>
                {manual.length > 0 && <Button variant="ghost" icon="trash" disabled={props.disabled} onClick={clearManual}>Xóa danh sách tự nhập</Button>}
              </div>
            </Form>
            <DataTable
              rows={manual}
              columns={manualColumns}
              rowKey={(m) => m.email}
              selection={{ selected: manualIds, onChange: (next) => onManual(manual, props.disabled ? manualIds : next) }}
              empty={{ icon: 'mail', title: 'Chưa có địa chỉ email tự nhập', text: 'Gõ email vào ô phía trên rồi bấm "Thêm người nhận", hoặc dán danh sách nhiều email cùng lúc.' }}
            />
          </div>
        )}
      </div>
    </SectionCard>
  );
}
