import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The REAL authorizeCron (system.test.ts injects its own startRun and context): a fake service client records the
// calls that would reach Postgres.
const rpc = vi.fn(async () => ({ data: true, error: null, status: 200 }));
const select = vi.fn();
vi.mock('next/dist/compiled/server-only', () => ({}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc,
    from: () => ({ select: (...args: unknown[]) => (select(...args), { eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }), order: async () => ({ data: [], error: null }) }) }),
  }),
}));
const { authorizeCron } = await import('./cron');

const SECRET = 'k'.repeat(32);
const request = () => new Request('https://sce.local/api/cron/rsvp-sync', { headers: { authorization: `Bearer ${SECRET}` } });

beforeEach(() => {
  rpc.mockClear();
  select.mockClear();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('SCE_DEV_MEMORY', '');
  vi.stubEnv('CRON_SECRET', SECRET);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'pk');
});
afterEach(() => vi.unstubAllEnvs());

describe('authorizeCron (production wiring)', () => {
  it('a right secret without SUPABASE_SERVICE_ROLE_KEY is 503, not a thrown 500, and claims no window', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const r = await authorizeCron(request(), 'rsvp-sync');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(503);
      expect(await r.response.json()).toEqual({ error: 'Chưa cấu hình khóa dịch vụ để chạy tác vụ hệ thống.' });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it('with the key set it loads the context, then claims the window in Postgres', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    const r = await authorizeCron(request(), 'rsvp-sync');
    expect(r.ok).toBe(true);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('sce_tcsk_start_system_run', { job: 'rsvp-sync' });
  });

  it('a context that cannot be read leaves the window free for the scheduler’s next call', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    select.mockImplementationOnce(() => {
      throw new Error('db down');
    });
    await expect(authorizeCron(request(), 'rsvp-sync')).rejects.toThrow('db down');
    expect(rpc).not.toHaveBeenCalled();
  });
});
