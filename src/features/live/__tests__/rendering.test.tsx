import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DutyStaffId, Email, EventId, GuestId, HHmm, IncidentId, Instant, IsoDate, SeatCode, Version } from '@/core/brand';
import type { CheckinCode } from '@/core/checkin-code';
import { renderUi, withAppContext } from '@/components/ui/__tests__/helpers';
import type { RosterEntry } from '@/features/guests';
import type { DutyStaff, Incident } from '../contract';
import { CarPassPrint } from '../components/car-pass-print';
import { LiveScreen } from '../components/live-screen';
import type { LiveScreenData, LiveTab } from '../domain/screen';
import { ZONES } from './harness';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => '/' }));
const dispatch = vi.fn();
vi.mock('@/core/commands/dispatch', () => ({ dispatch: (...a: unknown[]) => dispatch(...a) }));

const XSS = '<img src=x onerror="window.__pwned=1">';
const SCRIPT = '<script>window.__pwned=2</script>';
const EVENT = 'e0000000-0000-4000-8000-000000000001' as EventId;
const AT = '2026-12-15T01:00:00.000Z' as Instant;
let n = 0;
const guest = (over: Partial<RosterEntry> = {}): RosterEntry => ({
  id: `a0000000-0000-4000-8000-${String(++n).padStart(12, '0')}` as GuestId, eventId: EVENT, name: `Đại biểu ${n}`, group: 'DoanhNghiep', title: '', organization: 'Cơ quan',
  phone: '', email: null as Email | null, sendMethod: 'direct', inviteStatus: 'sent', rsvpStatus: 'confirmed', rsvpSource: 'manual', rsvpAt: null, substituteName: '',
  hasBanquet: false, notes: '', checkinCode: 'K7Q2ZX' as CheckinCode, masterContactId: null, version: 1 as Version, createdAt: AT, createdBy: null, updatedAt: AT,
  seatCode: null, checkedInAt: null, giftGivenAt: null, ...over,
});
const hostileGuest = guest({ name: `${XSS} Đại biểu`, organization: `${SCRIPT} Công ty`, title: XSS, phone: XSS, rsvpStatus: 'substituted', substituteName: XSS, group: 'VIP', seatCode: 'C-01' as SeatCode, checkedInAt: AT });
const staff: DutyStaff = { id: 'd0000000-0000-4000-8000-000000000001' as DutyStaffId, eventId: EVENT, name: `${XSS} Cán bộ`, userId: null, department: 'Phòng Xúc tiến đầu tư', desk: 2, roleLabel: SCRIPT, checkedInAt: null, version: 1 as Version };
const incident: Incident = {
  id: 'c0000000-0000-4000-8000-000000000001' as IncidentId, eventId: EVENT, seq: 3, location: XSS, description: `${SCRIPT} Mất điện`, urgency: 'high', assignee: XSS,
  status: 'resolved', reportedAt: AT, resolvedAt: AT, resolutionNote: XSS, version: 1 as Version,
};

function data(roster: ReadonlyArray<RosterEntry>, over: Partial<LiveScreenData> = {}): LiveScreenData {
  return {
    event: { id: EVENT, name: `${XSS} Hội nghị`, eventDate: '2026-12-15' as IsoDate, eventTime: '08:30' as HHmm, location: XSS, targetGuests: 10 },
    roster,
    hall: { eventId: EVENT, templateId: null, zones: ZONES, version: 1 as Version },
    seats: roster.flatMap((g) => (g.seatCode ? [{ eventId: EVENT, seatCode: g.seatCode, guestId: g.id }] : [])),
    staff: [staff],
    incidents: [incident],
    requiredAt: '2026-12-14T23:30:00.000Z' as Instant,
    now: AT,
    can: { checkIn: true, manage: true, walkIn: true },
    ...over,
  };
}
const show = (d: LiveScreenData, tab: LiveTab) => renderUi(withAppContext(<LiveScreen data={d} tab={tab} />));

function expectNoMarkup(root: HTMLElement) {
  expect(root.querySelector('img, script')).toBeNull();
  expect(root.querySelectorAll('[onerror], [onclick]')).toHaveLength(0);
  expect((window as { __pwned?: number }).__pwned).toBeUndefined();
}

describe('live screens render guest, staff and incident text as text (m5 BUG-12, BUG-13, BUG-14)', () => {
  it.each(['checkin', 'duty', 'incidents', 'monitor'] as const)('%s', (tab) => {
    const { container } = show(data([hostileGuest]), tab);
    expectNoMarkup(container);
    expectNoMarkup(document.body);
    const expected = { checkin: `${XSS} Đại biểu`, duty: `${XSS} Cán bộ`, incidents: `${SCRIPT} Mất điện`, monitor: `${XSS} Đại biểu` }[tab];
    expect(screen.getAllByText(expected, { exact: false }).length).toBeGreaterThan(0);
  });

  it('the car pass prints names, titles and the event as text', () => {
    const { container } = renderUi(withAppContext(<CarPassPrint data={data([hostileGuest])} />));
    expectNoMarkup(container);
    expect(screen.getByText(`${XSS} Đại biểu`)).toBeInTheDocument();
  });
});

describe('seat monitor', () => {
  it('draws every seat of every hall zone, read-only, and says each state in words (m5 BUG-09, BUG-19, BUG-37)', () => {
    const waiting = guest({ name: 'Người chờ', seatCode: 'B-02' as SeatCode });
    show(data([hostileGuest, waiting]), 'monitor');
    for (const z of ZONES) expect(screen.getByRole('heading', { name: z.name })).toBeInTheDocument();
    const tiles = document.querySelectorAll('section[aria-labelledby^="live-zone-"] li');
    expect(tiles).toHaveLength(ZONES.reduce((s, z) => s + z.seatCount, 0));
    for (const t of tiles) expect(t.querySelector('button, a')).toBeNull();
    const b2 = [...tiles].find((t) => t.textContent?.startsWith('B-02'))!;
    expect(within(b2 as HTMLElement).getByText('Chờ')).toBeInTheDocument();
    expect(screen.queryByText(/phòng VIP/i)).toBeNull();
  });
});

describe('scan dialog words what the check-in did (review MED-1)', () => {
  async function scanIn(g: RosterEntry, checkIn: unknown) {
    dispatch.mockReset();
    dispatch.mockImplementation(async (id: string) => (id === 'live.scan' ? { ok: true, value: { kind: 'ok', guest: g } } : checkIn));
    const { user } = show(data([g]), 'checkin');
    await user.click(screen.getByRole('button', { name: 'Quét mã QR check-in' }));
    const dialog = await screen.findByRole('dialog', { name: /Quét mã QR check-in/ });
    await user.type(within(dialog).getByLabelText(/Hoặc nhập/), 'K7Q2ZX');
    await user.click(within(dialog).getByRole('button', { name: 'Check-in' }));
    return { user, dialog, status: () => dialog.querySelector<HTMLElement>('[aria-live="polite"]')! };
  }

  it('a declined guest the staff chose not to check in is not reported as done', async () => {
    const declined = guest({ name: 'Người báo vắng', rsvpStatus: 'declined' });
    const { user, status } = await scanIn(declined, undefined);
    await user.click(await screen.findByRole('button', { name: 'Không check-in' }));
    expect(await within(status()).findByText('Không check-in: Người báo vắng (đại biểu đã báo vắng)')).toBeInTheDocument();
    expect(status().textContent).not.toMatch(/Đã xử lý|Đã check-in/);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('a check-in the server did not record is reported as an error', async () => {
    const g = guest({ name: 'Khách lỗi mạng' });
    const { status } = await scanIn(g, { ok: false, kind: 'unavailable', message: 'Mất kết nối máy chủ.' });
    expect(await within(status()).findByText('Chưa check-in được: Khách lỗi mạng. Xem thông báo lỗi rồi thử lại.')).toBeInTheDocument();
    expect(status().textContent).not.toMatch(/Đã xử lý/);
  });

  it('a recorded check-in says so', async () => {
    const g = guest({ name: 'Khách đúng giờ' });
    const { status } = await scanIn(g, { ok: true, value: { already: false, checkIn: { checkedInAt: AT } } });
    expect(await within(status()).findByText('Đã check-in: Khách đúng giờ')).toBeInTheDocument();
  });
});

describe('check-in desk', () => {
  it('asks the decision-7 question before checking in a declined guest, and sends nothing when refused', async () => {
    dispatch.mockReset();
    const declined = guest({ name: 'Người báo vắng', rsvpStatus: 'declined' });
    const { user } = show(data([declined]), 'checkin');
    await user.click(screen.getByRole('button', { name: 'Check-in' }));
    expect(await screen.findByText('Đại biểu đã từ chối. Vẫn check-in?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Không check-in' }));
    expect(dispatch).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Check-in' }));
    dispatch.mockResolvedValueOnce({ ok: true, value: { already: false, checkIn: { checkedInAt: AT } } });
    await user.click(await screen.findByRole('button', { name: 'Vẫn check-in' }));
    expect(dispatch).toHaveBeenCalledWith('live.checkInDeclined', { eventId: EVENT, guestId: declined.id, desk: null });
  });

  it('a checked-in guest shows the time and offers no second check-in button', () => {
    show(data([hostileGuest]), 'checkin');
    expect(screen.queryByRole('button', { name: 'Check-in' })).toBeNull();
    expect(screen.getAllByText(/Đã đến/).length).toBeGreaterThan(0);
  });

  it('hides every write for an actor without the live permissions', () => {
    show(data([guest()], { can: { checkIn: false, manage: false, walkIn: false } }), 'checkin');
    for (const name of ['Check-in', 'Quét mã QR check-in', 'Khách phát sinh', 'Báo sự cố']) expect(screen.queryByRole('button', { name })).toBeNull();
  });
});
