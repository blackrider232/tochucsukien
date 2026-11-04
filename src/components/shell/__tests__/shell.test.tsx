import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prefStorage, renderUi } from '@/components/ui/__tests__/helpers';
import { AppShell, EventSubTabs, type ShellSlots } from '../app-shell';
import { EventSwitcher, switchHref } from '../event-switcher';
import { IdleGuard } from '../idle-guard';
import type { ShellModel } from '../nav-model';

const nav = vi.hoisted(() => ({ path: '/events/e1/seating' }));
const clearUndo = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ usePathname: () => nav.path }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('@/core/commands', () => ({
  clearUndo,
  useUndo: () => ({ canUndo: true, canRedo: false, undoLabel: 'Sửa khách', redoLabel: null, undo: vi.fn(), redo: vi.fn() }),
}));

const MODEL: ShellModel = {
  brand: { title: 'SỰ KIỆN SCE', subtitle: 'Trung tâm XTĐT Hà Nội' },
  user: { name: 'Nguyễn Văn An', roleLabel: 'Chuyên viên', department: 'Phòng Xúc tiến đầu tư' },
  main: [
    { id: 'progress', label: 'Tiến độ', icon: 'calendar-check', accent: 'blue', href: { kind: 'static', path: '/events' }, header: { title: 'Tiến độ', subtitle: 'Theo dõi sự kiện' }, subTabs: [] },
    {
      id: 'guests', label: 'Khách mời & Chỗ ngồi', icon: 'users', accent: 'amber', href: { kind: 'event', segment: 'guests' },
      header: { title: 'Khách mời & Chỗ ngồi', subtitle: 'Danh sách và sơ đồ' },
      subTabs: [
        { id: 'list', label: 'Danh sách', href: { kind: 'event', segment: 'guests' } },
        { id: 'seating', label: 'Sơ đồ chỗ ngồi', href: { kind: 'event', segment: 'seating' } },
      ],
    },
  ],
  admin: [{ id: 'settings', label: 'Cài đặt', icon: 'settings', accent: 'slate', href: { kind: 'static', path: '/admin/settings' }, header: { title: 'Cài đặt', subtitle: '' }, subTabs: [] }],
};
const SLOTS: ShellSlots = {
  navBadges: { guests: <span>12 khách</span> },
  topBarBadges: { guests: <span>Báo cáo hôm nay</span> },
  headerActions: [<button key="new">Tạo sự kiện mới</button>],
};

function mount() {
  return renderUi(<AppShell model={MODEL} slots={SLOTS}><p>Nội dung trang</p></AppShell>);
}

describe('AppShell', () => {
  beforeEach(() => {
    nav.path = '/events/e1/seating';
    prefStorage().clear();
  });

  it('builds the sidebar from the model: sections, resolved links, current page, badges', () => {
    mount();
    const sidebar = screen.getByRole('complementary', { name: 'Thanh bên' });
    expect(within(sidebar).getByText('Danh mục chức năng')).toBeInTheDocument();
    expect(within(sidebar).getByText('Hệ thống & Quản trị')).toBeInTheDocument();
    const guests = within(sidebar).getByRole('link', { name: /Khách mời & Chỗ ngồi/ });
    expect(guests).toHaveAttribute('href', '/events/e1/guests');
    expect(guests).toHaveAttribute('aria-current', 'page');
    expect(within(sidebar).getByRole('link', { name: /Tiến độ/ })).not.toHaveAttribute('aria-current');
    expect(within(sidebar).getByText('12 khách')).toBeInTheDocument();
  });

  it('shows the header, sub-tabs, top-bar badge and header actions of the active entry', () => {
    mount();
    expect(screen.getByRole('heading', { level: 1, name: 'Khách mời & Chỗ ngồi' })).toBeInTheDocument();
    expect(screen.getByText('Báo cáo hôm nay')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tạo sự kiện mới' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('Nội dung trang');
  });

  it('on an event page puts the sub-tabs under the event header and the event name in the top bar', async () => {
    renderUi(
      <AppShell model={MODEL} slots={SLOTS}>
        <h2>Tiêu đề sự kiện</h2>
        <EventSubTabs eventName="Hội nghị XTĐT 2026" />
      </AppShell>,
    );
    const tabs = screen.getByRole('navigation', { name: 'Phân mục Khách mời & Chỗ ngồi' });
    expect(screen.getByRole('main')).toContainElement(tabs);
    expect(screen.getByText('Tiêu đề sự kiện').compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole('navigation', { name: /^Phân mục/ })).toHaveLength(1);
    expect(within(tabs).getByRole('link', { name: 'Sơ đồ chỗ ngồi' })).toHaveAttribute('aria-current', 'page');
    expect(within(tabs).getByRole('link', { name: 'Danh sách' })).toHaveAttribute('href', '/events/e1/guests');
    await waitFor(() => expect(screen.getByRole('banner')).toHaveTextContent('Hội nghị XTĐT 2026'));
  });

  it('renders exactly one main and one h1', () => {
    mount();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('sends event-scoped entries to /go/<nav> when no event is selected', () => {
    nav.path = '/events';
    mount();
    expect(screen.getByRole('link', { name: /Khách mời & Chỗ ngồi/ })).toHaveAttribute('href', '/go/guests');
  });

  it('collapses the sidebar and remembers it', async () => {
    const { user } = mount();
    await user.click(screen.getByRole('button', { name: 'Thu gọn thanh bên' }));
    expect(screen.getByRole('button', { name: 'Mở rộng thanh bên' })).toHaveAttribute('aria-expanded', 'false');
    expect(prefStorage().getItem('sce_sidebar_collapsed')).toBe('1');
    expect(screen.getByRole('link', { name: 'Tiến độ' })).toBeInTheDocument();
  });

  it('opens the phone drawer as a modal, closes on Esc and returns focus to the menu button', async () => {
    const { user } = mount();
    const opener = screen.getByRole('button', { name: 'Mở menu' });
    await user.click(opener);
    const drawer = screen.getByRole('dialog', { name: 'Menu điều hướng' });
    expect(drawer).toHaveAttribute('aria-modal', 'true');
    expect(within(drawer).getByRole('link', { name: /Cài đặt/ })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Menu điều hướng' })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('shows "Ngoại tuyến" while the browser is offline', () => {
    mount();
    expect(screen.queryByText('Ngoại tuyến')).not.toBeInTheDocument();
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(screen.getByText('Ngoại tuyến')).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('offers undo with its label and a sign-out form', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Hoàn tác: Sửa khách' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Làm lại' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Đăng xuất' }).closest('form')).toHaveAttribute('action', '/auth/signout');
  });

  it('clears the undo history when the sign-out form submits', () => {
    mount();
    const form = screen.getAllByRole('button', { name: 'Đăng xuất' })[0]!.closest('form')!;
    form.addEventListener('submit', (e) => e.preventDefault());
    fireEvent.submit(form);
    expect(clearUndo).toHaveBeenCalledOnce();
  });

  it('never imports a feature: only load-shell reads the slots record', () => {
    const dir = resolve(process.cwd(), 'src/components/shell');
    const offenders = readdirSync(dir)
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) => (f !== 'load-shell.tsx' ? /@\/features\//.test(readFileSync(join(dir, f), 'utf8')) : /from '@\/features\/(?!registry-slots')/.test(readFileSync(join(dir, f), 'utf8'))));
    expect(offenders).toEqual([]);
  });
});

describe('IdleGuard', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: false }));
  afterEach(() => vi.useRealTimers());

  it('warns at the warning time, continues on request, and signs out at the deadline', async () => {
    const onSignOut = vi.fn();
    renderUi(<IdleGuard onSignOut={onSignOut} warnAfterMs={28_000} signOutAfterMs={30_000} />);
    act(() => { vi.advanceTimersByTime(27_000); });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(2_000); });
    const dialog = screen.getByRole('alertdialog', { name: 'Phiên làm việc sắp hết hạn' });
    expect(dialog).toHaveTextContent('0:01');
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục làm việc' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(27_000); });
    expect(onSignOut).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(4_000); });
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('activity before the warning postpones it', () => {
    const onSignOut = vi.fn();
    renderUi(<IdleGuard onSignOut={onSignOut} warnAfterMs={28_000} signOutAfterMs={30_000} />);
    act(() => { vi.advanceTimersByTime(20_000); });
    act(() => { window.dispatchEvent(new Event('pointerdown')); });
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onSignOut).not.toHaveBeenCalled();
  });
});

describe('EventSwitcher', () => {
  it('lists other events as links to the same area and closes on Escape', async () => {
    nav.path = '/events/e1/seating';
    const { user } = renderUi(<EventSwitcher current="Hội nghị XTĐT 2026" events={[{ id: 'e2', name: 'Hội chợ Thu 2026', dateLabel: '20/10/2026' }]} />);
    const button = screen.getByRole('button', { name: /Đổi sự kiện.*đang xem Hội nghị XTĐT 2026/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.click(button);
    expect(screen.getByRole('link', { name: /Hội chợ Thu 2026/ })).toHaveAttribute('href', '/events/e2/seating');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('link', { name: /Hội chợ Thu 2026/ })).not.toBeInTheDocument());
    expect(button).toHaveFocus();
  });

  it('keeps only the area segment and falls back to the plan', () => {
    expect(switchHref('/events/e1/guests/g9/edit', 'e2')).toBe('/events/e2/guests');
    expect(switchHref('/events/e1', 'e2')).toBe('/events/e2/plan');
  });
});
