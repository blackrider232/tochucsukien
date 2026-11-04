// Runs venue commands through the real pipeline on a memoryDb, as any actor.
// Test files mock '@/features/guests/server' with ./guest-fixture first.

import type { Actor, RequestContext } from '@/core/auth';
import { newId, type EventId, type GuestId, type Instant, type IsoDate, type Version } from '@/core/brand';
import type { CommandId, CommandResult, InputOf, Inverse, OutputOf } from '@/core/commands';
import { commandLookup, runCommand } from '@/core/commands/pipeline';
import { buildWorkCalendar } from '@/core/dates';
import { memoryDb, type Db } from '@/core/db';
import { inspectMemoryDb } from '@/core/db/memory';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { testActor } from '@/core/testing/actors';
import type { DepartmentName, GuestGroup, RsvpStatus } from '@/core/vocab';
import { commands as progressCommands } from '@/features/progress/server';
import { commands } from '../server/commands';
import { readEventHall, readSeating } from '../server/reads';
import { guestFixtureTable } from './guest-fixture';

export const NOW = '2026-11-04T02:00:00.000Z' as Instant;
const admin = testActor('admin', null);

export function harness() {
  const seed = {
    sce_tcsk_events: [], sce_tcsk_guests: [], sce_tcsk_hall_templates: [], sce_tcsk_event_halls: [], sce_tcsk_seat_assignments: [],
    sce_tcsk_booths: [], sce_tcsk_booth_shifts: [], sce_tcsk_audit_logs: [],
  };
  const lookup = commandLookup({ venue: { commands }, progress: { commands: progressCommands } });
  const ctx = (actor: Actor): RequestContext => ({ actor, db: memoryDb(seed, actor), settings: { ...DEFAULT_SETTINGS, version: 1 as Version }, calendar: buildWorkCalendar([]), now: NOW });
  const run = <K extends CommandId>(actor: Actor, id: K, input: InputOf<K>) => runCommand(ctx(actor), lookup, id, input) as Promise<CommandResult<OutputOf<K>>>;
  /**
   * Runs as `actor` against a Db that answers like an admin's, so row-level security lets everything through.
   * Whatever is refused here is refused by the command's own authorize and checks, not by the emulated RLS.
   */
  const runWithoutRls = <K extends CommandId>(actor: Actor, id: K, input: InputOf<K>) =>
    runCommand({ ...ctx(actor), db: memoryDb(seed, admin) }, lookup, id, input) as Promise<CommandResult<OutputOf<K>>>;
  /** Runs with the command's Db passed through `wrap`, so a test can let another writer act in the middle of a command. */
  const runWith = <K extends CommandId>(actor: Actor, wrap: (db: Db) => Db, id: K, input: InputOf<K>) =>
    runCommand({ ...ctx(actor), db: wrap(memoryDb(seed, actor)) }, lookup, id, input) as Promise<CommandResult<OutputOf<K>>>;
  const ok = async <K extends CommandId>(actor: Actor, id: K, input: InputOf<K>) => {
    const r = await run(actor, id, input);
    if (!r.ok) throw new Error(`${id} failed: ${r.kind} ${r.message} ${JSON.stringify(r.fieldErrors ?? {})}`);
    return r;
  };
  const undo = (actor: Actor, inverse: Inverse | undefined) => {
    if (!inverse) throw new Error('no inverse');
    return run(actor, inverse.command, inverse.input as never);
  };
  const createEvent = async (department: DepartmentName = 'Phòng Xúc tiến đầu tư') => {
    const id = newId<'Event'>();
    await ok(admin, 'progress.createEvent', {
      id,
      draft: {
        name: 'Hội nghị Xúc tiến Đầu tư 2026', type: 'hoi_nghi', eventDate: '2026-12-15' as IsoDate, eventTime: '08:30' as never, location: '', department,
        supportingDepartments: [], leadPerson: '', budget: null, targetGuests: 150, note: '', applyStandardTemplate: false,
      },
    });
    return id;
  };
  let code = 0;
  const addGuest = async (eventId: EventId, name: string, group: GuestGroup, rsvpStatus: RsvpStatus = 'confirmed', organization = '') => {
    const row = await ctx(admin).db.table(guestFixtureTable).insert({ id: newId<'Guest'>(), eventId, name, group, organization, rsvpStatus, checkinCode: `C${String(++code).padStart(5, '0')}` });
    return row.id as GuestId;
  };
  const audits = () => inspectMemoryDb(seed, 'sce_tcsk_audit_logs');
  const rows = (table: string) => inspectMemoryDb(seed, table);
  const seats = async (eventId: EventId) => Object.fromEntries((await readSeating(ctx(admin), eventId)).map((s) => [s.seatCode, s.guestId]));
  const hall = (eventId: EventId) => readEventHall(ctx(admin), eventId);
  return { seed, ctx, run, runWithoutRls, runWith, ok, undo, createEvent, addGuest, audits, rows, seats, hall };
}
