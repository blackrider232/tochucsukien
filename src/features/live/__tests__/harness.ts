// Runs live commands through the real pipeline on a memoryDb, as any actor,
// with the real progress, guests and venue commands behind ctx.call.

import type { Actor, RequestContext } from '@/core/auth';
import { newId, type EventId, type GuestId, type HHmm, type Instant, type IsoDate, type SeatCode, type Version } from '@/core/brand';
import type { CommandId, CommandResult, InputOf, Inverse, OutputOf } from '@/core/commands';
import { commandLookup, runCommand } from '@/core/commands/pipeline';
import { buildWorkCalendar } from '@/core/dates';
import { memoryDb, type Db } from '@/core/db';
import { inspectMemoryDb } from '@/core/db/memory';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { testActor, XTDT } from '@/core/testing/actors';
import type { DepartmentName } from '@/core/vocab';
import type { GuestDraft, RosterEntry } from '@/features/guests';
import { commands as guestCommands, readRoster } from '@/features/guests/server';
import { commands as progressCommands } from '@/features/progress/server';
import type { HallZone } from '@/features/venue';
import { commands as venueCommands } from '@/features/venue/server';
import { commands } from '../server/commands';
import { readCheckIns, readDutyStaff, readIncidents } from '../server/reads';

export const SETTINGS = { ...DEFAULT_SETTINGS, version: 1 as Version };
export const NOW = '2026-12-15T00:45:00.000Z' as Instant;
export const admin = testActor('admin', null);
export const desk = testActor('user', XTDT);
export const other = testActor('user', 'Phòng Phát triển doanh nghiệp');

const BLANK: GuestDraft = {
  name: '', group: 'DoanhNghiep', title: '', organization: '', phone: '', email: null, sendMethod: 'direct', inviteStatus: 'pending',
  rsvpStatus: 'confirmed', rsvpSource: 'manual', substituteName: '', hasBanquet: false, notes: '', masterContactId: null,
};

export const ZONES: HallZone[] = [
  { key: 'A', name: 'Khu A: VIP', prefix: 'A-', seatCount: 2, color: 'red', assignedGroup: 'VIP', vipZone: true },
  { key: 'B', name: 'Khu B: Sở ngành', prefix: 'B-', seatCount: 3, color: 'blue', assignedGroup: 'SoNganh', vipZone: false },
  { key: 'C', name: 'Khu C: Chung', prefix: 'C-', seatCount: 4, color: 'emerald', assignedGroup: 'all', vipZone: false },
];

export function harness(opts: { now?: Instant } = {}) {
  const seed = {
    sce_tcsk_events: [], sce_tcsk_task_groups: [], sce_tcsk_steps: [], sce_tcsk_guests: [], sce_tcsk_seat_assignments: [], sce_tcsk_checkins: [],
    sce_tcsk_duty_staff: [], sce_tcsk_incidents: [], sce_tcsk_hall_templates: [], sce_tcsk_event_halls: [], sce_tcsk_audit_logs: [],
  };
  const lookup = commandLookup({ live: { commands }, guests: { commands: guestCommands }, venue: { commands: venueCommands }, progress: { commands: progressCommands } });
  const clock = { now: opts.now ?? NOW };
  const ctx = (actor: Actor, db: Db = memoryDb(seed, actor)): RequestContext => ({ actor, db, settings: SETTINGS, calendar: buildWorkCalendar([]), now: clock.now });
  const run = <K extends CommandId>(actor: Actor, id: K, input: InputOf<K>) => runCommand(ctx(actor), lookup, id, input) as Promise<CommandResult<OutputOf<K>>>;
  /**
   * Runs as `actor` against a Db that answers like an admin's, so row-level security lets everything through.
   * Whatever is refused here is refused by the command's own authorize and checks, not by the emulated RLS.
   */
  const runWithoutRls = <K extends CommandId>(actor: Actor, id: K, input: InputOf<K>) =>
    runCommand(ctx(actor, memoryDb(seed, admin)), lookup, id, input) as Promise<CommandResult<OutputOf<K>>>;
  /** Runs with the command's Db passed through `wrap`, so a test can let another writer act in the middle of a command. */
  const runWith = <K extends CommandId>(actor: Actor, wrap: (db: Db) => Db, id: K, input: InputOf<K>) =>
    runCommand(ctx(actor, wrap(memoryDb(seed, actor))), lookup, id, input) as Promise<CommandResult<OutputOf<K>>>;
  const ok = async <K extends CommandId>(actor: Actor, id: K, input: InputOf<K>) => {
    const r = await run(actor, id, input);
    if (!r.ok) throw new Error(`${id} failed: ${r.kind} ${r.message} ${JSON.stringify(r.fieldErrors ?? {})}`);
    return r;
  };
  const undo = (actor: Actor, inverse: Inverse | undefined) => {
    if (!inverse) throw new Error('no inverse');
    return run(actor, inverse.command, inverse.input as never);
  };
  const createEvent = async (opts: { department?: DepartmentName; eventDate?: string; eventTime?: string } = {}) => {
    const id = newId<'Event'>();
    await ok(admin, 'progress.createEvent', {
      id,
      draft: {
        name: 'Hội nghị Xúc tiến Đầu tư 2026', type: 'hoi_nghi', eventDate: (opts.eventDate ?? '2026-12-15') as IsoDate, eventTime: (opts.eventTime ?? '08:30') as HHmm,
        location: 'Hà Nội', department: opts.department ?? XTDT, supportingDepartments: [], leadPerson: '', budget: null, targetGuests: 10, note: '', applyStandardTemplate: false,
      },
    });
    return id;
  };
  const addGuest = async (eventId: EventId, overrides: Partial<GuestDraft> = {}) => {
    const r = await ok(admin, 'guests.create', { eventId, id: newId<'Guest'>(), draft: { ...BLANK, name: 'Nguyễn Văn An', organization: 'Sở Tài chính', ...overrides } });
    return r.value;
  };
  const setHall = async (eventId: EventId, zones: HallZone[] = ZONES) => {
    const templateId = newId<'HallTemplate'>();
    await ok(admin, 'venue.createHallTemplate', { id: templateId, draft: { name: 'Hội trường thử', location: '', description: '', zones } });
    await ok(admin, 'venue.setEventHall', { eventId, version: null, templateId, seats: 'release' });
  };
  const seat = (eventId: EventId, guestId: GuestId, seatCode: string) => ok(admin, 'venue.assignSeat', { eventId, guestId, seatCode: seatCode as SeatCode });
  const roster = (eventId: EventId): Promise<ReadonlyArray<RosterEntry>> => readRoster(ctx(admin), eventId);
  const entry = async (eventId: EventId, id: GuestId) => (await roster(eventId)).find((g) => g.id === id)!;
  const checkins = (eventId: EventId) => readCheckIns(ctx(admin), eventId);
  const staff = (eventId: EventId) => readDutyStaff(ctx(admin), eventId);
  const incidents = (eventId: EventId) => readIncidents(ctx(admin), eventId);
  const audits = () => inspectMemoryDb(seed, 'sce_tcsk_audit_logs');
  const rows = (table: string) => inspectMemoryDb(seed, table);
  return { seed, clock, ctx, run, runWithoutRls, runWith, ok, undo, createEvent, addGuest, setHall, seat, roster, entry, checkins, staff, incidents, audits, rows };
}

/** A Db whose table(name).<method> runs `before` once, the first time it is called: another writer acting mid-command. */
export function interleave(db: Db, table: string, method: 'insert' | 'update' | 'list' | 'remove', before: () => Promise<unknown>, nth = 1): Db {
  let calls = 0;
  return {
    rpc: db.rpc.bind(db),
    table(def) {
      const t = db.table(def);
      if (def.name !== table) return t;
      const original = t[method].bind(t) as (...a: unknown[]) => Promise<unknown>;
      return {
        ...t,
        [method]: async (...args: unknown[]) => {
          calls += 1;
          if (calls === nth) await before();
          return original(...args);
        },
      } as typeof t;
    },
  };
}
