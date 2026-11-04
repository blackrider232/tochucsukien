import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateUser = vi.hoisted(() => vi.fn(async () => ({ data: {}, error: null as unknown })));
vi.mock('@supabase/ssr', () => ({ createBrowserClient: () => ({ auth: { updateUser } }) }));
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
const { changePassword } = await import('./flows');

describe('password change on the wire (core B37)', () => {
  beforeEach(() => updateUser.mockClear());

  it('sends the current password with the new one, so GoTrue can refuse a change without it', async () => {
    expect(await changePassword('cu-123456', 'moi-123456')).toEqual({ ok: true, value: null });
    expect(updateUser).toHaveBeenCalledWith({ password: 'moi-123456', current_password: 'cu-123456' });
  });

  it('reports a wrong current password in Vietnamese', async () => {
    updateUser.mockResolvedValueOnce({ data: {}, error: { code: 'invalid_credentials', status: 400, name: 'AuthApiError' } });
    expect(await changePassword('sai', 'moi-123456')).toEqual({ ok: false, message: 'Mật khẩu hiện tại không đúng.' });
  });
});
