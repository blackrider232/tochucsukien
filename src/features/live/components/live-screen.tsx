'use client';

// "Điều hành hiện trường" (m5 §1.1): the header KPIs and actions every live
// sub-tab shares, then the sub-tab's content. The event header, switcher and
// sub-tab bar belong to the event layout (ui-rules 15).

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, KpiCard, PrintLink, useEventChanges } from '@/components/ui';
import { liveKpis } from '../domain/desk';
import type { LiveScreenData, LiveTab } from '../domain/screen';
import { CheckinDesk } from './checkin-desk';
import { DeskProvider } from './desk-actions';
import { DutyRoster } from './duty-roster';
import { IncidentDialog, IncidentLog } from './incident-log';
import { ScanDialog } from './scan-dialog';
import { SeatMonitor } from './seat-monitor';
import { WalkInDialog } from './walk-in-dialog';

const LIVE_TABLES = ['sce_tcsk_checkins', 'sce_tcsk_guests', 'sce_tcsk_seat_assignments', 'sce_tcsk_duty_staff', 'sce_tcsk_incidents'] as const;

type Open = 'scan' | 'walkin' | 'incident' | null;

export function LiveScreen({ data, tab }: { data: LiveScreenData; tab: LiveTab }) {
  const { event, can } = data;
  const router = useRouter();
  const { connected } = useEventChanges(event.id, LIVE_TABLES);
  const [open, setOpen] = useState<Open>(null);
  const k = liveKpis(data.roster, event.targetGuests, data.staff, data.incidents);

  return (
    <DeskProvider eventId={event.id} hall={data.hall}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {can.checkIn && <Button icon="qr-code" onClick={() => setOpen('scan')}>Quét mã QR check-in</Button>}
          {can.walkIn && <Button variant="secondary" icon="users" onClick={() => setOpen('walkin')}>Khách phát sinh</Button>}
          {can.manage && <Button variant="secondary" icon="siren" onClick={() => setOpen('incident')}>Báo sự cố</Button>}
          <PrintLink href={`/events/${event.id}/live/car-pass`} label="In thẻ xe VIP" />
          <span className="ml-auto flex items-center gap-2 text-xs text-ink-muted">
            {connected
              ? <Badge tone="emerald">Đang cập nhật trực tiếp</Badge>
              : <Button variant="ghost" icon="refresh" onClick={() => router.refresh()}>Tải lại số liệu</Button>}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="Tiến độ check-in" value={k.checkedIn} ofTotal={k.target} icon="circle-check" accent="teal" highlight
            badge={{ text: `${k.percent}%`, tone: k.percent >= 100 ? 'emerald' : 'teal' }}
            progress={{ value: Math.min(k.checkedIn, k.target), max: Math.max(k.target, 1) }}
            caption={`Đã xác nhận: ${k.attending} • Chưa đến: ${k.awaited}`}
          />
          <KpiCard label="Đại biểu VIP có mặt" value={k.vipCheckedIn} ofTotal={k.vipExpected} icon="star" accent="amber" caption={`Chưa đến: ${Math.max(0, k.vipExpected - k.vipCheckedIn)} lãnh đạo VIP`} />
          <KpiCard label="Đại biểu khác đã đến" value={k.otherCheckedIn} icon="building" accent="blue" caption={`Túi quà & tài liệu đã phát: ${k.gifts} bộ`} />
          <KpiCard
            label="Trực ban & sự cố" value={k.openIncidents} icon="shield" accent="rose"
            badge={k.urgentOpen > 0 ? { text: `${k.urgentOpen} sự cố khẩn cấp`, tone: 'rose', pulse: true } : undefined}
            caption={`Sự cố đang xử lý • Cán bộ trực đã điểm danh: ${k.staffPresent}/${k.staffTotal}`}
          />
        </div>

        {tab === 'checkin' && <CheckinDesk data={data} />}
        {tab === 'duty' && <DutyRoster data={data} />}
        {tab === 'incidents' && <IncidentLog data={data} onReport={() => setOpen('incident')} />}
        {tab === 'monitor' && <SeatMonitor data={data} />}
      </div>

      <ScanDialog open={open === 'scan'} onClose={() => setOpen(null)} />
      {open === 'walkin' && <WalkInDialog data={data} onClose={() => setOpen(null)} />}
      {open === 'incident' && <IncidentDialog eventId={event.id} incident={null} onClose={() => setOpen(null)} />}
    </DeskProvider>
  );
}
