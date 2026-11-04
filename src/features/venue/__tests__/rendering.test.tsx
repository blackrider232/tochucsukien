import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BoothId, BoothShiftId, EventId, GuestId, HallTemplateId, IsoDate, SeatCode, Version } from '@/core/brand';
import { renderUi, withAppContext } from '@/components/ui/__tests__/helpers';
import type { Booth, EventHall, HallTemplate } from '../contract';
import { AdminHalls } from '../components/admin-halls';
import { BoothsView } from '../components/booths-view';
import type { BoothsScreenData, SeatGuestView, SeatingScreenData } from '../components/screen-types';
import { SeatingView } from '../components/seating-view';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => '/' }));
const dispatch = vi.fn(async () => ({ ok: true, value: [] }));
vi.mock('@/core/commands/dispatch', () => ({ dispatch: (...a: unknown[]) => dispatch(...(a as [])) }));

const XSS = '<img src=x onerror="window.__pwned=1">';
const E = 'e0000000-0000-4000-8000-000000000001' as EventId;
const T = 'a0000000-0000-4000-8000-000000000001' as HallTemplateId;
const v1 = 1 as Version;
const g = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}` as GuestId;
const zones: EventHall['zones'] = [
  { key: 'A', name: `${XSS} Khu A`, prefix: 'A-', seatCount: 3, color: 'red', assignedGroup: 'VIP', vipZone: true },
  { key: 'B', name: 'Khu B', prefix: 'B-', seatCount: 4, color: 'blue', assignedGroup: 'all', vipZone: false },
];
const template: HallTemplate = { id: T, name: `${XSS} Hội trường`, location: XSS, description: XSS, zones, version: v1 };
const guests: SeatGuestView[] = [
  { id: g(1), name: `${XSS} Nguyễn Văn A`, title: '', organization: "x');alert(1);//", group: 'VIP', rsvpStatus: 'confirmed' },
  { id: g(2), name: 'Trần Thị B', title: '', organization: 'Sở X', group: 'SoNganh', rsvpStatus: 'confirmed' },
  { id: g(3), name: 'Lê Văn Vắng', title: '', organization: '', group: 'BaoChi', rsvpStatus: 'declined' },
];

function seating(over: Partial<SeatingScreenData> = {}): SeatingScreenData {
  return {
    event: { id: E, name: 'Hội nghị', eventDate: '2026-12-15' as IsoDate },
    hall: { eventId: E, templateId: T, zones, version: v1 },
    templates: [template],
    seats: [{ eventId: E, seatCode: 'A-01' as SeatCode, guestId: g(1) }, { eventId: E, seatCode: 'Z-07' as SeatCode, guestId: g(2) }],
    guests: { ready: true, value: guests },
    canWrite: true,
    canAdminHalls: false,
    today: '2026-11-04' as IsoDate,
    ...over,
  };
}

const assertInert = (root: HTMLElement) => {
  expect(root.querySelector('img, script')).toBeNull();
  expect(root.querySelectorAll('[onerror], [onclick]')).toHaveLength(0);
  expect((window as { __pwned?: number }).__pwned).toBeUndefined();
};

describe('seating chart', () => {
  it('renders hall, zone and guest names as text, never markup (m4b BUG-07, BUG-08)', () => {
    const { container } = renderUi(withAppContext(<SeatingView data={seating()} />));
    expect(screen.getByRole('button', { name: `Ghế A-01: ${XSS} Nguyễn Văn A (x');alert(1);//). Bấm để thay đổi` })).toBeInTheDocument();
    expect(screen.getAllByText(`${XSS} Khu A`).length).toBeGreaterThan(0);
    assertInert(container);
  });

  it('counts only seats the hall has, and offers to release the orphan (m4b §3.1, BUG-05)', () => {
    renderUi(withAppContext(<SeatingView data={seating()} />));
    expect(screen.getByText('1/7 ghế đã xếp')).toBeInTheDocument();
    expect(screen.getByText('1 chỗ đã xếp không còn trong sơ đồ hội trường')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Giải phóng các ghế này' })).toBeInTheDocument();
  });

  it('opens the seat dialog from a seat button and never offers a declined guest (m4b BUG-30, BUG-33)', async () => {
    const { user } = renderUi(withAppContext(<SeatingView data={seating({ seats: [] })} />));
    await user.click(screen.getByRole('button', { name: 'Ghế trống B-02. Bấm để xếp đại biểu' }));
    const dialog = await screen.findByRole('dialog', { name: 'Xếp chỗ ngồi ghế B-02' });
    await user.click(within(dialog).getByRole('combobox', { name: /Chọn đại biểu từ danh sách/ }));
    await user.keyboard('{ArrowDown}');
    const options = await within(dialog).findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([expect.stringContaining('Nguyễn Văn A'), expect.stringContaining('Trần Thị B')]);
    expect(within(dialog).getByRole('button', { name: 'Xác nhận' })).toBeDisabled();
  });

  it('says the guest list is not ready instead of showing an empty or seated-by-nobody chart', () => {
    renderUi(withAppContext(<SeatingView data={seating({ guests: { ready: false } })} />));
    expect(screen.getByText('Danh sách khách mời chưa sẵn sàng')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ghế A-01: đã xếp' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Tự động xếp chỗ' })).toBeDisabled();
    expect(screen.queryByRole('heading', { name: 'Tìm đại biểu' })).toBeNull();
  });

  it('names a hall whose template was deleted instead of borrowing another hall (m4b BUG-11, BUG-12)', () => {
    renderUi(withAppContext(<SeatingView data={seating({ hall: { eventId: E, templateId: null, zones, version: v1 } })} />));
    expect(screen.getByText(/Hội trường riêng của sự kiện \(mẫu gốc không còn trong danh mục\) • Chưa cập nhật địa điểm • Tổng 7 ghế \(2 khu\)/)).toBeInTheDocument();
  });

  it('a reader without write sees no assign controls', () => {
    renderUi(withAppContext(<SeatingView data={seating({ canWrite: false })} />));
    expect(screen.queryByRole('button', { name: 'Tự động xếp chỗ' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ghế trống A-02' })).toBeDisabled();
  });
});

describe('booths', () => {
  const booth = (code: string, over: Partial<Booth> = {}): Booth => ({
    id: `b0000000-0000-4000-8000-0000000000${code.slice(-2)}` as BoothId, eventId: E, code, size: '01 gian tiêu chuẩn (9m²)', company: `${XSS} Công ty`,
    products: XSS, subsidyPercent: 50, status: 'confirmed', contact: XSS, staff: XSS, version: v1, ...over,
  });
  const data = (over: Partial<BoothsScreenData> = {}): BoothsScreenData => ({
    event: { id: E, name: 'Hội chợ', eventDate: '2026-12-15' as IsoDate },
    booths: [booth('B02'), booth('A10', { status: 'available', company: '' }), booth('A02', { status: 'reviewing' })],
    shifts: [{ id: 'c0000000-0000-4000-8000-000000000001' as BoothShiftId, eventId: E, shiftDate: '2026-11-04' as IsoDate, shiftLabel: XSS, officerName: XSS, officerUserId: null, department: 'Phòng Phát triển doanh nghiệp', phone: '', zone: '', version: v1 }],
    canWrite: true,
    today: '2026-11-04' as IsoDate,
    ...over,
  });

  it('renders company and booth names as text on every sub-tab (m4b BUG-07)', () => {
    for (const tab of ['floorplan', 'list', 'schedule'] as const) {
      const { container, unmount } = renderUi(withAppContext(<BoothsView data={data()} tab={tab} />));
      assertInert(container);
      unmount();
    }
  });

  it('lays the floorplan out by row in code order, with a visible status word (m4b BUG-30, BUG-36)', () => {
    renderUi(withAppContext(<BoothsView data={data()} tab="floorplan" />));
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Dãy A', 'Dãy B']);
    const rowA = screen.getByRole('heading', { name: 'Dãy A' }).closest('section')!;
    expect(within(rowA).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      `Gian A02: ${XSS} Công ty, Đang thẩm định. Bấm để chỉnh sửa`,
      'Gian A10: chưa có doanh nghiệp, Gian còn trống. Bấm để chỉnh sửa',
    ]);
  });

  it('shows the real KPIs: 1 of 3 filled, nothing invented (m4b BUG-18)', () => {
    renderUi(withAppContext(<BoothsView data={data({ shifts: [] })} tab="floorplan" />));
    expect(screen.getByText('Còn trống: 1 gian • Đang thẩm định: 1')).toBeInTheDocument();
    expect(screen.getByText('Cán bộ theo 0 ca trực')).toBeInTheDocument();
  });

  it('searches the list without diacritics and says when nothing matches (m4b BUG-26)', async () => {
    const { user } = renderUi(withAppContext(<BoothsView data={data({ booths: [booth('A01', { company: 'Gốm Bát Tràng' }), booth('A02', { company: 'Lụa Vạn Phúc' })] })} tab="list" />));
    await user.type(screen.getByRole('searchbox'), 'bat trang');
    expect(screen.getByText('Gốm Bát Tràng')).toBeInTheDocument();
    expect(screen.queryByText('Lụa Vạn Phúc')).toBeNull();
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'khong co');
    expect(screen.getByText('Chưa có gian hàng nào phù hợp với điều kiện tìm kiếm.')).toBeInTheDocument();
  });
});

describe('admin halls', () => {
  it('renders template text as text and computes the KPIs (m4b BUG-14, BUG-15)', () => {
    const { container } = renderUi(withAppContext(<AdminHalls templates={[template]} usage={{ [T]: 2 }} />));
    assertInert(container);
    expect(screen.getAllByText('7 ghế')).toHaveLength(2);
    expect(screen.getByText('2 phân khu')).toBeInTheDocument();
    expect(screen.getByText('2 sự kiện đang dùng')).toBeInTheDocument();
  });
});
