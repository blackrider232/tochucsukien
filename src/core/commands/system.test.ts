import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { EventId, GuestId, Instant, Version } from '@/core/brand';
import type { RequestContext } from '@/core/auth';
import { runCommand, type AnyCommandSpec } from '@/core/commands/pipeline';
import { buildWorkCalendar } from '@/core/dates';
import { memoryDb, supabaseDb } from '@/core/db';
import { inspectMemoryDb } from '@/core/db/memory';
import { can, permissionMatrix } from '@/core/permissions';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { testActor, XTDT } from '@/core/testing/actors';
import { E1, E2, eventRows, guestsTable } from '@/core/testing/tables';

vi.mock('next/dist/compiled/server-only', () => ({}));
const { systemAuditWriter } = await import('@/core/auth/admin');
const { SYSTEM_ACTOR_ID, systemActor } = await import('@/core/auth/system');

const G1 = 'bbbbbbbb-0000-4000-8000-000000000001' as GuestId;
const onEvent = (perm: string) => ({ perm, event: (i: unknown) => (i as { eventId: EventId }).eventId }) as AnyCommandSpec['authorize'];
const audited = (action: string) => async (_ctx: unknown, raw: unknown) => ({
  value: 'ran',
  audit: { action, summary: action, eventId: (raw as { eventId: EventId }).eventId, entity: 'guest', entityId: G1 },
});
const eventInput = z.object({ eventId: z.string() });

const ran: string[] = [];
const spec = (id: string, perm: string, run?: AnyCommandSpec['run']): AnyCommandSpec => ({
  kind: 'mutation',
  input: eventInput,
  authorize: onEvent(perm),
  run: async (ctx, input) => {
    ran.push(id);
    return (run ?? audited(id.toUpperCase().replace(/\W/g, ' ')))(ctx, input);
  },
});
const specs: Record<string, AnyCommandSpec> = {
  'guests.applyRsvp': spec('guests.applyRsvp', 'guests.write', async (ctx, raw) => {
    const { eventId } = raw as { eventId: EventId };
    await ctx.db.table(guestsTable).insert({ id: G1, eventId, name: 'A', group: 'VIP', organization: 'UBND', rsvpStatus: 'confirmed', checkinCode: 'K7M2PQ' });
    return { value: 'ran', audit: { action: 'CẬP NHẬT RSVP', summary: 'Cập nhật RSVP từ phản hồi: A', eventId, entity: 'guest', entityId: G1 } };
  }),
  'comms.syncForm': spec('comms.syncForm', 'comms.rsvp.manage', async (ctx, raw) => {
    const { eventId } = raw as { eventId: EventId };
    await ctx.call('guests.applyRsvp' as never, { eventId } as never);
    return { value: 'ran', audit: { action: 'ĐỒNG BỘ GOOGLE FORM', summary: 'Đồng bộ', eventId, entity: 'rsvp_form', entityId: eventId } };
  }),
  // In the job's table, but asks another feature for a command the job does not hold.
  'guests.upsertMany': spec('guests.upsertMany', 'guests.write', async (ctx, raw) => {
    await ctx.call('guests.create' as never, raw as never);
    return audited('NHẬP KHÁCH MỜI')(ctx, raw);
  }),
  // In the job's table under another permission than the one it declares.
  'venue.releaseGuestSeat': spec('venue.releaseGuestSeat', 'venue.halls.admin'),
  'guests.create': spec('guests.create', 'guests.write'),
  'core.settings.update': { ...spec('core.settings.update', 'core.settings.edit'), authorize: { perm: 'core.settings.edit', global: true } },
};
const lookup = (id: string) => specs[id];

function world(events = eventRows()) {
  const seed = { sce_tcsk_events: events };
  // The service role sees past RLS; memoryDb does that for an admin at AAL2 (as the feature harnesses' runWithoutRls).
  const db = memoryDb(seed, testActor('admin', null));
  const ctx: RequestContext = {
    actor: systemActor('rsvp-sync'),
    db,
    settings: { ...DEFAULT_SETTINGS, version: 1 as Version },
    calendar: buildWorkCalendar([]),
    now: '2026-11-04T01:00:00.000Z' as Instant,
  };
  const run = (id: string, input: unknown) => runCommand(ctx, lookup, id, input, systemAuditWriter('rsvp-sync', db));
  const audit = () => inspectMemoryDb(seed, 'sce_tcsk_audit_logs');
  return { ctx, db, run, audit };
}

describe('the system actor of a scheduled job', () => {
  it('runs a command of its job, nested calls included, and each row names system:<job> with no person', async () => {
    ran.length = 0;
    const w = world();
    expect(await w.run('comms.syncForm', { eventId: E2 })).toEqual({ ok: true, value: 'ran' });
    expect(ran).toEqual(['comms.syncForm', 'guests.applyRsvp']);
    expect(w.audit().map((r) => [r.action, r.actor_email, r.actor_id, r.event_id])).toEqual([
      ['CẬP NHẬT RSVP', 'system:rsvp-sync', SYSTEM_ACTOR_ID, E2],
      ['ĐỒNG BỘ GOOGLE FORM', 'system:rsvp-sync', SYSTEM_ACTOR_ID, E2],
    ]);
  });

  it('cannot run a command its job does not list, and nothing runs or is audited', async () => {
    ran.length = 0;
    const w = world();
    expect(await w.run('guests.create', { eventId: E1 })).toMatchObject({ ok: false, kind: 'forbidden' });
    expect(ran).toEqual([]);
    expect(w.audit()).toEqual([]);
  });

  it('cannot run any core command', async () => {
    ran.length = 0;
    const w = world();
    expect(await w.run('core.settings.update', { eventId: E1 })).toMatchObject({ ok: false, kind: 'forbidden' });
    expect(ran).toEqual([]);
  });

  it('cannot reach an unlisted command through ctx.call', async () => {
    ran.length = 0;
    const w = world();
    expect(await w.run('guests.upsertMany', { eventId: E1 })).toMatchObject({ ok: false, kind: 'forbidden' });
    expect(ran).toEqual(['guests.upsertMany']);
    expect(w.audit()).toEqual([]);
  });

  it('cannot run a listed command whose permission is not the one its job holds for it', async () => {
    ran.length = 0;
    const w = world();
    expect(await w.run('venue.releaseGuestSeat', { eventId: E1 })).toMatchObject({ ok: false, kind: 'forbidden' });
    expect(ran).toEqual([]);
  });

  it('cannot act on an event that does not exist or was deleted', async () => {
    ran.length = 0;
    const w = world(eventRows().map((e) => (e.id === E2 ? { ...e, deleted_at: '2026-11-03T00:00:00.000Z' } : e)) as never);
    expect(await w.run('guests.applyRsvp', { eventId: E2 })).toMatchObject({ ok: false, kind: 'not_found' });
    expect(await w.run('guests.applyRsvp', { eventId: '00000000-0000-4000-8000-0000000000ff' })).toMatchObject({ ok: false, kind: 'not_found' });
    expect(ran).toEqual([]);
  });

  it('never passes a profile-scoped rule, even on a listed command', async () => {
    ran.length = 0;
    const w = world();
    const scoped = { ...specs['guests.applyRsvp']!, authorize: { perm: 'guests.write', resource: async () => ({ departments: [XTDT] }) } } as AnyCommandSpec;
    expect(await runCommand(w.ctx, () => scoped, 'guests.applyRsvp', { eventId: E1 }, systemAuditWriter('rsvp-sync', w.db))).toMatchObject({ ok: false, kind: 'forbidden' });
    expect(ran).toEqual([]);
  });

  it('holds no permission through can(), whatever its profile says', () => {
    const system = systemActor('rsvp-sync');
    for (const perm of permissionMatrix().keys()) expect(can(system, perm, { departments: [XTDT] })).toBe(false);
  });

  it('a human actor is never a system actor', () => {
    expect(testActor('admin', null).system).toBeUndefined();
  });
});

describe('the system audit writer', () => {
  const row = { command: 'guests.applyRsvp', perm: 'guests.write' as const, action: 'CẬP NHẬT RSVP', summary: 's', eventId: E1, entity: 'guest', entityId: G1 };

  it('refuses a human actor, another job, an unlisted pair and a core command', async () => {
    const w = world();
    const write = systemAuditWriter('rsvp-sync', w.db)!;
    await expect(write(testActor('admin', null), row)).rejects.toMatchObject({ kind: 'forbidden' });
    await expect(write({ ...systemActor('rsvp-sync'), system: 'other' as never }, row)).rejects.toMatchObject({ kind: 'forbidden' });
    await expect(write(systemActor('rsvp-sync'), { ...row, command: 'guests.create' })).rejects.toMatchObject({ kind: 'forbidden' });
    await expect(write(systemActor('rsvp-sync'), { ...row, perm: 'guests.read' })).rejects.toMatchObject({ kind: 'forbidden' });
    await expect(write(systemActor('rsvp-sync'), { ...row, command: 'core.settings.update', perm: 'core.settings.edit', eventId: null })).rejects.toMatchObject({ kind: 'forbidden' });
    expect(w.audit()).toEqual([]);
    await write(systemActor('rsvp-sync'), row);
    expect(w.audit()).toHaveLength(1);
  });

  it('is null without a memory store or the service key, so a system mutation is refused before it runs', () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(systemAuditWriter('rsvp-sync', supabaseDb({}, systemActor('rsvp-sync')))).toBeNull();
    vi.unstubAllEnvs();
  });
});
