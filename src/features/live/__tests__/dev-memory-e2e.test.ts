// @vitest-environment node
// The review's undo scenario end to end on the dev memory runtime: every
// feature's dev seed, the cookie identity, the real registry and the memory
// audit writer, called the way dispatch calls them.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventId, Instant } from '@/core/brand';
import type { RequestContext } from '@/core/auth';
import type { CommandId, CommandResult, InputOf, Inverse, OutputOf } from '@/core/commands';
import { commandLookup, runCommand } from '@/core/commands/pipeline';
import { eventsTable } from '@/core/testing/tables';
import type { RosterEntry } from '@/features/guests';

const cookieJar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/dist/compiled/server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined), delete: (name: string) => cookieJar.delete(name) }),
}));

const T0 = new Date('2026-12-01T01:00:00.000Z');

async function send<K extends CommandId>(role: string, id: K, input: InputOf<K>): Promise<CommandResult<OutputOf<K>>> {
  cookieJar.set('sce_dev_role', role);
  const { loadRequestContext } = await import('@/core/auth/server');
  const { commandAuditWriter } = await import('@/core/auth/admin');
  const { featureServers } = await import('@/features/registry-server');
  const loaded = await loadRequestContext();
  if (!loaded.ok) throw new Error(`gate ${loaded.gate.kind}`);
  return (await runCommand(loaded.ctx, commandLookup(featureServers), id, input, commandAuditWriter(loaded.ctx.db))) as CommandResult<OutputOf<K>>;
}
const ok = async <K extends CommandId>(role: string, id: K, input: InputOf<K>) => {
  const r = await send(role, id, input);
  if (!r.ok) throw new Error(`${id}: ${r.kind} ${r.message}`);
  return r;
};
const undo = (role: string, inv: Inverse | undefined) => send(role, inv!.command, inv!.input as never);

async function devEvent() {
  const { devDb } = await import('@/core/dev/runtime');
  const { devActor, devIdentity } = await import('@/core/dev/mode');
  const db = await devDb(devActor(devIdentity('admin')));
  return (await db.table(eventsTable).list())[0]!.id as EventId;
}
async function adminRead(): Promise<RequestContext> {
  const { devContext } = await import('@/core/dev/runtime');
  const { devIdentity } = await import('@/core/dev/mode');
  const { buildWorkCalendar } = await import('@/core/dates');
  const ctx = await devContext(devIdentity('admin'));
  if (!ctx.ok) throw new Error('no admin');
  return { actor: ctx.actor, db: ctx.db, settings: ctx.settings, calendar: buildWorkCalendar([]), now: T0.toISOString() as Instant };
}
async function guestNamed(eventId: EventId, name: string): Promise<RosterEntry> {
  const { readRoster } = await import('@/features/guests/server');
  return (await readRoster(await adminRead(), eventId)).find((g) => g.name === name)!;
}
const at = (minutes: number) => vi.setSystemTime(new Date(T0.getTime() + minutes * 60_000));

beforeEach(async () => {
  vi.stubEnv('SCE_DEV_MEMORY', '1');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  cookieJar.clear();
  await (await import('@/core/dev/runtime')).resetDevRuntime();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('dev memory: check in, cancel, undo through the token', () => {
  it('restores the original time, desk and gift; refuses a forged restore, a second use and an expired token; refuses a walk-in on another guest id', async () => {
    const eventId = await devEvent();
    const guest = await guestNamed(eventId, 'Doanh nhân Thử Nghiệm E');
    const desk = 'user:XTDT';

    const c = await ok(desk, 'live.checkIn', { eventId, guestId: guest.id, desk: 'Bàn 1' });
    at(5);
    await ok(desk, 'live.setGift', { eventId, guestId: guest.id, given: true });
    at(60);
    const cancel = await ok('dept_leader:XTDT', 'live.cancelCheckIn', { eventId, guestId: guest.id });
    at(65);
    expect(await undo(desk, cancel.inverse)).toMatchObject({ ok: true });
    const restored = await guestNamed(eventId, guest.name);
    expect(restored).toMatchObject({ checkedInAt: c.value.checkIn.checkedInAt, giftGivenAt: new Date(T0.getTime() + 5 * 60_000).toISOString() });
    const { readCheckIns } = await import('../server/reads');
    const rows = await readCheckIns(await adminRead(), eventId);
    expect(rows.find((r) => r.guestId === guest.id)).toMatchObject({ desk: 'Bàn 1', checkedInBy: c.value.checkIn.checkedInBy });

    expect(await undo(desk, cancel.inverse)).toMatchObject({ ok: false, kind: 'conflict' });

    const other = await guestNamed(eventId, 'Doanh nhân Thử Nghiệm F');
    const forged = { eventId, guestId: other.id, checkedInAt: '2020-01-01T00:00:00.000Z', desk: 'forged', giftGiven: true };
    expect(await send(desk, 'live.restoreCheckIn', forged as never)).toMatchObject({ ok: false });
    expect((await guestNamed(eventId, other.name)).checkedInAt).toBeNull();

    const again = await ok(desk, 'live.cancelCheckIn', { eventId, guestId: guest.id });
    at(65 + 16);
    const expired = await undo(desk, again.inverse);
    expect(expired).toMatchObject({ ok: false, kind: 'conflict' });
    expect((await guestNamed(eventId, guest.name)).checkedInAt).toBeNull();

    const walk = await send(desk, 'live.walkIn', {
      eventId, guestId: other.id, guest: { name: 'Người Giả', group: 'DoanhNghiep', title: '', organization: 'X', phone: '', hasBanquet: false },
      zoneKey: null, confirmVipZone: false, giftGiven: false, allowDuplicate: true, desk: null,
    });
    expect(walk).toMatchObject({ ok: false, kind: 'conflict' });
    expect((await guestNamed(eventId, other.name)).checkedInAt).toBeNull();
  });
});
