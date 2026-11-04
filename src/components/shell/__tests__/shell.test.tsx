import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prefStorage, renderUi } from '@/components/ui/__tests__/helpers';
import { AppShell, type ShellSlots } from '../app-shell';
import { EventSwitcher } from '../event-switcher';
import { IdleGuard } from '../idle-guard';
import type { ShellModel } from '../nav-model';

const nav = vi.hoisted(() => ({ path: '/events/e1/seating' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.path }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('@/core/commands', () => ({
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
    expect(screen.getByRole('link', { name: 'Sơ đồ chỗ ngồi' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Danh sách' })).toHaveAttribute('href', '/events/e1/guests');
    expect(screen.getByText('Báo cáo hôm nay')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tạo sự kiện mới' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('Nội dung trang');
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
  it('lists other events as links and closes on Escape', async () => {
    const { user } = renderUi(<EventSwitcher current="Hội nghị XTĐT 2026" events={[{ id: 'e2', name: 'Hội chợ Thu 2026', dateLabel: '20/10/2026', href: '/events/e2/plan' }]} />);
    const button = screen.getByRole('button', { name: /Hội nghị XTĐT 2026/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.click(button);
    expect(screen.getByRole('link', { name: /Hội chợ Thu 2026/ })).toHaveAttribute('href', '/events/e2/plan');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('link', { name: /Hội chợ Thu 2026/ })).not.toBeInTheDocument());
    expect(button).toHaveFocus();
  });
});
