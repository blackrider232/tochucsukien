import { existsSync } from 'node:fs';
import { join } from 'node:path';
import QRCode from 'qrcode';
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HHmm, IsoDate } from '@/core/brand';
import { parseCheckinCode, parseScannedCode } from '@/core/checkin-code';
import { registry } from '@/core/registry';
import { DEFAULT_SETTINGS, orgIdentity } from '@/core/settings';
import { renderUi, withAppContext } from '@/components/ui/__tests__/helpers';
import type { RosterEntry } from '../contract';
import { GuestsPage } from '../components/guests-page';
import { PrintSheets } from '../components/print-sheets';
import type { GuestScreenData } from '../domain/screen';
import { EVENT, entry } from './roster-fixture';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => '/' }));
vi.mock('@/core/commands/dispatch', () => ({ dispatch: vi.fn() }));

const XSS = '<img src=x onerror="window.__pwned=1">';
const SCRIPT = '<script>window.__pwned=2</script>';
const org = orgIdentity({ ...DEFAULT_SETTINGS, version: 1 as never });

function data(roster: ReadonlyArray<RosterEntry>): GuestScreenData {
  return {
    event: { id: EVENT, name: `${XSS} Hội nghị`, eventDate: '2026-12-15' as IsoDate, eventTime: '08:30' as HHmm, location: XSS, department: 'Phòng Xúc tiến đầu tư', targetGuests: 10 },
    roster,
    vipSeats: [],
    canWrite: true,
    canSeeSeating: true,
    canReadDirectory: true,
    directoryContacts: null,
  };
}
const hostile = () => entry({ name: `${XSS} Đại biểu`, organization: `${SCRIPT} Công ty`, title: XSS, notes: XSS, rsvpStatus: 'substituted', substituteName: XSS, email: 'a@b.vn', phone: XSS });

function expectNoMarkup(root: HTMLElement) {
  expect(root.querySelector('img, script')).toBeNull();
  expect(root.querySelectorAll('[onerror], [onclick]')).toHaveLength(0);
  expect((window as { __pwned?: number }).__pwned).toBeUndefined();
}

/** The kit draws each dark module of QRCode.create(payload) as one path segment, with a 2-module quiet zone. */
function expectedQrPath(payload: string): string {
  const { modules } = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  let path = '';
  for (let y = 0; y < modules.size; y++) for (let x = 0; x < modules.size; x++) if (modules.get(x, y)) path += `M${x + 2} ${y + 2}h1v1h-1z`;
  return path;
}

describe('guest screens render user text as text (m4a B01-B06, B09)', () => {
  it('the guest table shows markup in name, organization, title, notes and substitute verbatim', () => {
    const g = hostile();
    const { container } = renderUi(withAppContext(<GuestsPage data={data([g])} initialPopup={null} />));
    expect(screen.getByText(`${XSS} Đại biểu`)).toBeInTheDocument();
    expect(screen.getByText(`${SCRIPT} Công ty`)).toBeInTheDocument();
    expect(screen.getByText(`Người thay: ${XSS}`)).toBeInTheDocument();
    expectNoMarkup(container);
  });

  it('the KPI pop-up list does too', async () => {
    renderUi(withAppContext(<GuestsPage data={data([hostile()])} initialPopup="all" />));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(`${XSS} Đại biểu`)).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Danh sách khách mời & đại biểu (1 đại biểu)');
    expectNoMarkup(dialog);
  });

  it('the KPI cards count from the roster with the 130% quota of the event target (decision 2)', () => {
    renderUi(withAppContext(<GuestsPage data={data([entry({ rsvpStatus: 'confirmed', hasBanquet: true }), entry({ rsvpStatus: 'declined', hasBanquet: true })])} initialPopup={null} />));
    const card = screen.getByRole('button', { name: /^Khách mời/ });
    expect(card).toHaveTextContent('2/ 13');
    expect(card).toHaveTextContent('Cần mời thêm 11 khách');
    expect(screen.getByRole('button', { name: /Tiệc & xếp chỗ/ })).toHaveTextContent('1');
  });
});

describe('print sheets (m4a B13, B35, B36, B37)', () => {
  it('prints four badges per A4 portrait sheet, each QR encoding SCE-CHK:<event>:<guest> and captioned with the DB check-in code', () => {
    const guests = Array.from({ length: 5 }, () => entry({ group: 'DoanhNghiep' }));
    const { container } = renderUi(withAppContext(<PrintSheets kind="badges" themeId="navy_sce" eventId={EVENT} eventName="Hội nghị" org={org} guests={guests} guestId={null} />));
    expect(container.querySelectorAll('[data-print-page="A4-portrait"]')).toHaveLength(2);
    for (const g of guests) {
      const badge = screen.getByRole('article', { name: `Thẻ đại biểu ${g.name}` });
      const qr = within(badge).getByRole('img', { name: `Mã QR ${g.checkinCode}` });
      const payload = `SCE-CHK:${EVENT}:${g.id}`;
      expect(qr.querySelector('path')!.getAttribute('d')).toBe(expectedQrPath(payload));
      expect(parseScannedCode(payload)).toEqual({ kind: 'canonical', eventId: EVENT, guestId: g.id });
      expect(parseScannedCode(g.checkinCode)).toEqual({ kind: 'human', code: g.checkinCode });
      expect(parseCheckinCode(within(badge).getByText(g.checkinCode).textContent!)).toBe(g.checkinCode);
    }
  });

  it('prints one A4 landscape tent per VIP with both faces, and markup stays text', () => {
    const guests = [entry({ group: 'VIP', name: XSS }), entry({ group: 'VIP' })];
    const { container } = renderUi(withAppContext(<PrintSheets kind="namecards" themeId="red_gold" eventId={EVENT} eventName="Hội nghị" org={org} guests={guests} guestId={null} />));
    expect(container.querySelectorAll('[data-print-page="A4-landscape"]')).toHaveLength(2);
    expect(screen.getAllByText(XSS)).toHaveLength(2);
    expectNoMarkup(container);
  });

  it('says so when nothing is to be printed', () => {
    renderUi(withAppContext(<PrintSheets kind="badges" themeId="navy_sce" eventId={EVENT} eventName="Hội nghị" org={org} guests={[]} guestId={null} />));
    expect(screen.getByText('Không có thẻ đại biểu nào để in.')).toBeInTheDocument();
  });

  it('the print route exists under (print) and is guarded by guests.read', () => {
    expect(existsSync(join(process.cwd(), 'src/app/(print)/events/[eventId]/guests/print/page.tsx'))).toBe(true);
    // (app) and (print) share the URL /events/<id>/guests/*, so the proxy guards both with the same permission.
    expect(registry.routeFor(`/events/${EVENT}/guests/print`)?.permission).toBe('guests.read');
    expect(registry.routeFor(`/events/${EVENT}/guests/namecards`)?.permission).toBe('guests.read');
  });
});
