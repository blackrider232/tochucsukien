'use client';

import { useMemo, useState } from 'react';
import { Badge, Button, EmptyState, PrintLink, QrCode, SectionCard } from '@/components/ui';
import { useSettings } from '@/core/auth';
import { encodeCheckinPayload } from '@/core/checkin-code';
import { GUEST_GROUPS } from '@/core/vocab';
import type { Guest, RosterEntry } from '../contract';
import { printHref } from '../domain/print';
import { printSets, titleOrDefault } from '../domain/roster';
import type { GuestScreenData } from '../domain/screen';
import { GuestFormDialog } from './guest-form';

/** Sub-tab 2 (m4a §1.4): what will print, one preview per tent and badge, and the links to the print sheets. */
export function PrintStudio({ data }: { data: GuestScreenData }) {
  const settings = useSettings();
  const [editing, setEditing] = useState<Guest | null>(null);
  const { event, roster, canWrite } = data;
  const vip = useMemo(() => new Set(data.vipSeats), [data.vipSeats]);
  const { namecards, badges } = printSets(roster, (code) => vip.has(code));

  return (
    <div className="space-y-4">
      <Button variant="ghost" icon="arrow-left" href={`/events/${event.id}/guests`}>Về danh sách khách mời</Button>
      <SectionCard
        title="Biển tên để bàn chữ A (đại biểu VIP)"
        subtitle="Quy chuẩn kích thước 10cm x 28cm (gấp đôi A4), in 2 mặt đối xứng cho khách mời VIP."
        icon="star"
        actions={namecards.length > 0 && <PrintLink href={printHref(event.id, 'namecards', { preview: true })} label="In toàn bộ biển tên VIP" />}
      >
        {namecards.length === 0 ? (
          <EmptyState icon="star" title="Chưa có đại biểu VIP" text="Các đại biểu thuộc nhóm VIP hoặc xếp chỗ tại khu VIP của hội trường sẽ tự động được tạo biển tên để bàn chữ A tiêu chuẩn 10cm x 28cm." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {namecards.map((g) => (
              <li key={g.id} className="flex flex-col gap-2 rounded-card bg-surface-2 p-3">
                <div className="flex items-center justify-between gap-2 text-xs font-semibold text-ink-muted">
                  <span>Biển tên chữ A (10x28cm)</span>
                  <Badge tone="amber">{g.seatCode ? `Ghế: ${g.seatCode}` : 'VIP'}</Badge>
                </div>
                <TentPreview g={g} />
                <div className="flex flex-wrap justify-end gap-2">
                  {canWrite && <Button variant="ghost" icon="pencil" onClick={() => setEditing(g)}>Sửa</Button>}
                  <PrintLink href={printHref(event.id, 'namecards', { guest: g.id, preview: true })} label="In biển này" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Thẻ đại biểu tham dự (kèm mã QR check-in)"
        subtitle="Khổ chuẩn 9cm x 13cm, tích hợp mã QR riêng biệt cho từng đại biểu phục vụ check-in tức thì tại bàn lễ tân."
        icon="qr-code"
        actions={badges.length > 0 && <PrintLink href={printHref(event.id, 'badges', { preview: true })} label="In hàng loạt thẻ đại biểu" />}
      >
        {badges.length === 0 ? (
          <EmptyState icon="qr-code" title="Chưa có thẻ đại biểu" text="Các đại biểu thuộc khối Sở ngành, Doanh nghiệp, Quốc tế và Báo chí sẽ được tạo thẻ kèm mã QR phục vụ check-in tức thì." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {badges.map((g) => (
              <li key={g.id} className="flex flex-col overflow-hidden rounded-card bg-surface-2">
                <div className="bg-surface-3 px-3 py-2 text-center text-xs text-ink-2">
                  <p className="font-bold">{settings.agencyShortName}</p>
                  <p className="truncate">{event.name}</p>
                </div>
                <div className="flex flex-1 flex-col items-center gap-1 p-3 text-center">
                  <p className="text-xs text-ink-muted">{titleOrDefault(g)}</p>
                  <p className="font-bold uppercase text-ink">{g.name}</p>
                  <p className="text-xs text-ink-2">{g.organization}</p>
                  <Badge tone={GUEST_GROUPS[g.group].tone}>{GUEST_GROUPS[g.group].short}</Badge>
                  <QrCode payload={encodeCheckinPayload(event.id, g.id)} size={72} caption={g.checkinCode} />
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-xs text-ink-muted">
                  <span>{g.seatCode ? `Ghế: ${g.seatCode}` : 'Khu vực chung'}</span>
                  <PrintLink href={printHref(event.id, 'badges', { guest: g.id, preview: true })} label="In thẻ" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {editing && <GuestFormDialog eventId={event.id} guest={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** A small paper preview: the back face upside down, the fold, the front face. */
function TentPreview({ g }: { g: RosterEntry }) {
  return (
    <div className="rounded-control border border-line bg-paper px-3 py-2 text-center text-paper-ink">
      <div className="rotate-180">
        <p className="text-2xs uppercase">{titleOrDefault(g)}</p>
        <p className="text-sm font-bold uppercase">{g.name}</p>
      </div>
      <p className="my-1 border-y border-dashed border-line text-2xs text-ink-muted">Vạch gấp giữa 10cm x 28cm</p>
      <p className="text-2xs uppercase">{titleOrDefault(g)}</p>
      <p className="text-sm font-bold uppercase">{g.name}</p>
      <p className="text-2xs">{g.organization}</p>
    </div>
  );
}
