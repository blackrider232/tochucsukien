// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { EventId, Instant, UserId, Version } from '@/core/brand';
import { DbError, defineTable, type BaseRow } from '@/core/db';
import type { FeatureKey } from '@/core/registry';
import { eventsTable } from '@/core/testing/tables';
import type { DevSeed } from './runtime';

const seeds = vi.hoisted(() => ({ calls: [] as string[], extra: {} as Record<string, DevSeed> }));
const cookieJar = vi.hoisted(() => new Map<string, string>());

vi.mock('next/dist/compiled/server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined), delete: (name: string) => cookieJar.delete(name) }),
}));

// Listed in reverse registry order on purpose: the runtime must still run core, progress, ..., reports.
vi.mock('@/features/registry-server', () => {
  const record = (key: string) => ({
    commands: {},
    legacyImporter: null,
    devSeed: async (...args: Parameters<DevSeed>) => {
      seeds.calls.push(key);
      await seeds.extra[key]?.(...args);
    },
  });
  return { featureServers: Object.fromEntries(['reports', 'live', 'comms', 'directory', 'venue', 'guests', 'templates', 'progress', 'core'].map((k) => [k, record(k)])) };
});

interface DevEvent extends BaseRow {
  id: EventId;
  name: string;
  type: 'hoi_nghi' | 'hoi_cho';
  eventDate: string;
  department: string;
  supportingDepartments: string[];
}
const events = defineTable<DevEvent>({
  name: 'sce_tcsk_events',
  owner: 'progress',
  eventScoped: false,
  orderBy: [{ column: 'name', ascending: true }],
  row: z.object({
    id: z.string().transform((v) => v as EventId),
    name: z.string(),
    type: z.enum(['hoi_nghi', 'hoi_cho']),
    eventDate: z.string(),
    department: z.string(),
    supportingDepartments: z.array(z.string()),
    version: z.number().transform((v) => v as Version),
    createdAt: z.string().transform((v) => v as Instant),
    createdBy: z.string().nullable().transform((v) => v as UserId | null),
    updatedAt: z.string().transform((v) => v as Instant),
    updatedBy: z.string().nullable().transform((v) => v as UserId | null),
  }),
});

const seedEvents: DevSeed = async (db, { id }) => {
  await db.table(events).insertMany([
    { id: id('Event', 'xtdt'), name: 'HN XTĐT', type: 'hoi_nghi', eventDate: '2026-12-15', department: 'Phòng Xúc tiến đầu tư', supportingDepartments: [] },
    { id: id('Event', 'ptdn'), name: 'HC PTDN', type: 'hoi_cho', eventDate: '2026-12-20', department: 'Phòng Phát triển doanh nghiệp', supportingDepartments: [] },
  ]);
};

const runtime = () => import('./runtime');
const mode = () => import('./mode');
const admin = async () => (await mode()).devActor((await mode()).devIdentity('admin'));
const names = async (actor: Awaited<ReturnType<typeof admin>>) => (await (await (await runtime()).devDb(actor)).table(events).list()).map((e) => e.name);

beforeEach(async () => {
  vi.stubEnv('SCE_DEV_MEMORY', '1');
  cookieJar.clear();
  seeds.calls = [];
  seeds.extra = { progress: seedEvents };
  await (await runtime()).resetDevRuntime();
  seeds.calls = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('dev memory runtime', () => {
  it('picks the actor from the sce_dev_role cookie, admin by default', async () => {
    const { loadRequestContext } = await import('@/core/auth/server');
    const actorFor = async (cookie?: string) => {
      if (cookie) cookieJar.set('sce_dev_role', cookie);
      else cookieJar.delete('sce_dev_role');
      const loaded = await loadRequestContext();
      return loaded.ok ? loaded.ctx.actor.profile : loaded.gate.kind;
    };
    expect(await actorFor()).toMatchObject({ role: 'admin', status: 'active' });
    expect(await actorFor('user:PTDN')).toMatchObject({ role: 'user', department: 'Phòng Phát triển doanh nghiệp' });
    expect(await actorFor('dept_leader')).toMatchObject({ role: 'dept_leader', department: 'Phòng Xúc tiến đầu tư' });
    expect(await actorFor('leader')).toMatchObject({ role: 'leader', department: 'Ban Giám đốc' });
    expect(await actorFor('pending')).toBe('pending');
    expect(await actorFor('locked')).toBe('locked');
    expect(await actorFor('superadmin')).toMatchObject({ role: 'admin' });
  });

  it('serves settings and the 2026-2027 fixed-date holidays', async () => {
    const { devContext } = await runtime();
    const ctx = await devContext((await mode()).devIdentity('user'));
    if (!ctx.ok) throw new Error('expected a signed-in user');
    expect(ctx.settings.guestQuotaPercent).toBe(130);
    expect(ctx.holidays.map((h) => h.date)).toEqual(['2026-01-01', '2026-04-30', '2026-05-01', '2026-09-02', '2027-01-01', '2027-04-30', '2027-05-01', '2027-09-02']);
  });

  it('enforces the permission matrix and RLS per actor', async () => {
    const { devActor, devIdentity } = await mode();
    const xtdtUser = devActor(devIdentity('user', 'Phòng Xúc tiến đầu tư'));
    expect(await names(await admin())).toEqual(['HC PTDN', 'HN XTĐT']);
    expect(await names(xtdtUser)).toEqual(['HN XTĐT']);
    const db = await (await runtime()).devDb(xtdtUser);
    const err = await db
      .table(events)
      .insert({ name: 'Lạc phòng', type: 'hoi_nghi', eventDate: '2026-12-01', department: 'Phòng Phát triển doanh nghiệp', supportingDepartments: [] })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DbError);
    expect((err as DbError).kind).toBe('forbidden');
    await expect(db.rpc('sce_tcsk_create_backup', { note: 'x', kind: 'manual' })).rejects.toMatchObject({ kind: 'forbidden' });
  });

  it('lets the lead dept_leader see and restore an event it soft-deleted', async () => {
    const { devActor, devIdentity } = await mode();
    const { devDb } = await runtime();
    const lead = await devDb(devActor(devIdentity('dept_leader', 'Phòng Xúc tiến đầu tư')));
    const user = await devDb(devActor(devIdentity('user', 'Phòng Xúc tiến đầu tư')));
    const event = (await lead.table(eventsTable).list()).find((e) => e.name === 'HN XTĐT')!;
    const deleted = await lead.table(eventsTable).update(event.id, { deletedAt: '2026-11-04T01:00:00.000Z' }, { expectedVersion: event.version });
    expect(await user.table(eventsTable).get(event.id)).toBeNull();
    expect((await lead.table(eventsTable).get(event.id))?.deletedAt).toBe('2026-11-04T01:00:00.000Z');
    await lead.table(eventsTable).update(event.id, { deletedAt: null }, { expectedVersion: deleted.version });
    expect((await user.table(eventsTable).get(event.id))?.deletedAt).toBeNull();
  });

  it('keeps one database across a re-import of the runtime and memoryDb modules', async () => {
    await (await (await runtime()).devDb(await admin())).table(events).insert({ name: 'Thêm sau', type: 'hoi_nghi', eventDate: '2026-12-01', department: 'Phòng Xúc tiến đầu tư', supportingDepartments: [] });
    vi.resetModules();
    expect(await names(await admin())).toEqual(['HC PTDN', 'HN XTĐT', 'Thêm sau']);
    expect(seeds.calls).toEqual([]);
  });

  it('reset drops changes and runs the seeds again', async () => {
    const db = await (await runtime()).devDb(await admin());
    const [first] = await db.table(events).list();
    await db.table(events).remove(first!.id);
    expect(await names(await admin())).toEqual(['HN XTĐT']);
    await (await runtime()).resetDevRuntime();
    expect(await names(await admin())).toEqual(['HC PTDN', 'HN XTĐT']);
    expect(seeds.calls).toHaveLength(9);
  });

  it('runs seeds once, in registry order', async () => {
    await (await runtime()).resetDevRuntime();
    await Promise.all([names(await admin()), names(await admin())]);
    const order: FeatureKey[] = ['core', 'progress', 'templates', 'guests', 'venue', 'directory', 'comms', 'live', 'reports'];
    expect(seeds.calls).toEqual(order);
  });

  it('a failed seed is reported and retried from scratch on the next request', async () => {
    seeds.extra.live = async () => {
      throw new Error('boom');
    };
    await expect((await runtime()).resetDevRuntime()).rejects.toThrow('devSeed of feature "live" failed');
    seeds.extra.live = async () => undefined;
    expect(await names(await admin())).toEqual(['HC PTDN', 'HN XTĐT']);
  });

  it('refuses to run in production, even with SCE_DEV_MEMORY=1', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { devMemoryEnabled } = await mode();
    expect(devMemoryEnabled()).toBe(false);
    const rt = await runtime();
    await expect(rt.resetDevRuntime()).rejects.toThrow('SCE_DEV_MEMORY=1');
    await expect(rt.devDb(await admin())).rejects.toThrow('SCE_DEV_MEMORY=1');
    await expect(rt.devContext((await mode()).devIdentity('admin'))).rejects.toThrow('SCE_DEV_MEMORY=1');
    const reset = await import('@/app/dev/reset/route');
    expect((await reset.GET()).status).toBe(404);
    expect(seeds.calls).toEqual([]);
  });

  it('is off without SCE_DEV_MEMORY=1', async () => {
    vi.stubEnv('SCE_DEV_MEMORY', '');
    expect((await mode()).devMemoryEnabled()).toBe(false);
    await expect((await runtime()).devDb(await admin())).rejects.toThrow();
  });
});
