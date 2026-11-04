// Runs guests commands through the real pipeline on a memoryDb, as any actor.
// Events come from progress's own command; venue is a stand-in that keeps the
// seat table, so seat release and re-seating can be observed.

import type { Actor, RequestContext } from '@/core/auth';
import { newId, type EventId, type GuestId, type Instant, type IsoDate, type SeatCode, type Version } from '@/core/brand';
import type { CommandId, CommandResult, CommandSpec, InputOf, Inverse, OutputOf } from '@/core/commands';
import { commandLookup, runCommand } from '@/core/commands/pipeline';
import { buildWorkCalendar } from '@/core/dates';
import { DbError, memoryDb } from '@/core/db';
import { inspectMemoryDb } from '@/core/db/memory';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { testActor, XTDT } from '@/core/testing/actors';
import { commands as progressCommands } from '@/features/progress/server';
import type { DepartmentName } from '@/core/vocab';
import type { GuestDraft } from '../contract';
import { NEW_GUEST_DEFAULTS } from '../domain/schemas';
import { commands } from '../server/commands';
import { readRoster } from '../server/reads';
import { seatsTable } from '../server/tables';

export const SETTINGS = { ...DEFAULT_SETTINGS, version: 1 as Version };
export const NOW = '2026-11-04T02:00:00.000Z' as Instant;

export function draft(overrides: Partial<GuestDraft> = {}): GuestDraft {
  return { ...NEW_GUEST_DEFAULTS, name: 'Nguyễn Văn An', organization: 'Sở Tài chính Hà Nội', ...overrides };
}

type Venue = { eventId: EventId; guestId: GuestId; seatCode?: SeatCode | 'auto' };
const venueSpec = (run: CommandSpec<Venue, unknown>['run']): CommandSpec<Venue, unknown> => ({
  kind: 'mutation',
  input: { parse: (x) => x as Venue },
  authorize: { perm: 'venue.seating.write', event: (i) => i.eventId },
  run,
});
/** Stand-in for venue's two commands guests asks: release a guest's seat, and give a seat back (refused if taken). */
const venue = {
  commands: {
    releaseGuestSeat: venueSpec(async (ctx, { eventId, guestId }) => {
      await ctx.db.table(seatsTable).removeWhere({ eventId, guestId });
      return { value: null, audit: { action: 'GIẢI PHÓNG GHẾ', summary: 'test', eventId, entity: 'seat', entityId: guestId } };
    }),
    assignSeat: venueSpec(async (ctx, { eventId, guestId, seatCode }) => {
      const taken = await ctx.db.table(seatsTable).list({ eventId, seatCode: seatCode as SeatCode });
      if (taken.some((s) => s.guestId !== guestId)) throw new DbError('conflict');
      const row = await ctx.db.table(seatsTable).insert({ eventId, guestId, seatCode: seatCode as SeatCode });
      return { value: row, audit: { action: 'XẾP GHẾ', summary: 'test', eventId, entity: 'seat', entityId: guestId } };
    }),
  },
};

export function harness() {
  const seed = { sce_tcsk_events: [], sce_tcsk_task_groups: [], sce_tcsk_steps: [], sce_tcsk_guests: [], sce_tcsk_seat_assignments: [], sce_tcsk_checkins: [], sce_tcsk_audit_logs: [] };
  const lookup = commandLookup({ guests: { commands }, progress: { commands: progressCommands }, venue });
  const ctx = (actor: Actor): RequestContext => ({ actor, db: memoryDb(seed, actor), settings: SETTINGS, calendar: buildWorkCalendar([]), now: NOW });
  const run = <K extends CommandId>(actor: Actor, id: K, input: InputOf<K>) => runCommand(ctx(actor), lookup, id, input) as Promise<CommandResult<OutputOf<K>>>;
  /**
   * Runs as `actor` against a Db that answers like an admin's, so row-level security lets everything through.
   * Whatever is refused here is refused by the command's own authorize and checks, not by the emulated RLS.
   */
  const runWithoutRls = <K extends CommandId>(actor: Actor, id: K, input: InputOf<K>) =>
    runCommand({ ...ctx(actor), db: memoryDb(seed, testActor('admin', null)) }, lookup, id, input) as Promise<CommandResult<OutputOf<K>>>;
  const ok = async <K extends CommandId>(actor: Actor, id: K, input: InputOf<K>) => {
    const r = await run(actor, id, input);
    if (!r.ok) throw new Error(`${id} failed: ${r.kind} ${r.message} ${JSON.stringify(r.fieldErrors ?? {})}`);
    return r;
  };
  const undo = (actor: Actor, inverse: Inverse | undefined) => {
    if (!inverse) throw new Error('no inverse');
    return run(actor, inverse.command, inverse.input as never);
  };
  const createEvent = async (actor: Actor = testActor('user', XTDT), department: DepartmentName = XTDT, supportingDepartments: DepartmentName[] = []) => {
    const id = newId<'Event'>();
    await ok(actor, 'progress.createEvent', {
      id,
      draft: {
        name: 'Hội nghị Xúc tiến Đầu tư 2026', type: 'hoi_nghi', eventDate: '2026-12-15' as IsoDate, eventTime: '08:30' as never, location: 'Hà Nội',
        department, supportingDepartments, leadPerson: '', budget: null, targetGuests: 150, note: '', applyStandardTemplate: false,
      },
    });
    return id;
  };
  const addGuest = async (actor: Actor, eventId: EventId, overrides: Partial<GuestDraft> = {}) => {
    const id = newId<'Guest'>();
    const r = await ok(actor, 'guests.create', { eventId, id, draft: draft(overrides) });
    return r.value;
  };
  const seat = (eventId: EventId, guestId: GuestId, seatCode: string) =>
    memoryDb(seed, testActor('admin', null)).table(seatsTable).insert({ eventId, guestId, seatCode: seatCode as SeatCode });
  const unseat = (eventId: EventId, guestId: GuestId) => memoryDb(seed, testActor('admin', null)).table(seatsTable).removeWhere({ eventId, guestId });
  const roster = (actor: Actor, eventId: EventId) => readRoster(ctx(actor), eventId);
  const audits = () => inspectMemoryDb(seed, 'sce_tcsk_audit_logs');
  const rows = (table: string) => inspectMemoryDb(seed, table);
  return { seed, ctx, run, runWithoutRls, ok, undo, createEvent, addGuest, seat, unseat, roster, audits, rows };
}
