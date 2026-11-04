// Runs comms commands through the real pipeline on a memoryDb, with the real
// progress and guests commands behind ctx.call, so a guest effect is the one
// guests would make in the app.

import type { Actor, RequestContext } from '@/core/auth';
import { newId, type EventId, type GuestId, type Instant, type IsoDate, type Version } from '@/core/brand';
import type { CommandId, CommandResult, Inverse, InputOf, OutputOf } from '@/core/commands';
import { commandLookup, runCommand } from '@/core/commands/pipeline';
import { buildWorkCalendar } from '@/core/dates';
import { memoryDb } from '@/core/db';
import { inspectMemoryDb } from '@/core/db/memory';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { testActor, XTDT } from '@/core/testing/actors';
import type { DepartmentName } from '@/core/vocab';
import { commands as guestCommands, readRoster, type GuestDraft } from '@/features/guests/server';
import { commands as progressCommands } from '@/features/progress/server';
import { commands } from '../server/commands';

export const SETTINGS = { ...DEFAULT_SETTINGS, version: 1 as Version };
export const NOW = '2026-11-04T02:00:00.000Z' as Instant;

export const GUEST: GuestDraft = {
  name: 'Nguyễn Văn An', group: 'DoanhNghiep', title: '', organization: 'Công ty A', phone: '', email: null, sendMethod: 'direct',
  inviteStatus: 'pending', rsvpStatus: 'pending', rsvpSource: 'manual', substituteName: '', hasBanquet: false, notes: '', masterContactId: null,
};

export const xtdtUser = testActor('user', XTDT);
export const admin = testActor('admin', null);

export function harness(opts: { now?: Instant } = {}) {
  const seed = {
    sce_tcsk_events: [], sce_tcsk_task_groups: [], sce_tcsk_steps: [], sce_tcsk_guests: [], sce_tcsk_seat_assignments: [], sce_tcsk_checkins: [],
    sce_tcsk_audit_logs: [], sce_tcsk_sender_mailboxes: [], sce_tcsk_rsvp_forms: [], sce_tcsk_rsvp_responses: [], sce_tcsk_email_deliveries: [],
  };
  const clock = { now: opts.now ?? NOW };
  const lookup = commandLookup({ comms: { commands }, guests: { commands: guestCommands }, progress: { commands: progressCommands } });
  const ctx = (actor: Actor): RequestContext => ({ actor, db: memoryDb(seed, actor), settings: SETTINGS, calendar: buildWorkCalendar([]), now: clock.now });
  const run = <K extends CommandId>(actor: Actor, id: K, input: InputOf<K>) => runCommand(ctx(actor), lookup, id, input) as Promise<CommandResult<OutputOf<K>>>;
  /** As `actor`, on a Db that answers like an admin's: whatever is refused is refused by the command, not by emulated RLS. */
  const runWithoutRls = <K extends CommandId>(actor: Actor, id: K, input: InputOf<K>) =>
    runCommand({ ...ctx(actor), db: memoryDb(seed, admin) }, lookup, id, input) as Promise<CommandResult<OutputOf<K>>>;
  const ok = async <K extends CommandId>(actor: Actor, id: K, input: InputOf<K>) => {
    const r = await run(actor, id, input);
    if (!r.ok) throw new Error(`${id} failed: ${r.kind} ${r.message} ${JSON.stringify(r.fieldErrors ?? {})}`);
    return r;
  };
  const undo = (actor: Actor, inv: Inverse | undefined) => {
    if (!inv) throw new Error('no inverse');
    return run(actor, inv.command, inv.input as never);
  };
  const createEvent = async (actor: Actor = xtdtUser, department: DepartmentName = XTDT) => {
    const id = newId<'Event'>();
    await ok(actor, 'progress.createEvent', {
      id,
      draft: {
        name: 'Hội nghị Xúc tiến Đầu tư 2026', type: 'hoi_nghi', eventDate: '2026-12-15' as IsoDate, eventTime: '08:30' as never, location: 'Hà Nội',
        department, supportingDepartments: [], leadPerson: '', budget: null, targetGuests: 150, note: '', applyStandardTemplate: false,
      },
    });
    return id;
  };
  const addGuest = async (eventId: EventId, over: Partial<GuestDraft> = {}, actor: Actor = xtdtUser) => {
    const id = newId<'Guest'>();
    return (await ok(actor, 'guests.create', { eventId, id, draft: { ...GUEST, ...over } })).value;
  };
  const roster = (eventId: EventId) => readRoster(ctx(admin), eventId);
  const guest = async (eventId: EventId, id: GuestId) => (await roster(eventId)).find((g) => g.id === id)!;
  const rows = (table: string) => inspectMemoryDb(seed, table);
  const audits = () => rows('sce_tcsk_audit_logs') as Array<{ action: string; summary: string }>;
  return { seed, clock, ctx, run, runWithoutRls, ok, undo, createEvent, addGuest, roster, guest, rows, audits };
}
