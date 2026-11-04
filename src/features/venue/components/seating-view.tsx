'use client';

import { useMemo, useState } from 'react';
import {
  Alert, Badge, Button, cn, DataTable, EmptyState, FilterBar, Icon, IconButton, PrintLink, ProgressBar, RowMenu, SectionCard, StatusBadge, useDialogs, useToast,
} from '@/components/ui';
import type { GuestId, SeatCode } from '@/core/brand';
import { useCommand } from '@/core/commands';
import { matchesQuery } from '@/core/text';
import { GUEST_GROUPS, isAttending, RSVP } from '@/core/vocab';
import type { EventHall, HallTemplate, HallZone } from '../contract';
import { findFreeSeat, formatCount, hallCapacity, orphanSeats, seatCodes, ZONE_COLORS, ZONE_GROUPS, zoneOccupancy, zoneOfSeat } from '../domain/halls';
import { AutoAssignDialog, ChangeHallDialog, ZonesDialog } from './hall-dialogs';
import { SeatDialog, seatCandidates } from './seat-dialog';
import type { SeatGuestView, SeatingScreenData } from './screen-types';
import { ZoneBadge } from './zone-badge';

type Open = { kind: 'seat'; code: SeatCode; preselect?: SeatGuestView } | { kind: 'hall' } | { kind: 'zones' } | { kind: 'auto' };

/** The hall's display name: the template it was copied from, or a plain label when that template is gone (m4b BUG-11, BUG-12). */
export function hallTitle(hall: EventHall, templates: ReadonlyArray<HallTemplate>): { name: string; location: string; template: HallTemplate | null } {
  const template = templates.find((t) => t.id === hall.templateId) ?? null;
  return template
    ? { name: template.name, location: template.location, template }
    : { name: 'Hội trường riêng của sự kiện (mẫu gốc không còn trong danh mục)', location: '', template: null };
}

/** "Sơ đồ chỗ ngồi" (m4b §1.4): legend, stage, zones of seat buttons, and the guest finder. */
export function SeatingView({ data }: { data: SeatingScreenData }) {
  const { event, hall, templates, seats, guests, canWrite, canAdminHalls } = data;
  const run = useCommand();
  const dialogs = useDialogs();
  const toast = useToast();
  const [open, setOpen] = useState<Open | null>(null);
  const roster = guests.ready ? guests.value : null;
  const byId = useMemo(() => new Map((roster ?? []).map((g) => [g.id, g])), [roster]);
  const occupantOf = useMemo(() => new Map(seats.map((s) => [s.seatCode, s.guestId])), [seats]);
  const seatOf = useMemo(() => new Map(seats.map((s) => [s.guestId, s.seatCode])), [seats]);
  const interactive = canWrite && roster !== null;
  const close = () => setOpen(null);

  const notReady = !guests.ready && (
    <Alert tone="warning" title="Danh sách khách mời chưa sẵn sàng">
      Sơ đồ hiển thị các ghế đã xếp nhưng chưa có tên đại biểu. Xếp chỗ, tự động xếp và tìm đại biểu mở khi phân hệ Khách mời hoạt động.
    </Alert>
  );

  if (!hall) {
    return (
      <div className="space-y-4">
        {notReady}
        <SectionCard title="Sơ đồ phân khu chỗ ngồi hội trường" icon="armchair">
          <EmptyState icon="building" title="Sự kiện chưa chọn hội trường"
            text={canWrite ? 'Chọn một hội trường mẫu để tạo sơ đồ chỗ ngồi cho sự kiện.' : 'Cán bộ phụ trách sự kiện chưa chọn hội trường.'}
            action={canWrite && templates.length > 0 ? <Button icon="building" onClick={() => setOpen({ kind: 'hall' })}>Chọn hội trường</Button> : undefined} />
          {canWrite && templates.length === 0 && <Alert tone="info">Danh mục hội trường mẫu đang trống. Liên hệ quản trị viên để thêm hội trường.</Alert>}
        </SectionCard>
        {open?.kind === 'hall' && <ChangeHallDialog event={event} hall={null} templates={templates} seats={seats} onClose={close} />}
      </div>
    );
  }

  const { name, location, template } = hallTitle(hall, templates);
  const capacity = hallCapacity(hall.zones);
  const occupancy = zoneOccupancy(hall, seats, new Set());
  const seatedInHall = occupancy.reduce((n, z) => n + z.assigned, 0);
  const orphans = orphanSeats(hall, seats);
  const guestName = (id: GuestId) => byId.get(id)?.name ?? 'đại biểu';

  const clearAll = async () => {
    const ok = await dialogs.confirm({
      title: 'Hủy tất cả xếp chỗ?', text: 'Thao tác sẽ đưa toàn bộ ghế hội trường về trạng thái Trống để xếp lại từ đầu. Có thể hoàn tác ngay sau đó.',
      confirmLabel: 'Đồng ý hủy tất cả', cancelLabel: 'Không', tone: 'danger',
    });
    if (ok) await run('venue.clearSeats', { eventId: event.id }, { success: 'Đã giải phóng toàn bộ ghế ngồi' });
  };
  const releaseOrphans = async () => {
    const ok = await dialogs.confirm({
      title: 'Giải phóng ghế không còn trong sơ đồ?', text: `${orphans.length} đại biểu trở về chưa xếp chỗ. Thao tác này không hoàn tác được.`,
      confirmLabel: 'Giải phóng', cancelLabel: 'Hủy', tone: 'danger',
    });
    if (ok) await run('venue.releaseOrphans', { eventId: event.id }, { success: `Đã giải phóng ${orphans.length} ghế` });
  };
  /** "Chưa xếp" shortcut (m4b §3.4, BUG-09): the first free seat for the guest's group, with the guest already picked. */
  const seatGuest = (g: SeatGuestView) => {
    const code = findFreeSeat(hall, new Set(occupantOf.keys()), g.group);
    if (!code) return toast.warning('Hội trường đã hết ghế trống phù hợp');
    setOpen({ kind: 'seat', code, preselect: g });
  };
  const unseat = (g: SeatGuestView) => {
    const code = seatOf.get(g.id);
    if (code) void run('venue.applySeats', { eventId: event.id, changes: [{ seatCode: code, from: g.id, to: null }] }, { success: `Đã hủy xếp chỗ ghế ${code}` });
  };

  const opened = open?.kind === 'seat' ? { code: open.code, zone: zoneOfSeat(hall, open.code)!, occupant: byId.get(occupantOf.get(open.code)!) ?? null } : null;

  return (
    <div className="space-y-4">
      {notReady}
      <SectionCard title="Sơ đồ phân khu chỗ ngồi hội trường" icon="armchair"
        subtitle={`${name} • ${location || 'Chưa cập nhật địa điểm'} • Tổng ${formatCount(capacity)} ghế (${hall.zones.length} khu)`}
        actions={
          <>
            {canWrite && <Button variant="secondary" icon="building" onClick={() => setOpen({ kind: 'hall' })}>Đổi hội trường</Button>}
            {canWrite && <Button variant="secondary" icon="layers" onClick={() => setOpen({ kind: 'zones' })}>Cấu hình phân khu</Button>}
            {canWrite && <Button icon="users" disabled={!interactive} onClick={() => setOpen({ kind: 'auto' })}>Tự động xếp chỗ</Button>}
            <PrintLink href={`/events/${event.id}/seating/print`} label="In sơ đồ" />
            {(canWrite || canAdminHalls) && (
              <RowMenu label="Thao tác khác với sơ đồ chỗ ngồi" items={[
                ...(canWrite ? [{ id: 'clear', label: 'Hủy tất cả vị trí ghế đã xếp', icon: 'undo' as const, tone: 'danger' as const, disabled: seats.length === 0, onSelect: () => void clearAll() }] : []),
                ...(canAdminHalls ? [{ id: 'catalog', label: 'Quản trị hội trường mẫu', icon: 'building' as const, href: '/admin/halls' }] : []),
              ]} />
            )}
          </>
        }>
        <div className="space-y-4">
          {orphans.length > 0 && (
            <Alert tone="warning" title={`${orphans.length} chỗ đã xếp không còn trong sơ đồ hội trường`}
              action={canWrite ? <Button variant="secondary" onClick={() => void releaseOrphans()}>Giải phóng các ghế này</Button> : undefined}>
              {orphans.map((s) => `${s.seatCode} (${guestName(s.guestId)})`).join(', ')}. Các đại biểu này vẫn tính là đã xếp chỗ cho tới khi được giải phóng hoặc xếp lại.
            </Alert>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <ul aria-label="Chú giải phân khu" className="flex flex-1 flex-wrap items-center gap-2">
              {hall.zones.map((z) => <li key={z.key}><ZoneBadge zone={z} /></li>)}
              <li className="flex items-center gap-1.5 text-xs text-ink-2"><span aria-hidden="true" className="inline-block size-4 rounded border border-dashed border-control-border bg-surface-2" />Còn trống</li>
            </ul>
            <div className="w-full sm:w-64"><ProgressBar value={seatedInHall} max={capacity} label={`${formatCount(seatedInHall)}/${formatCount(capacity)} ghế đã xếp`} /></div>
          </div>
          <div className="rounded-control bg-surface-3 px-3 py-2 text-center">
            <p className="text-sm font-bold text-ink">Sân khấu chính</p>
            <p className="text-xs text-ink-muted">Bục phát biểu lãnh đạo · Bàn đoàn chủ tịch · Cabin dịch song ngữ</p>
          </div>
          {hall.zones.map((zone, i) => (
            <ZoneBlock key={zone.key} zone={zone} assigned={occupancy[i]!.assigned} occupantOf={occupantOf} byId={byId} interactive={interactive}
              onSeat={(code) => setOpen({ kind: 'seat', code })} />
          ))}
        </div>
      </SectionCard>

      {roster && <GuestFinder guests={roster} hall={hall} seatOf={seatOf} interactive={interactive} onSeat={seatGuest} onUnseat={unseat} />}

      {opened && roster && (
        <SeatDialog event={event} zone={opened.zone} code={opened.code} occupant={opened.occupant} guests={roster} seatOf={seatOf}
          preselect={open?.kind === 'seat' ? open.preselect : undefined} onClose={close} />
      )}
      {open?.kind === 'hall' && <ChangeHallDialog event={event} hall={hall} templates={templates} seats={seats} onClose={close} />}
      {open?.kind === 'zones' && <ZonesDialog event={event} hall={hall} template={template} seats={seats} onClose={close} />}
      {open?.kind === 'auto' && roster && <AutoAssignDialog event={event} hall={hall} guests={roster} seats={seats} onClose={close} />}
    </div>
  );
}

function ZoneBlock({ zone, assigned, occupantOf, byId, interactive, onSeat }: {
  zone: HallZone; assigned: number; occupantOf: ReadonlyMap<SeatCode, GuestId>; byId: ReadonlyMap<GuestId, SeatGuestView>; interactive: boolean; onSeat: (code: SeatCode) => void;
}) {
  const tone = ZONE_COLORS[zone.color].tone;
  return (
    <section aria-labelledby={`zone-${zone.key}`} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={`zone-${zone.key}`} className="sr-only">{zone.name}</h3>
        <ZoneBadge zone={zone} />
        {zone.vipZone && <Badge tone="amber" icon="star">Khu VIP</Badge>}
        <span className="text-xs text-ink-muted">{ZONE_GROUPS[zone.assignedGroup].short}</span>
        <span className="ml-auto text-sm font-semibold tabular-nums text-ink-2">{assigned}/{zone.seatCount} đã xếp</span>
      </div>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
        {seatCodes(zone).map((code) => {
          const guestId = occupantOf.get(code);
          const guest = guestId ? byId.get(guestId) : undefined;
          const label = guestId
            ? `Ghế ${code}: ${guest ? `${guest.name}${guest.organization ? ` (${guest.organization})` : ''}` : 'đã xếp'}${interactive ? '. Bấm để thay đổi' : ''}`
            : `Ghế trống ${code}${interactive ? '. Bấm để xếp đại biểu' : ''}`;
          return (
            <li key={code}>
              <button type="button" disabled={!interactive} aria-label={label} title={label} onClick={() => onSeat(code)}
                className={cn(
                  'flex min-h-20 w-full flex-col items-start gap-0.5 rounded-control border p-2 text-left text-xs transition-colors disabled:cursor-default',
                  guestId ? 'border-control-border bg-surface enabled:hover:bg-surface-2' : 'border-dashed border-control-border bg-surface-2 enabled:hover:bg-surface-3',
                )}>
                <span className="flex w-full items-center justify-between gap-1">
                  <Badge tone={tone}>{code}</Badge>
                  {guestId && <span className="text-success-ink"><Icon name="circle-check" size={14} /></span>}
                </span>
                {guestId ? (
                  <>
                    <span className="w-full truncate font-bold text-ink">{guest?.name ?? 'Đã xếp'}</span>
                    {guest?.organization && <span className="w-full truncate text-ink-muted">{guest.organization}</span>}
                  </>
                ) : (
                  <>
                    <span className="italic text-ink-muted">Trống</span>
                    {interactive && <span className="font-semibold text-link">+ Xếp chỗ</span>}
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type SeatFilter = 'unseated' | 'seated' | 'all';
const SEAT_FILTERS: ReadonlyArray<{ value: SeatFilter; label: string }> = [
  { value: 'unseated', label: 'Chưa xếp chỗ' },
  { value: 'seated', label: 'Đã xếp chỗ' },
  { value: 'all', label: 'Tất cả' },
];

/** Find a guest by name, organization, title or seat; seat an unseated one in a single step. */
function GuestFinder({ guests, hall, seatOf, interactive, onSeat, onUnseat }: {
  guests: ReadonlyArray<SeatGuestView>; hall: EventHall; seatOf: ReadonlyMap<GuestId, SeatCode>; interactive: boolean;
  onSeat: (g: SeatGuestView) => void; onUnseat: (g: SeatGuestView) => void;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<SeatFilter>('unseated');
  const rows = seatCandidates(guests).filter((g) => {
    const seated = seatOf.has(g.id);
    return (filter === 'all' || (filter === 'seated') === seated) && matchesQuery(q, g.name, g.organization, g.title, seatOf.get(g.id));
  });
  const waiting = guests.filter((g) => isAttending(g.rsvpStatus) && !seatOf.has(g.id)).length;

  return (
    <SectionCard title="Tìm đại biểu" icon="search" subtitle={`${waiting} đại biểu đã xác nhận chưa có ghế`}>
      <DataTable<SeatGuestView>
        rows={rows}
        rowKey={(g) => g.id}
        toolbar={<FilterBar search={{ value: q, onChange: setQ, placeholder: 'Tên, cơ quan, chức vụ hoặc mã ghế...' }}
          filters={[{ id: 'seat', label: 'Xếp chỗ', value: filter, options: SEAT_FILTERS, onChange: (v) => setFilter(v as SeatFilter) }]} />}
        empty={{ icon: 'users', title: q ? 'Không tìm thấy đại biểu phù hợp' : 'Không có đại biểu trong mục này' }}
        columns={[
          { id: 'name', header: 'Đại biểu', cell: (g) => <span><span className="font-semibold text-ink">{g.name}</span><span className="block text-xs text-ink-muted">{[g.title, g.organization].filter(Boolean).join(', ')}</span></span> },
          { id: 'group', header: 'Nhóm', hideOnMobile: true, cell: (g) => <Badge tone={GUEST_GROUPS[g.group].tone}>{GUEST_GROUPS[g.group].short}</Badge> },
          { id: 'rsvp', header: 'Xác nhận', hideOnMobile: true, cell: (g) => <StatusBadge registry={RSVP} value={g.rsvpStatus} size="sm" /> },
          {
            id: 'seat', header: 'Ghế', cell: (g) => {
              const code = seatOf.get(g.id);
              if (!code) return <span className="text-xs italic text-ink-muted">Chưa xếp</span>;
              const zone = zoneOfSeat(hall, code);
              return <Badge tone={zone ? ZONE_COLORS[zone.color].tone : 'slate'}>{code}</Badge>;
            },
          },
          {
            id: 'action', header: 'Thao tác', align: 'right', cell: (g) => !interactive ? null : seatOf.has(g.id)
              ? <IconButton icon="x" tone="red" label={`Bỏ xếp chỗ của ${g.name}`} onClick={() => onUnseat(g)} />
              : <Button variant="secondary" icon="armchair" onClick={() => onSeat(g)}>Xếp chỗ</Button>,
          },
        ]}
      />
    </SectionCard>
  );
}
