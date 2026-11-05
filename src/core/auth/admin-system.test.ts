import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventId } from '@/core/brand';
import { supabaseDb } from '@/core/db';
import { testActor } from '@/core/testing/actors';
import type { Actor, RequestContext } from './index';

// The service-role wiring of a scheduled job (admin.ts, cron.ts) against a fake service client: what it sends to
// Postgres, and what it refuses before sending. The SQL side is verify-sql's.
const rpc = vi.fn();
const tables: Record<string, { data: unknown; error: unknown }> = {};
vi.mock('next/dist/compiled/server-only', () => ({}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc,
    from: (table: string) => {
      const result = (empty: unknown) => () => Promise.resolve(tables[table] ?? { data: empty, error: null });
      const chain = { select: () => chain, eq: () => chain, order: result([]), maybeSingle: result(null) };
      return chain;
    },
  }),
}));
// One job exists, so a literal 'rsvp-sync' cannot be told from the `job` argument. Let a second name through the
// permission lookup only; everything else stays the real table.
vi.mock('@/core/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/permissions')>();
  return { ...actual, systemGrant: (job: string, command: string) => (job === 'nightly' ? 'guests.write' : actual.systemGrant(job as 'rsvp-sync', command)) };
});
const { startSystemRun, systemAuditWriter, systemContext } = await import('./admin');
const { runCommandAsSystem } = await import('./cron');
const { systemActor } = await import('./system');

const EVENT = '11111111-1111-4111-8111-111111111111' as EventId;
const row = { command: 'guests.applyRsvp', perm: 'guests.write', action: 'CẬP NHẬT RSVP', summary: 'tóm tắt', eventId: EVENT, entity: 'guest', entityId: 'g1' } as const;
const ok = { data: null, error: null, status: 200 };
const db = supabaseDb({}, testActor('admin', null));

beforeEach(() => {
  rpc.mockReset().mockResolvedValue(ok);
  for (const k of Object.keys(tables)) delete tables[k];
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('SCE_DEV_MEMORY', '');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'pk');
});
afterEach(() => vi.unstubAllEnvs());

describe('systemAuditWriter (service role)', () => {
  it('sends the job’s own name and the row’s fields to sce_tcsk_audit_system', async () => {
    const actor = { ...systemActor('rsvp-sync'), system: 'nightly' } as unknown as Actor;
    await systemAuditWriter('nightly' as never, db)!(actor, row);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('sce_tcsk_audit_system', {
      job: 'nightly', command: 'guests.applyRsvp', perm: 'guests.write', action: 'CẬP NHẬT RSVP', summary: 'tóm tắt', event_id: EVENT, entity: 'guest', entity_id: 'g1',
    });
  });

  it('refuses another job’s actor, a human, an unlisted pair and a core command before it calls Postgres', async () => {
    const write = systemAuditWriter('rsvp-sync', db)!;
    const refused = { kind: 'forbidden' };
    await expect(write(testActor('admin', null), row)).rejects.toMatchObject(refused);
    await expect(write({ ...systemActor('rsvp-sync'), system: 'nightly' } as unknown as Actor, row)).rejects.toMatchObject(refused);
    await expect(write(systemActor('rsvp-sync'), { ...row, perm: 'guests.read' })).rejects.toMatchObject(refused);
    await expect(write(systemActor('rsvp-sync'), { ...row, command: 'core.settings.update', perm: 'core.settings.edit' })).rejects.toMatchObject(refused);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('translates a refusal of Postgres into a DbError', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'forbidden' }, status: 403 });
    await expect(systemAuditWriter('rsvp-sync', db)!(systemActor('rsvp-sync'), row)).rejects.toMatchObject({ kind: 'forbidden' });
  });

  it('is null without the service key', () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(systemAuditWriter('rsvp-sync', db)).toBeNull();
  });
});

describe('startSystemRun', () => {
  it('is what Postgres answers: true runs, false is a replay, anything else is not a run', async () => {
    rpc.mockResolvedValueOnce({ ...ok, data: true }).mockResolvedValueOnce({ ...ok, data: false }).mockResolvedValueOnce({ ...ok, data: null });
    expect(await startSystemRun('rsvp-sync')).toBe(true);
    expect(await startSystemRun('rsvp-sync')).toBe(false);
    expect(await startSystemRun('rsvp-sync')).toBe(false);
    expect(rpc).toHaveBeenCalledWith('sce_tcsk_start_system_run', { job: 'rsvp-sync' });
  });

  it('throws when Postgres fails, so the cron answers an error and not a run', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '57P01', message: 'down' }, status: 503 });
    await expect(startSystemRun('rsvp-sync')).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('claims in process under the dev memory runtime, and never reaches Postgres', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('SCE_DEV_MEMORY', '1');
    expect(await startSystemRun('rsvp-sync')).toBe(true);
    expect(await startSystemRun('rsvp-sync')).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('systemContext (service role)', () => {
  it('is the system actor over the service client, with default settings when the row is missing', async () => {
    const ctx = await systemContext('rsvp-sync');
    expect(ctx?.actor).toMatchObject({ system: 'rsvp-sync', profile: { email: 'system:rsvp-sync' } });
    expect(ctx?.settings.version).toBe(0);
    expect(ctx?.db).toBeDefined();
  });

  it('is null without the service key', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(await systemContext('rsvp-sync')).toBeNull();
  });

  it('throws when settings or holidays cannot be read', async () => {
    tables.sce_tcsk_holidays = { data: null, error: { code: '57P01', message: 'down' } };
    await expect(systemContext('rsvp-sync')).rejects.toThrow('settings or holidays read failed');
  });
});

describe('runCommandAsSystem', () => {
  const ctxFor = async (actor: Actor): Promise<RequestContext> => ({ ...(await systemContext('rsvp-sync'))!, actor });

  it('runs only in the context authorizeCron gave for that job', async () => {
    for (const actor of [testActor('admin', null), { ...systemActor('rsvp-sync'), system: 'nightly' } as unknown as Actor]) {
      await expect(runCommandAsSystem('rsvp-sync', await ctxFor(actor), 'guests.applyRsvp', {} as never)).rejects.toThrow('needs the context authorizeCron gave');
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it('runs the command through the pipeline once the context is the job’s', async () => {
    const result = await runCommandAsSystem('rsvp-sync', await ctxFor(systemActor('rsvp-sync')), 'guests.noSuchCommand' as never, {} as never);
    expect(result).toMatchObject({ ok: false, kind: 'unavailable' });
  });
});
