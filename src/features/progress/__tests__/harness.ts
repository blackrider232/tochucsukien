// Runs progress commands through the real pipeline on a memoryDb, as any actor.

import type { Actor, RequestContext } from '@/core/auth';
import { newId, type EventId, type Instant, type IsoDate, type Version } from '@/core/brand';
import type { CommandId, CommandResult, InputOf, Inverse, OutputOf } from '@/core/commands';
import { commandLookup, runCommand } from '@/core/commands/pipeline';
import { buildWorkCalendar, type Holiday } from '@/core/dates';
import { memoryDb } from '@/core/db';
import { inspectMemoryDb } from '@/core/db/memory';
import { DEFAULT_SETTINGS } from '@/core/settings';
import type { EventDraft } from '../contract';
import { commands } from '../server/commands';
import { readEventPlan } from '../server/reads';

export const HOLIDAYS: Holiday[] = [
  { date: '2026-09-02' as IsoDate, name: 'Quốc khánh', kind: 'holiday' },
  { date: '2027-01-01' as IsoDate, name: 'Tết Dương lịch', kind: 'holiday' },
];
export const SETTINGS = { ...DEFAULT_SETTINGS, version: 1 as Version };
export const NOW = '2026-11-04T02:00:00.000Z' as Instant;

export function draft(overrides: Partial<EventDraft> = {}): EventDraft {
  return {
    name: 'Hội nghị Xúc tiến Đầu tư Hà Nội - Hoa Kỳ 2026',
    type: 'hoi_nghi',
    eventDate: '2026-12-15' as IsoDate,
    eventTime: '08:30' as EventDraft['eventTime'],
    location: 'Trung tâm Hội nghị Quốc tế',
    department: 'Phòng Xúc tiến đầu tư',
    supportingDepartments: [],
    leadPerson: 'Nguyễn Văn A',
    budget: null,
    targetGuests: 150,
    note: '',
    applyStandardTemplate: true,
    ...overrides,
  };
}

export function harness() {
  const seed = { sce_tcsk_events: [], sce_tcsk_task_groups: [], sce_tcsk_steps: [], sce_tcsk_audit_logs: [] };
  const lookup = commandLookup({ progress: { commands } });
  const ctx = (actor: Actor): RequestContext => ({ actor, db: memoryDb(seed, actor), settings: SETTINGS, calendar: buildWorkCalendar(HOLIDAYS), now: NOW });
  const run = <K extends CommandId>(actor: Actor, id: K, input: InputOf<K>) => runCommand(ctx(actor), lookup, id, input) as Promise<CommandResult<OutputOf<K>>>;
  const ok = async <K extends CommandId>(actor: Actor, id: K, input: InputOf<K>) => {
    const r = await run(actor, id, input);
    if (!r.ok) throw new Error(`${id} failed: ${r.kind} ${r.message} ${JSON.stringify(r.fieldErrors ?? {})}`);
    return r;
  };
  const undo = (actor: Actor, inverse: Inverse | undefined) => {
    if (!inverse) throw new Error('no inverse');
    return run(actor, inverse.command, inverse.input as never);
  };
  const createEvent = async (actor: Actor, overrides: Partial<EventDraft> = {}) => {
    const id = newId<'Event'>();
    await ok(actor, 'progress.createEvent', { id, draft: draft(overrides) });
    return id;
  };
  const plan = (actor: Actor, id: EventId) => readEventPlan(ctx(actor), id);
  const audits = () => inspectMemoryDb(seed, 'sce_tcsk_audit_logs');
  const rows = (table: string) => inspectMemoryDb(seed, table);
  return { seed, ctx, run, ok, undo, createEvent, plan, audits, rows };
}
