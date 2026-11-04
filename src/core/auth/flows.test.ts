import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateUser = vi.hoisted(() => vi.fn(async (_attrs: unknown) => ({ data: {}, error: null as unknown })));
type TestUser = { email?: string; app_metadata?: { providers?: string[] }; identities?: Array<{ provider: string }> };
const getUser = vi.hoisted(() => vi.fn(async () => ({ data: { user: { email: 'nguoi.dung@sce.vn' } as TestUser | null }, error: null as unknown })));
const probe = vi.hoisted(() => ({
  signInWithPassword: vi.fn(async (_c: unknown) => ({ data: {}, error: null as unknown })),
  signOut: vi.fn(async (_o: unknown) => ({ error: null as unknown })),
}));
const createClient = vi.hoisted(() => vi.fn((_url: string, _key: string, _opts: unknown) => ({ auth: probe })));
vi.mock('@supabase/ssr', () => ({ createBrowserClient: () => ({ auth: { updateUser, getUser } }) }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
const { changePassword } = await import('./flows');

const WRONG = { ok: false, message: 'Mật khẩu hiện tại không đúng.' };
const GOOGLE_ONLY = 'Tài khoản này đăng nhập bằng Google và chưa có mật khẩu. Để đặt mật khẩu lần đầu, đăng xuất rồi chọn "Quên mật khẩu" ở trang đăng nhập và mở liên kết gửi về email.';

describe('password change (core B37)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('checks the current password on a client that keeps no session, then sends both to GoTrue', async () => {
    expect(await changePassword('cu-123456', 'moi-123456')).toEqual({ ok: true, value: null });
    expect(createClient).toHaveBeenCalledWith('https://example.supabase.co', 'sb_publishable_test', {
      auth: expect.objectContaining({ persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }),
    });
    expect(probe.signInWithPassword).toHaveBeenCalledWith({ email: 'nguoi.dung@sce.vn', password: 'cu-123456' });
    expect(probe.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(updateUser).toHaveBeenCalledWith({ password: 'moi-123456', current_password: 'cu-123456' });
  });

  it('a wrong current password changes nothing and says so in Vietnamese', async () => {
    probe.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { code: 'invalid_credentials', status: 400, name: 'AuthApiError' } });
    expect(await changePassword('sai', 'moi-123456')).toEqual(WRONG);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it.each(['email_not_confirmed', 'user_banned', 'user_not_found', undefined])('a check that fails with %s reveals nothing about the account', async (code) => {
    probe.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { code, status: 400, name: 'AuthApiError' } });
    expect(await changePassword('sai', 'moi-123456')).toEqual(WRONG);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('a rate-limited check says so and changes nothing', async () => {
    probe.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { code: 'over_request_rate_limit', status: 429, name: 'AuthApiError' } });
    expect(await changePassword('cu-123456', 'moi-123456')).toEqual({ ok: false, message: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.' });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('without a session nothing is checked or changed', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: { code: 'session_not_found', status: 401, name: 'AuthApiError' } });
    expect(await changePassword('cu-123456', 'moi-123456')).toEqual({ ok: false, message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
    expect(probe.signInWithPassword).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('a check session that does not close is retried once, then logged without the password, and the change goes on', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    probe.signOut.mockResolvedValue({ error: { code: 'unexpected_failure', status: 500, name: 'AuthApiError' } });
    expect(await changePassword('cu-123456', 'moi-123456')).toEqual({ ok: true, value: null });
    expect(probe.signOut).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(spy.mock.calls)).toContain('unexpected_failure');
    expect(JSON.stringify(spy.mock.calls)).not.toContain('cu-123456');
    probe.signOut.mockReset();
    probe.signOut.mockResolvedValue({ error: null });
    spy.mockRestore();
  });

  it.each([
    ['identities', { email: 'g@sce.vn', identities: [{ provider: 'google' }] }],
    ['app_metadata', { email: 'g@sce.vn', app_metadata: { providers: ['google'] } }],
  ])('an account that signs in only with Google (%s) is sent to the recovery link to set a first password', async (_from, user) => {
    getUser.mockResolvedValueOnce({ data: { user }, error: null });
    expect(await changePassword('bat-ky', 'moi-123456')).toEqual({ ok: false, message: GOOGLE_ONLY });
    expect(probe.signInWithPassword).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('an account with both Google and a password is checked as usual', async () => {
    getUser.mockResolvedValueOnce({ data: { user: { email: 'g@sce.vn', identities: [{ provider: 'google' }, { provider: 'email' }] } }, error: null });
    expect(await changePassword('cu-123456', 'moi-123456')).toEqual({ ok: true, value: null });
    expect(probe.signInWithPassword).toHaveBeenCalled();
  });

  it('reports a wrong current password from GoTrue in Vietnamese too', async () => {
    updateUser.mockResolvedValueOnce({ data: {}, error: { code: 'invalid_credentials', status: 400, name: 'AuthApiError' } });
    expect(await changePassword('cu-123456', 'moi-123456')).toEqual(WRONG);
  });
});
