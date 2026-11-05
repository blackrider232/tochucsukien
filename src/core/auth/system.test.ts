import { describe, expect, it, vi } from 'vitest';
import type { Instant, Version } from '@/core/brand';
import { buildWorkCalendar } from '@/core/dates';
import { memoryDb } from '@/core/db';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { testActor } from '@/core/testing/actors';
import type { RequestContext } from './index';
import { checkCron, MIN_CRON_SECRET, memoryRunClaims, systemActor, type CronDeps } from './system';

const SECRET = 'k'.repeat(32);
const request = (authorization?: string) => new Request('https://sce.local/api/cron/rsvp-sync', { headers: authorization === undefined ? {} : { authorization } });

function deps(overrides: Partial<CronDeps> = {}) {
  let now = Date.parse('2026-11-04T01:00:00.000Z');
  const context = vi.fn(async (job: 'rsvp-sync'): Promise<RequestContext> => ({
    actor: systemActor(job),
    db: memoryDb({}, testActor('admin', null)),
    settings: { ...DEFAULT_SETTINGS, version: 1 as Version },
    calendar: buildWorkCalendar([]),
    now: new Date(now).toISOString() as Instant,
  }));
  const startRun = vi.fn(memoryRunClaims(() => now));
  return { deps: { secret: SECRET, startRun, context, ...overrides } satisfies CronDeps, startRun, context, advance: (ms: number) => (now += ms) };
}

describe('checkCron', () => {
  it('a right bearer secret gets the system context of the job', async () => {
    const d = deps();
    const r = await checkCron(request(`Bearer ${SECRET}`), 'rsvp-sync', d.deps);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ctx.actor).toMatchObject({ system: 'rsvp-sync', profile: { email: 'system:rsvp-sync' } });
  });

  it('a wrong secret is 401 and starts nothing', async () => {
    const d = deps();
    for (const header of [`Bearer ${SECRET}x`, `Bearer ${SECRET.slice(1)}`, `bearer ${SECRET}`, SECRET, 'Bearer ', '', undefined]) {
      const r = await checkCron(request(header), 'rsvp-sync', d.deps);
      expect(r.ok, String(header)).toBe(false);
      if (!r.ok) expect(r.response.status).toBe(401);
    }
    expect(d.startRun).not.toHaveBeenCalled();
    expect(d.context).not.toHaveBeenCalled();
  });

  it('a secret shorter than 32 characters, or none, is 503 even when the bearer matches it', async () => {
    expect(MIN_CRON_SECRET).toBe(32);
    for (const secret of ['k'.repeat(31), `  ${'k'.repeat(31)}  `, '', undefined]) {
      const d = deps({ secret });
      const r = await checkCron(request(`Bearer ${secret ?? ''}`), 'rsvp-sync', d.deps);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.response.status).toBe(503);
        expect(await r.response.json()).toEqual({ error: 'CRON_SECRET chưa được cấu hình (tối thiểu 32 ký tự).' });
      }
      expect(d.context).not.toHaveBeenCalled();
    }
  });

  it('a replay inside the job’s window is 429 and builds no context; the next scheduled call runs', async () => {
    const d = deps();
    expect((await checkCron(request(`Bearer ${SECRET}`), 'rsvp-sync', d.deps)).ok).toBe(true);
    d.advance(239_000);
    const replay = await checkCron(request(`Bearer ${SECRET}`), 'rsvp-sync', d.deps);
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.response.status).toBe(429);
    expect(d.context).toHaveBeenCalledTimes(1);
    d.advance(1_000);
    expect((await checkCron(request(`Bearer ${SECRET}`), 'rsvp-sync', d.deps)).ok).toBe(true);
  });

  it('a refused secret does not use up the window of the real scheduler', async () => {
    const d = deps();
    await checkCron(request('Bearer wrong'), 'rsvp-sync', d.deps);
    expect((await checkCron(request(`Bearer ${SECRET}`), 'rsvp-sync', d.deps)).ok).toBe(true);
  });

  it('no system context (no service key) is 503', async () => {
    const d = deps({ context: async () => null });
    const r = await checkCron(request(`Bearer ${SECRET}`), 'rsvp-sync', d.deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(503);
  });

  it('answers are never cached and never echo the secret', async () => {
    const d = deps();
    const r = await checkCron(request(`Bearer ${SECRET}x`), 'rsvp-sync', d.deps);
    if (r.ok) throw new Error('expected a refusal');
    expect(r.response.headers.get('cache-control')).toBe('no-store');
    expect(await r.response.text()).not.toContain(SECRET);
  });
});
