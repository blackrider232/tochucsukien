'use client';

// "Giám sát chỗ ngồi trực tiếp" (m5 §1.6, §3.5): every zone of the event's
// hall with its real seats (decision 19, BUG-19). Tiles are read-only text,
// never a check-in toggle (BUG-09); the state is a word, not only a colour
// (BUG-37); there is no lounge state (decision 11, BUG-22).

import { Badge, EmptyState, Icon, ProgressBar, SectionCard } from '@/components/ui';
import { ZONE_COLORS } from '@/features/venue';
import { formatAt, monitorZones, type MonitorZone, type SeatTile } from '../domain/desk';
import type { LiveScreenData } from '../domain/screen';

export function SeatMonitor({ data }: { data: LiveScreenData }) {
  const { hall, seats, roster, now } = data;
  if (!hall) {
    return (
      <SectionCard title="Giám sát tỷ lệ lấp đầy chỗ ngồi hội trường" icon="armchair">
        <EmptyState icon="building" title="Sự kiện chưa chọn hội trường" text="Chọn hội trường và xếp chỗ ở mục Sơ đồ chỗ ngồi (Khách mời) để theo dõi chỗ ngồi tại đây." />
      </SectionCard>
    );
  }
  const zones = monitorZones(hall, seats, roster);
  const assigned = zones.reduce((n, z) => n + z.assigned, 0);
  const arrived = zones.reduce((n, z) => n + z.arrived, 0);
  return (
    <SectionCard title="Giám sát tỷ lệ lấp đầy chỗ ngồi hội trường thời gian thực" icon="armchair" subtitle={`${arrived}/${assigned} đại biểu đã xếp ghế đã có mặt`}>
      <div className="space-y-4">
        <ul aria-label="Chú giải" className="flex flex-wrap items-center gap-3 text-xs text-ink-2">
          <li className="flex items-center gap-1.5"><Badge tone="emerald" icon="circle-check">Đã đến</Badge>đã check-in, an tọa</li>
          <li className="flex items-center gap-1.5"><Badge tone="amber">Chờ</Badge>đã xếp ghế, chưa đến</li>
          <li className="flex items-center gap-1.5"><span aria-hidden="true" className="inline-block size-4 rounded border border-dashed border-control-border bg-surface-2" />Ghế trống</li>
        </ul>
        <div className="rounded-control bg-surface-3 px-3 py-2 text-center text-sm font-bold text-ink">Sân khấu chính</div>
        {zones.map((z) => <ZoneSection key={z.zone.key} z={z} now={now} />)}
      </div>
    </SectionCard>
  );
}

function ZoneSection({ z, now }: { z: MonitorZone; now: LiveScreenData['now'] }) {
  return (
    <section aria-labelledby={`live-zone-${z.zone.key}`} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={ZONE_COLORS[z.zone.color].tone}>{z.zone.prefix}</Badge>
        <h3 id={`live-zone-${z.zone.key}`} className="min-w-0 break-words text-sm font-semibold text-ink">{z.zone.name}</h3>
        {z.zone.vipZone && <Badge tone="amber" icon="star">Khu VIP</Badge>}
        <span className="ml-auto text-sm font-semibold tabular-nums text-ink-2">{z.arrived}/{z.assigned} đã có mặt • {z.seats} ghế</span>
      </div>
      <ProgressBar value={z.arrived} max={Math.max(z.assigned, 1)} tone="emerald" label={`Khu ${z.zone.prefix} có mặt`} />
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
        {z.tiles.map((t) => <Tile key={t.code} t={t} now={now} />)}
      </ul>
    </section>
  );
}

function Tile({ t, now }: { t: SeatTile; now: LiveScreenData['now'] }) {
  if (t.state === 'empty') {
    return (
      <li className="flex min-h-16 flex-col gap-0.5 rounded-control border border-dashed border-control-border bg-surface-2 p-2 text-xs">
        <span className="font-mono font-semibold text-ink-2">{t.code}</span>
        <span className="italic text-ink-muted">Trống</span>
      </li>
    );
  }
  const name = t.guest?.name ?? 'Đã xếp';
  return (
    <li className="flex min-h-16 min-w-0 flex-col gap-0.5 rounded-control border border-control-border bg-surface p-2 text-xs" title={`${t.code}: ${name} (${t.state === 'arrived' ? 'đã có mặt' : 'chưa đến'})`}>
      <span className="flex items-center justify-between gap-1">
        <span className="font-mono font-semibold text-ink">{t.code}</span>
        {t.state === 'arrived' ? <Badge tone="emerald" icon="circle-check">Đã đến</Badge> : <Badge tone="amber">Chờ</Badge>}
      </span>
      <span className="truncate font-bold text-ink">{name}</span>
      {t.state === 'arrived'
        ? <span className="flex items-center gap-1 text-success-ink"><Icon name="clock" size={12} />{formatAt(t.at, now)}</span>
        : t.guest?.organization && <span className="truncate text-ink-muted">{t.guest.organization}</span>}
    </li>
  );
}
