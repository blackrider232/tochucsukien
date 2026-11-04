// Runs directory commands through the real pipeline on a memoryDb, as any actor.
// guests and progress are the real commands: events come from progress, and a
// copy into an event lands through guests.upsertMany.

import type { Actor, RequestContext } from '@/core/auth';
import { newId, type ContactId, type EventId, type Instant, type IsoDate, type Version } from '@/core/brand';
import type { CommandId, CommandResult, InputOf, Inverse, OutputOf } from '@/core/commands';
import { commandLookup, runCommand } from '@/core/commands/pipeline';
import { buildWorkCalendar } from '@/core/dates';
import { memoryDb } from '@/core/db';
import { inspectMemoryDb } from '@/core/db/memory';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { testActor, XTDT } from '@/core/testing/actors';
import type { DepartmentName } from '@/core/vocab';
import { commands as guestsCommands, readRoster } from '@/features/guests/server';
import { commands as progressCommands } from '@/features/progress/server';
import { NEW_CONTACT_DEFAULTS, type ContactDraft } from '../domain/schemas';
import { commands } from '../server/commands';
import { searchContacts } from '../server/reads';

export const SETTINGS = { ...DEFAULT_SETTINGS, version: 1 as Version };
export const NOW = '2026-11-04T02:00:00.000Z' as Instant;
export const admin = testActor('admin', null);
export const leader = testActor('leader', null);
export const deptLeader = testActor('dept_leader', XTDT);
export const staff = testActor('user', XTDT);

export function draft(overrides: Partial<ContactDraft> = {}): ContactDraft {
  return { ...NEW_CONTACT_DEFAULTS, name: 'Nguyễn Văn An', organization: 'Sở Tài chính Hà Nội', hasBanquet: false, ...overrides };
}

export function harness() {
  const seed = {
    sce_tcsk_master_contacts: [], sce_tcsk_events: [], sce_tcsk_task_groups: [], sce_tcsk_steps: [], sce_tcsk_guests: [],
    sce_tcsk_seat_assignments: [], sce_tcsk_checkins: [], sce_tcsk_audit_logs: [], sce_tcsk_backups: [],
  };
  const lookup = commandLookup({ directory: { commands }, guests: { commands: guestsCommands }, progress: { commands: progressCommands } });
  const ctx = (actor: Actor): RequestContext => ({ actor, db: memoryDb(seed, actor), settings: SETTINGS, calendar: buildWorkCalendar([]), now: NOW });
  const run = <K extends CommandId>(actor: Actor, id: K, input: InputOf<K>) => runCommand(ctx(actor), lookup, id, input) as Promise<CommandResult<OutputOf<K>>>;
  /**
   * Runs as `actor` against a Db that answers like an admin's, so row-level security lets everything through.
   * Whatever is refused here is refused by the command's own authorize and checks, not by the emulated RLS.
   */
  const runWithoutRls = <K extends CommandId>(actor: Actor, id: K, input: InputOf<K>) =>
    runCommand({ ...ctx(actor), db: memoryDb(seed, admin) }, lookup, id, input) as Promise<CommandResult<OutputOf<K>>>;
  const ok = async <K extends CommandId>(actor: Actor, id: K, input: InputOf<K>) => {
    const r = await run(actor, id, input);
    if (!r.ok) throw new Error(`${id} failed: ${r.kind} ${r.message} ${JSON.stringify(r.fieldErrors ?? {})}`);
    return r;
  };
  const undo = (actor: Actor, inverse: Inverse | undefined) => {
    if (!inverse) throw new Error('no inverse');
    return run(actor, inverse.command, inverse.input as never);
  };
  const addContact = async (overrides: Partial<ContactDraft> = {}, actor: Actor = admin) => {
    const id = newId<'MasterContact'>();
    const r = await ok(actor, 'directory.create', { id, draft: draft(overrides) });
    return r.value;
  };
  const createEvent = async (actor: Actor = staff, department: DepartmentName = XTDT) => {
    const id = newId<'Event'>();
    await ok(actor, 'progress.createEvent', {
      id,
      draft: {
        name: 'Hội nghị Xúc tiến Đầu tư 2026', type: 'hoi_nghi', eventDate: '2026-12-15' as IsoDate, eventTime: '08:30' as never, location: 'Hà Nội',
        department, supportingDepartments: [], leadPerson: '', budget: null, targetGuests: 150, note: '', applyStandardTemplate: false,
      },
    });
    return id as EventId;
  };
  const contacts = (actor: Actor = admin) => searchContacts(ctx(actor), { q: '' }).then((r) => r.items);
  const roster = (eventId: EventId, actor: Actor = admin) => readRoster(ctx(actor), eventId);
  return {
    seed, ctx, run, runWithoutRls, ok, undo, addContact, createEvent, contacts, roster,
    audits: () => inspectMemoryDb(seed, 'sce_tcsk_audit_logs'),
    rows: (table = 'sce_tcsk_master_contacts') => inspectMemoryDb(seed, table),
  };
}

export const cid = () => newId<'MasterContact'>() as ContactId;
