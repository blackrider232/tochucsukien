import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderUi, withAppContext } from '@/components/ui/__tests__/helpers';
import type { Profile } from '@/core/auth';
import type { EventId, Instant } from '@/core/brand';
import { testActor, XTDT } from '@/core/testing/actors';
import { RegisterForm } from '../components/auth-forms';
import { AuditScreen } from '../components/audit-screen';
import { TotpEnroll } from '../components/totp';
import { UsersScreen } from '../components/users-screen';
import { HolidaysEditor } from '../components/settings-screen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/core/commands/dispatch', () => ({ dispatch: vi.fn() }));

const XSS = '<img src=x onerror="window.__pwned=1">';
const E = 'e0000000-0000-4000-8000-000000000001' as EventId;

describe('register form (core B2)', () => {
  it('sends name, department, email and password, and never a role', async () => {
    const onSignUp = vi.fn(async () => ({ ok: true as const, value: 'confirm_email' as const }));
    const { user } = renderUi(<RegisterForm onSignUp={onSignUp} />);
    await user.type(screen.getByLabelText(/Họ và tên/), '  Nguyễn   Văn A ');
    await user.selectOptions(screen.getByLabelText(/Phòng chuyên môn/), 'Phòng Phát triển doanh nghiệp');
    await user.type(screen.getByLabelText(/Email đăng nhập/), 'A@SCE.vn');
    await user.type(screen.getByLabelText(/^Mật khẩu/), 'matkhau123');
    await user.click(screen.getByRole('button', { name: 'Đăng ký' }));
    expect(onSignUp).toHaveBeenCalledTimes(1);
    expect(onSignUp.mock.calls[0]).toEqual([{ email: 'a@sce.vn', password: 'matkhau123', fullname: 'Nguyễn Văn A', department: 'Phòng Phát triển doanh nghiệp' }]);
    expect(await screen.findByText(/Đã gửi thư xác nhận/)).toBeInTheDocument();
  });

  it('offers only the self-registerable departments', () => {
    renderUi(<RegisterForm onSignUp={vi.fn()} />);
    const options = within(screen.getByLabelText(/Phòng chuyên môn/)).getAllByRole('option').map((o) => o.textContent);
    expect(options).toHaveLength(4);
    expect(options).not.toContain('Ban Giám đốc');
  });
});

describe('the sign-up request on the wire', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('@supabase/ssr');
    vi.resetModules();
  });

  it('carries fullname and department in metadata, no role, and a callback redirect', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'pk');
    vi.stubEnv('SCE_DEV_MEMORY', '');
    const signUp = vi.fn(async () => ({ data: { session: null }, error: null }));
    vi.doMock('@supabase/ssr', () => ({ createBrowserClient: () => ({ auth: { signUp } }) }));
    vi.resetModules();
    const flows = await import('@/core/auth/flows');
    const r = await flows.signUp({ email: 'a@sce.vn', password: 'matkhau123', fullname: 'A', department: XTDT });
    expect(r).toEqual({ ok: true, value: 'confirm_email' });
    expect(signUp).toHaveBeenCalledWith({
      email: 'a@sce.vn',
      password: 'matkhau123',
      options: { data: { fullname: 'A', department: XTDT }, emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Fpending` },
    });
  });
});

describe('admin screens render user text as text (core B29)', () => {
  const evil: Profile = { ...testActor('user', XTDT).profile, fullname: `${XSS} Cán bộ`, status: 'pending' };
  const admin = testActor('admin', null).profile;

  it('users list', () => {
    renderUi(withAppContext(<UsersScreen profiles={[admin, evil]} canManage selfId={admin.id} scopedTo={null} />));
    expect(document.querySelector('img[src=x], script')).toBeNull();
    expect(screen.getByText(`${XSS} Cán bộ`)).toBeInTheDocument();
    expect(screen.getByText('Quản trị viên cuối cùng')).toBeInTheDocument();
    expect(screen.getByText('1 tài khoản chờ phê duyệt')).toBeInTheDocument();
  });

  it('hides every action from a reader without core.users.manage (core B38)', () => {
    renderUi(withAppContext(<UsersScreen profiles={[admin, evil]} canManage={false} selfId={admin.id} scopedTo={XTDT} />));
    expect(screen.queryByRole('button', { name: /Thao tác với/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Phê duyệt/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thêm tài khoản' })).toBeNull();
  });

  it('audit log', () => {
    renderUi(withAppContext(
      <AuditScreen
        rows={[{ id: 3, at: '2026-11-04T02:00:00.000Z' as Instant, actorEmail: 'a@sce.vn', action: `${XSS}`, summary: `Tên hiển thị: "x" → "${XSS}"`, eventId: E, entity: 'profile', entityId: '1' }]}
        filter={{}} before={null} nextBefore={2} facets={{ actions: [XSS], entities: ['profile'] }} events={[{ id: E, name: `${XSS} Sự kiện` }]}
      />,
    ));
    expect(document.querySelector('img[src=x], script')).toBeNull();
    expect(screen.getByText(`Tên hiển thị: "x" → "${XSS}"`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cũ hơn' })).toHaveAttribute('href', '/admin/audit?before=2');
  });
});

describe('TOTP enrolment', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('says the auth server is missing instead of failing when Supabase is not configured', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    renderUi(withAppContext(<TotpEnroll onEnrolled={vi.fn()} />));
    expect(screen.getByText(/Chưa kết nối máy chủ xác thực/)).toBeInTheDocument();
  });
});

describe('holidays editor', () => {
  it('warns an editor that a change moves the deadlines and countdowns of existing events', () => {
    renderUi(withAppContext(<HolidaysEditor year={2027} years={[2027]} canEdit />));
    expect(screen.getByText(/hạn chót và số ngày đếm ngược của các sự kiện đã có/)).toBeInTheDocument();
  });
});
