import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { EventId, GuestId, Instant, Version } from '@/core/brand';
import type { Actor, RequestContext } from '@/core/auth';
import { CommandError, defineCommands, type CommandResult } from '@/core/commands';
import { commandLookup, runCommand, type AnyCommandSpec } from '@/core/commands/pipeline';
import { buildWorkCalendar } from '@/core/dates';
import { DbError, memoryDb } from '@/core/db';
import { inspectMemoryDb } from '@/core/db/memory';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { PTDN, testActor, XTDT } from '@/core/testing/actors';
import { E1, E2, E3, eventRows, guestsTable } from '@/core/testing/tables';

const G1 = 'bbbbbbbb-0000-4000-8000-000000000001' as GuestId;

const createInput = z.object({ eventId: z.string(), id: z.string(), name: z.string().min(1, 'Nhập họ tên') });
const specs: Record<string, AnyCommandSpec> = {
  'guests.testCreate': {
    kind: 'mutation',
    input: createInput,
    authorize: { perm: 'guests.write', event: (i) => (i as z.infer<typeof createInput>).eventId as EventId },
    async run(ctx, raw) {
      const i = raw as z.infer<typeof createInput>;
      const g = await ctx.db.table(guestsTable).insert({ id: i.id as GuestId, eventId: i.eventId as EventId, name: i.name, group: 'VIP', organization: 'UBND', rsvpStatus: 'pending', checkinCode: 'K7M2PQ' });
      return {
        value: g,
        audit: { action: 'THÊM KHÁCH MỜI', summary: i.name, eventId: g.eventId, entity: 'guest', entityId: g.id },
        inverse: { command: 'guests.testDelete', input: { eventId: g.eventId, id: g.id }, label: `Thêm ${i.name}` } as never,
      };
    },
  },
  'guests.testDelete': {
    kind: 'mutation',
    input: z.object({ eventId: z.string(), id: z.string() }),
    authorize: { perm: 'guests.write', event: (i) => (i as { eventId: EventId }).eventId },
    async run(ctx, raw) {
      const i = raw as { eventId: EventId; id: GuestId };
      await ctx.db.table(guestsTable).remove(i.id);
      return { value: null, audit: { action: 'XÓA KHÁCH MỜI', summary: i.id, eventId: i.eventId, entity: 'guest', entityId: i.id } };
    },
  },
  'guests.testRename': {
    kind: 'mutation',
    input: z.object({ eventId: z.string(), id: z.string(), version: z.number(), name: z.string() }),
    authorize: { perm: 'guests.write', event: (i) => (i as { eventId: EventId }).eventId },
    async run(ctx, raw) {
      const i = raw as { eventId: EventId; id: GuestId; version: Version; name: string };
      const g = await ctx.db.table(guestsTable).update(i.id, { name: i.name }, { expectedVersion: i.version });
      return { value: g, audit: { action: 'CẬP NHẬT KHÁCH MỜI', summary: i.name, eventId: i.eventId, entity: 'guest', entityId: i.id } };
    },
  },
  'progress.testDelete': {
    kind: 'mutation',
    input: z.object({ eventId: z.string() }),
    authorize: { perm: 'progress.delete', event: (i) => (i as { eventId: EventId }).eventId },
    run: vi.fn(async () => ({ value: null, audit: { action: 'XÓA', summary: '', eventId: null, entity: null, entityId: null } })),
  },
  'guests.testNoAudit': {
    kind: 'mutation',
    input: z.object({}),
    authorize: { perm: 'guests.read', global: true },
    run: async () => ({ value: 1, audit: null }),
  },
  'guests.testCount': {
    kind: 'query',
    input: z.object({ eventId: z.string() }),
    authorize: { perm: 'guests.read', event: (i) => (i as { eventId: EventId }).eventId },
    run: async (ctx, raw) => ({ value: (await ctx.db.table(guestsTable).list({ eventId: (raw as { eventId: EventId }).eventId })).length, audit: null }),
  },
  'live.testWalkIn': {
    kind: 'mutation',
    input: z.object({ eventId: z.string(), id: z.string(), name: z.string() }),
    authorize: { perm: 'live.checkin', event: (i) => (i as { eventId: EventId }).eventId },
    async run(ctx, raw) {
      const i = raw as { eventId: EventId; id: GuestId; name: string };
      const g = await ctx.call('guests.testCreate' as never, i as never);
      return { value: g, audit: { action: 'KHÁCH PHÁT SINH', summary: i.name, eventId: i.eventId, entity: 'guest', entityId: i.id } };
    },
  },
  'core.testManage': {
    kind: 'mutation',
    input: z.object({}),
    authorize: { perm: 'core.users.manage', global: true },
    run: async () => {
      throw new DbError('constraint', { constraint: 'last_admin' });
    },
  },
  'core.testUsersOf': {
    kind: 'query',
    input: z.object({ department: z.string() }),
    authorize: { perm: 'core.users.read', resource: async (_ctx, i) => ({ departments: [(i as { department: string }).department as typeof XTDT] }) },
    run: async () => ({ value: 'ok', audit: null }),
  },
  'guests.testRule': {
    kind: 'mutation',
    input: z.object({}),
    authorize: { perm: 'guests.read', global: true },
    run: async () => {
      throw new CommandError('invalid', 'Khách mời đã có trong danh sách.', { name: 'Trùng tên' });
    },
  },
};
const lookup = (id: string) => specs[id];

function world() {
  const seed = { sce_tcsk_events: eventRows() };
  const ctxOf = (actor: Actor): RequestContext => ({
    actor,
    db: memoryDb(seed, actor),
    settings: { ...DEFAULT_SETTINGS, version: 1 as Version },
    calendar: buildWorkCalendar([]),
    now: '2026-11-04T01:00:00.000Z' as Instant,
  });
  const run = (actor: Actor, id: string, input: unknown) => runCommand(ctxOf(actor), lookup, id, input);
  const audit = () => inspectMemoryDb(seed, 'sce_tcsk_audit_logs');
  const guests = () => inspectMemoryDb(seed, 'sce_tcsk_guests');
  return { run, audit, guests };
}

const failureOf = (r: CommandResult<unknown>) => (r.ok ? null : { kind: r.kind, message: r.message, fieldErrors: r.fieldErrors });

describe('pipeline: authorization', () => {
  it('runs and audits when the actor’s department leads the event', async () => {
    const w = world();
    const xtdt = testActor('user', XTDT);
    const r = await w.run(xtdt, 'guests.testCreate', { eventId: E1, id: G1, name: 'Nguyễn Văn A' });
    expect(r.ok).toBe(true);
    expect(w.audit()).toMatchObject([{ action: 'THÊM KHÁCH MỜI', summary: 'Nguyễn Văn A', event_id: E1, entity: 'guest', entity_id: G1, actor_id: xtdt.profile.id }]);
  });

  it('allows a supporting department', async () => {
    const w = world();
    expect((await w.run(testActor('user', XTDT), 'guests.testCreate', { eventId: E3, id: G1, name: 'A' })).ok).toBe(true);
  });

  it('wrong department: the event is invisible, so the command reports not_found and writes nothing', async () => {
    const w = world();
    const r = await w.run(testActor('user', XTDT), 'guests.testCreate', { eventId: E2, id: G1, name: 'A' });
    expect(failureOf(r)).toMatchObject({ kind: 'not_found' });
    expect(w.guests()).toEqual([]);
    expect(w.audit()).toEqual([]);
  });

  it('permission denied: a visible event but a role without the grant never reaches run()', async () => {
    const w = world();
    const r = await w.run(testActor('user', XTDT), 'progress.testDelete', { eventId: E1 });
    expect(failureOf(r)).toEqual({ kind: 'forbidden', message: 'Bạn không có quyền thực hiện thao tác này.', fieldErrors: undefined });
    expect(specs['progress.testDelete']!.run).not.toHaveBeenCalled();
    expect((await w.run(testActor('dept_leader', XTDT), 'progress.testDelete', { eventId: E1 })).ok).toBe(true);
  });

  it('global and resource-scoped rules', async () => {
    const w = world();
    expect(failureOf(await w.run(testActor('leader', 'Ban Giám đốc'), 'core.testManage', {}))).toMatchObject({ kind: 'forbidden' });
    expect((await w.run(testActor('dept_leader', XTDT), 'core.testUsersOf', { department: XTDT })).ok).toBe(true);
    expect(failureOf(await w.run(testActor('dept_leader', XTDT), 'core.testUsersOf', { department: PTDN }))).toMatchObject({ kind: 'forbidden' });
  });
});

describe('pipeline: gate', () => {
  it.each([
    ['pending', testActor('user', XTDT, { status: 'pending' }), 'Tài khoản đang chờ quản trị viên phê duyệt.'],
    ['locked', testActor('user', XTDT, { status: 'locked' }), 'Tài khoản đã bị khóa.'],
    ['admin without TOTP', testActor('admin', null, { aal: 'aal1', hasVerifiedTotp: false }), 'Cần thiết lập xác thực hai lớp (TOTP) trước khi tiếp tục.'],
    ['TOTP user at AAL1', testActor('user', XTDT, { aal: 'aal1', hasVerifiedTotp: true }), 'Cần nhập mã xác thực hai lớp (TOTP) để tiếp tục.'],
  ])('%s is stopped before parsing or authorizing', async (_label, actor, message) => {
    const w = world();
    const r = await w.run(actor, 'guests.testCreate', { eventId: E1, id: G1, name: 'A' });
    expect(failureOf(r)).toMatchObject({ kind: 'gate', message });
    expect(w.guests()).toEqual([]);
  });
});

describe('pipeline: input, audit, errors', () => {
  it('reports schema errors per field', async () => {
    const w = world();
    const r = await w.run(testActor('user', XTDT), 'guests.testCreate', { eventId: E1, id: G1, name: '' });
    expect(failureOf(r)).toEqual({ kind: 'invalid', message: 'Dữ liệu nhập chưa hợp lệ. Vui lòng kiểm tra lại.', fieldErrors: { name: 'Nhập họ tên' } });
  });

  it('a mutation that returns no audit entry fails instead of succeeding silently', async () => {
    const w = world();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(failureOf(await w.run(testActor('user', XTDT), 'guests.testNoAudit', {}))).toMatchObject({ kind: 'unavailable' });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('queries need no audit', async () => {
    const w = world();
    expect(await w.run(testActor('user', XTDT), 'guests.testCount', { eventId: E1 })).toEqual({ ok: true, value: 0 });
    expect(w.audit()).toEqual([]);
  });

  it('business-rule errors keep their Vietnamese message and field errors', async () => {
    const w = world();
    expect(failureOf(await w.run(testActor('user', XTDT), 'guests.testRule', {}))).toEqual({ kind: 'invalid', message: 'Khách mời đã có trong danh sách.', fieldErrors: { name: 'Trùng tên' } });
  });

  it('named constraints get their own message', async () => {
    const w = world();
    expect(failureOf(await w.run(testActor('admin', null), 'core.testManage', {}))).toMatchObject({ kind: 'constraint', message: 'Hệ thống phải còn ít nhất một quản trị viên đang hoạt động.' });
  });

  it('unknown ids and prototype keys find no command', async () => {
    const w = world();
    expect(failureOf(await w.run(testActor('user', XTDT), 'guests.nope', {}))).toMatchObject({ kind: 'unavailable', message: 'Chức năng này chưa sẵn sàng.' });
    const byFeature = commandLookup({ core: { commands: { ping: specs['guests.testCount']! } } });
    expect(byFeature('core.ping')).toBeDefined();
    expect(byFeature('core.constructor')).toBeUndefined();
    expect(byFeature('constructor.name')).toBeUndefined();
    expect(byFeature('core')).toBeUndefined();
  });
});

describe('pipeline: concurrency, retries, undo', () => {
  it('a stale version is a conflict with the reload message', async () => {
    const w = world();
    const xtdt = testActor('user', XTDT);
    await w.run(xtdt, 'guests.testCreate', { eventId: E1, id: G1, name: 'A' });
    expect((await w.run(xtdt, 'guests.testRename', { eventId: E1, id: G1, version: 1, name: 'B' })).ok).toBe(true);
    const stale = await w.run(xtdt, 'guests.testRename', { eventId: E1, id: G1, version: 1, name: 'C' });
    expect(failureOf(stale)).toMatchObject({ kind: 'conflict', message: 'Dữ liệu đã được người khác cập nhật. Đang tải lại…' });
  });

  it('retrying a create with the same client id converges on one row', async () => {
    const w = world();
    const xtdt = testActor('user', XTDT);
    const first = await w.run(xtdt, 'guests.testCreate', { eventId: E1, id: G1, name: 'A' });
    const retry = await w.run(xtdt, 'guests.testCreate', { eventId: E1, id: G1, name: 'A' });
    expect(retry).toEqual(first);
    expect(w.guests()).toHaveLength(1);
  });

  it('undo runs the inverse through the same pipeline: permission re-checked, audited', async () => {
    const w = world();
    const xtdt = testActor('user', XTDT);
    const created = await w.run(xtdt, 'guests.testCreate', { eventId: E1, id: G1, name: 'A' });
    if (!created.ok || !created.inverse) throw new Error('expected an inverse');
    expect(created.inverse).toEqual({ command: 'guests.testDelete', input: { eventId: E1, id: G1 }, label: 'Thêm A' });

    const stranger = await w.run(testActor('user', PTDN), created.inverse.command, created.inverse.input);
    expect(failureOf(stranger)).toMatchObject({ kind: 'not_found' });
    expect(w.guests()).toHaveLength(1);

    expect((await w.run(xtdt, created.inverse.command, created.inverse.input)).ok).toBe(true);
    expect(w.guests()).toEqual([]);
    expect(w.audit().map((a) => a.action)).toEqual(['THÊM KHÁCH MỜI', 'XÓA KHÁCH MỜI']);
  });
});

describe('pipeline: asking another owner', () => {
  it('ctx.call runs the owner’s command with its own permission check and audit', async () => {
    const w = world();
    const r = await w.run(testActor('user', XTDT), 'live.testWalkIn', { eventId: E1, id: G1, name: 'Khách phát sinh' });
    expect(r.ok).toBe(true);
    expect(w.audit().map((a) => a.action)).toEqual(['THÊM KHÁCH MỜI', 'KHÁCH PHÁT SINH']);
  });

  it('a failing nested command fails the outer one with the inner failure', async () => {
    const w = world();
    const r = await w.run(testActor('user', XTDT), 'live.testWalkIn', { eventId: E1, id: G1, name: '' });
    expect(failureOf(r)).toMatchObject({ kind: 'invalid', fieldErrors: { name: 'Nhập họ tên' } });
    expect(w.audit()).toEqual([]);
  });
});

describe('defineCommands', () => {
  it('rejects a spec without run, input or authorize', () => {
    expect(() => defineCommands('core', { 'users.create': { kind: 'mutation' } } as never)).toThrow('core.users.create: a command needs kind, input, authorize and run');
  });
});
