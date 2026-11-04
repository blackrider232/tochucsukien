import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateUser = vi.hoisted(() => vi.fn(async (_attrs: unknown) => ({ data: {}, error: null as unknown })));
const getUser = vi.hoisted(() => vi.fn(async () => ({ data: { user: { email: 'nguoi.dung@sce.vn' } as { email?: string } | null }, error: null as unknown })));
const probe = vi.hoisted(() => ({
  signInWithPassword: vi.fn(async (_c: unknown) => ({ data: {}, error: null as unknown })),
  signOut: vi.fn(async (_o: unknown) => ({ error: null })),
}));
const createClient = vi.hoisted(() => vi.fn((_url: string, _key: string, _opts: unknown) => ({ auth: probe })));
vi.mock('@supabase/ssr', () => ({ createBrowserClient: () => ({ auth: { updateUser, getUser } }) }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
const { changePassword } = await import('./flows');

const WRONG = { ok: false, message: 'Mật khẩu hiện tại không đúng.' };

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

  it('reports a wrong current password from GoTrue in Vietnamese too', async () => {
    updateUser.mockResolvedValueOnce({ data: {}, error: { code: 'invalid_credentials', status: 400, name: 'AuthApiError' } });
    expect(await changePassword('cu-123456', 'moi-123456')).toEqual(WRONG);
  });
});
