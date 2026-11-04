'use client';

import type { CSSProperties } from 'react';
import { LinkTabs, PrintPage, QrCode } from '@/components/ui';
import type { EventId } from '@/core/brand';
import { encodeCheckinPayload } from '@/core/checkin-code';
import type { OrgIdentity } from '@/core/settings';
import { GUEST_GROUPS } from '@/core/vocab';
import type { RosterEntry } from '../contract';
import { BADGE_THEMES, NAMECARD_THEMES, SIZES, chunk, printHref, type PrintKind, type ThemeEntry } from '../domain/print';
import { titleOrDefault } from '../domain/roster';

const mm = (n: number) => `${n}mm`;

/** A face of the table tent, 100 x 280 mm; the back face is printed upside down so both read once folded. */
function TentFace({ g, flipped }: { g: RosterEntry; flipped?: boolean }) {
  const style: CSSProperties = { width: mm(SIZES.tent.width), height: mm(SIZES.tent.face) };
  return (
    <div style={style} className={`flex flex-col items-center justify-center gap-2 px-8 text-center ${flipped ? 'rotate-180' : ''}`}>
      <p className="text-2xl font-semibold uppercase text-(--tone-fg)">{titleOrDefault(g)}</p>
      <p className="text-5xl font-bold uppercase leading-tight">{g.name}</p>
      {g.organization && <p className="text-xl">{g.organization}</p>}
    </div>
  );
}

function Tent({ g, theme }: { g: RosterEntry; theme: ThemeEntry }) {
  return (
    <div data-tone={theme.tone} className={`mx-auto border-4 border-double border-(--tone-solid) ${theme.fill ? 'bg-(--tone-bg)' : 'bg-paper'}`} style={{ width: mm(SIZES.tent.width), marginTop: mm(SIZES.tent.top) }}>
      <TentFace g={g} flipped />
      <p style={{ height: mm(SIZES.tent.fold) }} className="flex items-center justify-center border-y border-dashed border-(--tone-solid) text-print-xs text-(--tone-fg)">
        Vạch gấp đôi tạo biển chữ A - khổ chuẩn 10cm x 28cm
      </p>
      <TentFace g={g} />
    </div>
  );
}

function Badge({ eventId, eventName, org, g, theme }: { eventId: EventId; eventName: string; org: OrgIdentity; g: RosterEntry; theme: ThemeEntry }) {
  const style: CSSProperties = { width: mm(SIZES.badge.width), height: mm(SIZES.badge.height) };
  return (
    <article
      aria-label={`Thẻ đại biểu ${g.name}`}
      data-tone={theme.tone}
      style={style}
      className={`flex flex-col overflow-hidden border-2 border-dashed border-(--tone-solid) ${theme.fill ? 'bg-(--tone-bg)' : 'bg-paper'}`}
    >
      <header className="bg-(--tone-solid) px-3 py-2 text-center text-(--tone-on-solid)">
        <p className="text-print-xs font-bold uppercase">{org.agencyName}</p>
        <p className="text-print-xs">{eventName}</p>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-3 text-center">
        <p className="text-print-sm">{titleOrDefault(g)}</p>
        <p className="text-xl font-bold uppercase leading-tight">{g.name}</p>
        <p className="text-print-sm">{g.organization}</p>
        <p className="text-print-xs font-semibold text-(--tone-fg)">{GUEST_GROUPS[g.group].short}</p>
      </div>
      <footer className="flex items-end justify-between gap-2 px-3 pb-3">
        <div className="text-print-xs">
          <p className="font-semibold">{g.seatCode ? `Vị trí: ${g.seatCode}` : 'Khu vực đại biểu'}</p>
          <p>Mã check-in</p>
        </div>
        <QrCode payload={encodeCheckinPayload(eventId, g.id)} size={112} caption={g.checkinCode} />
      </footer>
    </article>
  );
}

/** The (print) document: a theme picker that never prints, then one sheet per tent or per four badges. */
export function PrintSheets({ kind, themeId, eventId, eventName, org, guests, guestId }: {
  kind: PrintKind;
  themeId: string;
  eventId: EventId;
  eventName: string;
  org: OrgIdentity;
  guests: ReadonlyArray<RosterEntry>;
  guestId: string | null;
}) {
  const registry: Readonly<Record<string, ThemeEntry>> = kind === 'namecards' ? NAMECARD_THEMES : BADGE_THEMES;
  const theme = registry[themeId]!;
  const pages = kind === 'namecards' ? guests.map((g) => [g]) : chunk(guests, SIZES.badge.perPage);

  return (
    <div data-theme="light">
      <div data-no-print className="mx-auto mb-3 max-w-4xl space-y-2 rounded-card border border-line bg-surface p-3 shadow-card">
        <p className="text-sm font-semibold text-ink">
          {kind === 'namecards' ? 'Xem trước bản in biển tên chữ A để bàn (VIP)' : 'Xem trước bản in thẻ đại biểu (4 thẻ / trang A4, kèm QR)'}
          {` · ${guests.length} ${kind === 'namecards' ? 'biển tên' : 'thẻ'}`}
        </p>
        <LinkTabs
          variant="pill"
          label={kind === 'namecards' ? 'Mẫu nền biển tên' : 'Mẫu nền thẻ'}
          activeId={themeId}
          items={Object.entries(registry).map(([id, t]) => ({ id, label: t.short, href: printHref(eventId, kind, { theme: id, preview: true, ...(guestId ? { guest: guestId as RosterEntry['id'] } : {}) }) }))}
        />
        <p className="text-xs text-ink-muted">In ở tỷ lệ 100% (không thu nhỏ theo trang) để đúng khổ {kind === 'namecards' ? '10cm x 28cm' : '9cm x 13cm'}.</p>
      </div>
      {pages.length === 0 ? (
        <p className="mx-auto max-w-4xl rounded-card bg-surface p-6 text-center text-ink-muted">
          {kind === 'namecards' ? 'Không có biển tên VIP nào để in.' : 'Không có thẻ đại biểu nào để in.'}
        </p>
      ) : (
        pages.map((page, i) => (
          <div key={page[0]!.id} className={i > 0 ? 'break-before-page' : undefined}>
            {kind === 'namecards' ? (
              <PrintPage size="A4" orientation="landscape" margins="none">
                <Tent g={page[0]!} theme={theme} />
              </PrintPage>
            ) : (
              <PrintPage size="A4" orientation="portrait" margins="none">
                <p className="pt-2 text-center text-print-xs">Mẫu thẻ đại biểu tiêu chuẩn (9cm x 13cm có vạch cắt) · Trang {i + 1}/{pages.length}</p>
                <div className="mx-auto mt-2 grid grid-cols-2 justify-center" style={{ gap: mm(SIZES.badge.gap), width: mm(SIZES.badge.width * 2 + SIZES.badge.gap) }}>
                  {page.map((g) => <Badge key={g.id} eventId={eventId} eventName={eventName} org={org} g={g} theme={theme} />)}
                </div>
              </PrintPage>
            )}
          </div>
        ))
      )}
    </div>
  );
}
