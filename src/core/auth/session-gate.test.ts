import { beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = 1_800_000_000;
const recoveryAmr = (secondsAgo: number) => [{ method: 'recovery', timestamp: NOW - secondsAgo }];
const auth = vi.hoisted(() => ({
  getClaims: vi.fn(async () => ({ data: { claims: { amr: [] as unknown } } as { claims: { amr: unknown } } | null, error: null })),
  // The cookie session, unverified: whatever the browser wrote, a forged amr included.
  getSession: vi.fn(async () => ({ data: { session: { user: { amr: [] as unknown }, access_token: 'forged' } }, error: null })),
}));
vi.mock('./request-context', () => ({ cookieClient: async () => ({ auth }), loadRequestContext: vi.fn() }));
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
const { recoveryProofAge } = await import('./session-gate');

describe('recoveryProofAge reads the verified JWT, never the cookie session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
  });

  it('a recovery sign-in in the verified claims counts, with its age', async () => {
    auth.getClaims.mockResolvedValueOnce({ data: { claims: { amr: recoveryAmr(120) } }, error: null });
    expect(await recoveryProofAge()).toBe(120);
    expect(auth.getClaims).toHaveBeenCalled();
  });

  it('a recovery claim only the cookie session carries does not count', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { amr: recoveryAmr(5) }, access_token: 'forged' } }, error: null });
    expect(await recoveryProofAge()).toBeNull();
  });

  it('no verified claims, no proof', async () => {
    auth.getClaims.mockResolvedValueOnce({ data: null, error: null });
    expect(await recoveryProofAge()).toBeNull();
  });
});
