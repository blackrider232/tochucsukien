'use client';

import { useState } from 'react';
import { Alert, Badge, Button, Combobox, Dialog, FormField, StatusBadge } from '@/components/ui';
import type { GuestId, SeatCode } from '@/core/brand';
import { useCommand } from '@/core/commands';
import { GUEST_GROUPS, isAttending, RSVP } from '@/core/vocab';
import type { HallZone } from '../contract';
import { ZONE_GROUPS, type SeatChange } from '../domain/halls';
import type { EventRef, SeatGuestView } from './screen-types';
import { ZoneBadge } from './zone-badge';

/** Attending guests first, then the ones who have not answered; a declined guest is never offered (m4b BUG-33, product question 7.3). */
export function seatCandidates(guests: ReadonlyArray<SeatGuestView>): ReadonlyArray<SeatGuestView> {
  return guests.filter((g) => g.rsvpStatus !== 'declined').toSorted((a, b) => Number(isAttending(b.rsvpStatus)) - Number(isAttending(a.rsvpStatus)));
}

/**
 * "Xếp chỗ ngồi ghế {code}": pick who sits here. Moving a guest, swapping with the occupant or leaving the occupant
 * without a seat is said before it happens (m4b §3.2, BUG-09); the command checks the seat still holds what was shown.
 */
export function SeatDialog({ event, zone, code, occupant, guests, seatOf, preselect, onClose }: {
  event: EventRef;
  zone: HallZone;
  code: SeatCode;
  occupant: SeatGuestView | null;
  guests: ReadonlyArray<SeatGuestView>;
  seatOf: ReadonlyMap<GuestId, SeatCode>;
  preselect?: SeatGuestView;
  onClose: () => void;
}) {
  const run = useCommand();
  const [picked, setPicked] = useState<SeatGuestView | null>(preselect ?? null);
  const [busy, setBusy] = useState(false);
  const candidates = seatCandidates(guests);
  const from = picked ? seatOf.get(picked.id) ?? null : null;
  const changed = picked !== null && picked.id !== occupant?.id;

  const changes = (): SeatChange[] => {
    if (!picked) return [];
    const here: SeatChange = { seatCode: code, from: occupant?.id ?? null, to: picked.id };
    // The guest leaves their old seat; the occupant takes it when there is one, so the two swap.
    return from ? [here, { seatCode: from, from: picked.id, to: occupant?.id ?? null }] : [here];
  };
  const apply = async (next: SeatChange[], success: string) => {
    setBusy(true);
    const done = await run('venue.applySeats', { eventId: event.id, changes: next }, { success });
    setBusy(false);
    if (done) onClose();
  };

  return (
    <Dialog open onClose={onClose} size="lg" icon="armchair" title={`Xếp chỗ ngồi ghế ${code}`} subtitle="Chỉ định đại biểu ngồi vị trí này"
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          {occupant && (
            <Button variant="danger" icon="x" loading={busy}
              onClick={() => void apply([{ seatCode: code, from: occupant.id, to: null }], `Đã hủy xếp chỗ ghế ${code}`)}>Bỏ xếp chỗ</Button>
          )}
          <span className="flex-1" />
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button icon="check" disabled={!changed} loading={busy} onClick={() => void apply(changes(), `Đã lưu xếp chỗ cho ghế ${code}`)}>Xác nhận</Button>
        </div>
      }>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
          <ZoneBadge zone={zone} />
          <span>Dành cho: {ZONE_GROUPS[zone.assignedGroup].short}</span>
          {zone.vipZone && <Badge tone="amber" icon="star">Khu VIP</Badge>}
        </div>
        <p className="text-sm text-ink-2">
          Đang ngồi: {occupant ? <strong className="text-ink">{occupant.name}{occupant.organization ? ` (${occupant.organization})` : ''}</strong> : <span className="italic">ghế trống</span>}
        </p>
        <FormField label="Chọn đại biểu từ danh sách" name="seat-guest" hint="Gõ tên hoặc cơ quan, hoặc nhấn mũi tên xuống để xem danh sách. Đại biểu đã xác nhận hiện trước; đại biểu báo vắng không được xếp chỗ.">
          <Combobox<SeatGuestView>
            name="seat-guest"
            search={async (q) => (q.trim() ? candidates : candidates.slice(0, 50))}
            itemKey={(g) => g.id}
            itemLabel={(g) => `${g.name}${g.organization ? ` - ${g.organization}` : ''}`}
            renderItem={(g) => (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-semibold">{g.name}</span>
                <span className="text-ink-muted">{[g.title, g.organization].filter(Boolean).join(', ')}</span>
                <Badge tone={GUEST_GROUPS[g.group].tone}>{GUEST_GROUPS[g.group].short}</Badge>
                {!isAttending(g.rsvpStatus) && <Badge tone="slate">Chưa xác nhận</Badge>}
                <span className="text-xs text-ink-muted">{seatOf.has(g.id) ? `Đang ở ${seatOf.get(g.id)}` : 'Chưa xếp'}</span>
              </span>
            )}
            onPick={setPicked}
          />
        </FormField>
        {picked && (
          <div className="space-y-2" aria-live="polite">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <strong className="text-ink">{picked.name}</strong>
              <Badge tone={GUEST_GROUPS[picked.group].tone}>{GUEST_GROUPS[picked.group].short}</Badge>
              <StatusBadge registry={RSVP} value={picked.rsvpStatus} size="sm" />
            </p>
            {!changed && <Alert tone="info">{picked.name} đang ngồi ghế này.</Alert>}
            {changed && zone.assignedGroup !== 'all' && zone.assignedGroup !== picked.group && (
              <Alert tone="warning">Khu này dành cho {ZONE_GROUPS[zone.assignedGroup].short}; {picked.name} thuộc nhóm {GUEST_GROUPS[picked.group].short}.</Alert>
            )}
            {changed && zone.vipZone && picked.group !== 'VIP' && <Alert tone="warning">Ghế thuộc khu VIP: đại biểu ngồi đây được in biển tên chữ A.</Alert>}
            {changed && from && <Alert tone="info">Chuyển {picked.name} từ ghế {from} sang ghế {code}?{occupant ? ` ${occupant.name} sẽ chuyển sang ghế ${from}.` : ''}</Alert>}
            {changed && !from && occupant && <Alert tone="warning">{occupant.name} sẽ chưa có chỗ ngồi.</Alert>}
            {changed && !isAttending(picked.rsvpStatus) && <Alert tone="info">Đại biểu chưa xác nhận tham dự.</Alert>}
          </div>
        )}
      </div>
    </Dialog>
  );
}
