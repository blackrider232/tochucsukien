'use client';

// "Bàn lễ tân check-in" (m5 §1.3): search that a scanner can type into, the
// guest table with one action per row, the rest in the row menu.

import { useMemo, useState, type FormEvent } from 'react';
import { Badge, Button, DataTable, FilterBar, Icon, RowMenu, SectionCard, StatusBadge, Switch, useBeep, useToast, type Column, type RowMenuItem } from '@/components/ui';
import { parseScannedCode } from '@/core/checkin-code';
import { foldVi } from '@/core/text';
import { GUEST_GROUPS, RSVP, enumOptions } from '@/core/vocab';
import type { RosterEntry } from '@/features/guests';
import { filterDesk, formatAt, NO_DESK_FILTER, type DeskFilter } from '../domain/desk';
import type { LiveScreenData } from '../domain/screen';
import { useDesk } from './desk-actions';

const STATUS_FILTER = [
  { value: 'all', label: 'Tất cả trạng thái check-in' },
  { value: 'checked_in', label: 'Đã đến (đã check-in)' },
  { value: 'not_yet', label: 'Chưa đến' },
];
const GROUP_FILTER = [{ value: 'all', label: 'Tất cả nhóm khách' }, ...enumOptions(GUEST_GROUPS).map((o) => ({ value: o.value, label: o.label }))];

/** Every value is React text: markup in a guest's name shows as typed (m5 BUG-12, BUG-14). */
function GuestCell({ g, now }: { g: RosterEntry; now: LiveScreenData['now'] }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="flex items-center gap-1 font-semibold text-ink">
        {g.group === 'VIP' && <span className="text-warning-ink" title="Đại biểu VIP"><Icon name="star" size={14} /></span>}
        <span className="break-words">{g.name}</span>
      </p>
      {g.rsvpStatus === 'substituted' && g.substituteName && <p className="text-xs italic text-warning-ink">Người thay: {g.substituteName}</p>}
      <p className="text-xs text-ink-muted md:hidden">{[g.title || 'Đại biểu', g.organization].filter(Boolean).join(' • ')}</p>
      <div className="flex flex-wrap items-center gap-1">
        {g.rsvpStatus === 'declined' && <StatusBadge registry={RSVP} value="declined" size="sm" />}
        {g.rsvpSource === 'walk_in' && <Badge tone="blue">Phát sinh</Badge>}
        <span className="md:hidden"><StatusBadge registry={GUEST_GROUPS} value={g.group} size="sm" /></span>
        {g.seatCode && <span className="font-mono text-xs font-semibold text-ink md:hidden">Ghế {g.seatCode}</span>}
        {g.checkedInAt && <span className="md:hidden"><Badge tone="emerald" icon="circle-check">Đã đến {formatAt(g.checkedInAt, now)}</Badge></span>}
      </div>
      {g.phone && <p className="flex items-center gap-1 text-xs text-ink-muted"><Icon name="phone" size={12} />{g.phone}</p>}
    </div>
  );
}

export function CheckinDesk({ data }: { data: LiveScreenData }) {
  const { roster, now, can } = data;
  const desk = useDesk();
  const toast = useToast();
  const beep = useBeep();
  const [filter, setFilter] = useState<DeskFilter>(NO_DESK_FILTER);
  const rows = useMemo(() => filterDesk(roster, filter), [roster, filter]);

  /** Enter: a scanned or typed code goes to the scanner path (exact match); otherwise one visible match is checked in (BUG-11). */
  const onEnter = async (e: FormEvent) => {
    e.preventDefault();
    const q = filter.q.trim();
    if (!q || !can.checkIn) return;
    if (parseScannedCode(q).kind !== 'invalid') {
      await desk.scan(q);
      setFilter((f) => ({ ...f, q: '' }));
    } else if (rows.length === 1) {
      await desk.checkIn(rows[0]!);
      setFilter((f) => ({ ...f, q: '' }));
    } else {
      toast.info(rows.length === 0 ? 'Không tìm thấy đại biểu phù hợp.' : `Có ${rows.length} đại biểu khớp. Bấm "Check-in" ở đúng dòng.`);
    }
  };

  const menu = (g: RosterEntry): RowMenuItem[] => [
    g.giftGivenAt
      ? { id: 'gift-off', label: 'Bỏ ghi nhận phát quà', icon: 'x', onSelect: () => void desk.setGift(g, false) }
      : { id: 'gift-on', label: 'Đã phát túi quà & tài liệu', icon: 'check', disabled: !g.checkedInAt, onSelect: () => void desk.setGift(g, true) },
    { id: 'cancel', label: 'Hủy check-in', icon: 'undo', tone: 'danger', disabled: !g.checkedInAt, onSelect: () => void desk.cancel(g) },
  ];

  const columns: Column<RosterEntry>[] = [
    { id: 'name', header: 'Họ và tên đại biểu', cell: (g) => <GuestCell g={g} now={now} />, sortValue: (g) => foldVi(g.name), width: '16rem' },
    {
      id: 'org', header: 'Chức danh & cơ quan', hideOnMobile: true, sortValue: (g) => foldVi(g.organization), width: '15rem',
      cell: (g) => <div className="text-sm"><p className="font-medium text-ink-2">{g.title || 'Đại biểu'}</p><p className="text-ink-muted">{g.organization}</p></div>,
    },
    { id: 'group', header: 'Nhóm khách', hideOnMobile: true, cell: (g) => <StatusBadge registry={GUEST_GROUPS} value={g.group} size="sm" /> },
    { id: 'seat', header: 'Vị trí ghế', hideOnMobile: true, align: 'center', sortValue: (g) => g.seatCode ?? '~', cell: (g) => (g.seatCode ? <span className="font-mono text-sm font-semibold text-ink">{g.seatCode}</span> : <span className="text-sm italic text-ink-muted">Chưa xếp</span>) },
    { id: 'banquet', header: 'Suất tiệc', hideOnMobile: true, align: 'center', cell: (g) => (g.hasBanquet ? <Badge tone="amber">Có</Badge> : <span className="text-sm text-ink-muted">Không</span>) },
    { id: 'gift', header: 'Túi quà & tài liệu', hideOnMobile: true, align: 'center', cell: (g) => (g.giftGivenAt ? <Badge tone="blue" icon="check">Đã phát</Badge> : <span className="text-sm text-ink-muted">Chưa phát</span>) },
    {
      id: 'time', header: 'Giờ check-in', hideOnMobile: true, sortValue: (g) => g.checkedInAt ?? '~',
      cell: (g) => (g.checkedInAt ? <span className="inline-flex items-center gap-1 text-sm font-semibold text-success-ink"><Icon name="clock" size={14} />{formatAt(g.checkedInAt, now)}</span> : <span className="text-sm italic text-ink-muted">Chưa đến</span>),
    },
    ...(can.checkIn
      ? [{
          id: 'action', header: 'Thao tác', align: 'right' as const,
          cell: (g: RosterEntry) => (
            <div className="flex items-center justify-end gap-1">
              {g.checkedInAt
                ? <span className="max-md:hidden"><Badge tone="emerald" icon="circle-check">Đã đến</Badge></span>
                : <Button variant="secondary" icon="check" onClick={() => void desk.checkIn(g)}>Check-in</Button>}
              <RowMenu label={`Thao tác với ${g.name}`} items={menu(g)} />
            </div>
          ),
        }]
      : []),
  ];

  return (
    <SectionCard title="Bàn lễ tân check-in & quét QR" icon="qr-code" subtitle={`${roster.filter((g) => g.checkedInAt).length}/${roster.length} đại biểu đã check-in`}>
      <div className="space-y-3">
        <form onSubmit={(e) => void onEnter(e)} aria-label="Tìm hoặc quét mã để check-in">
          <FilterBar
            search={{ value: filter.q, onChange: (q) => setFilter({ ...filter, q }), label: 'Tìm hoặc quét mã', placeholder: 'Nhập tên đại biểu, cơ quan, số điện thoại hoặc mã quét barcode (Enter để check-in)...' }}
            filters={[
              { id: 'status', label: 'Trạng thái', value: filter.status, options: STATUS_FILTER, onChange: (v) => setFilter({ ...filter, status: v as DeskFilter['status'] }) },
              { id: 'group', label: 'Nhóm khách', value: filter.group, options: GROUP_FILTER, onChange: (v) => setFilter({ ...filter, group: v as DeskFilter['group'] }) },
            ]}
          />
        </form>
        <Switch checked={beep.enabled} onChange={beep.setEnabled} label="Âm báo và rung khi quét" description="Lưu theo thiết bị này" />
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(g) => g.id}
          numbered
          rowTone={(g) => (g.checkedInAt ? 'emerald' : null)}
          empty={
            roster.length === 0
              ? { icon: 'users', title: 'Sự kiện chưa có đại biểu', text: 'Thêm khách mời ở mục Khách mời, hoặc bấm "Khách phát sinh" để tiếp nhận đại biểu tại chỗ.' }
              : { icon: 'search', title: 'Không tìm thấy đại biểu phù hợp', text: 'Thử từ khóa khác hoặc bấm "Khách phát sinh" để tiếp nhận đại biểu mới.' }
          }
        />
      </div>
    </SectionCard>
  );
}
