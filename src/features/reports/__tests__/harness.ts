// Runs reports commands through the real pipeline on a memoryDb, as any actor,
// with the real progress, guests and venue commands behind ctx.call and behind
// the figures (plan, roster, booths).

import type { Actor, RequestContext } from '@/core/auth';
import { newId, type DailyReportId, type EventId, type HHmm, type Instant, type IsoDate, type Vnd } from '@/core/brand';
import type { CommandId, CommandResult, InputOf, Inverse, OutputOf } from '@/core/commands';
import { commandLookup, runCommand } from '@/core/commands/pipeline';
import { buildWorkCalendar } from '@/core/dates';
import { memoryDb, type Db } from '@/core/db';
import { inspectMemoryDb } from '@/core/db/memory';
import { testActor, XTDT } from '@/core/testing/actors';
import type { DepartmentName, RsvpStatus } from '@/core/vocab';
import type { GuestDraft } from '@/features/guests';
import { commands as guestCommands } from '@/features/guests/server';
import { commands as progressCommands } from '@/features/progress/server';
import type { BoothStatus } from '@/features/venue';
import { commands as venueCommands } from '@/features/venue/server';
import type { PackageDraft } from '../domain/schemas';
import { commands } from '../server/commands';
import { readClippings, readDailyReports, readPackages, readPressReleases } from '../server/reads';
import { HOLIDAYS, SETTINGS } from './fixtures';

export { SETTINGS };
/** Tue 08/12/2026 08:00 in Hà Nội. */
export const NOW = '2026-12-08T01:00:00.000Z' as Instant;
export const admin = testActor('admin', null);
export const leader = testActor('leader', null);
export const head = testActor('dept_leader', XTDT);
export const staff = testActor('user', XTDT);
export const outsider = testActor('dept_leader', 'Phòng Phát triển doanh nghiệp');

export const ISSUE = { keyHighlight: 'Đã chốt kịch bản chương trình.', blockers: '', signatory: 'Trần Văn Bình', documentNumber: '12/BC-SCE' };

const BLANK_GUEST: GuestDraft = {
  name: 'Khách mời', group: 'DoanhNghiep', title: '', organization: 'Doanh nghiệp', phone: '', email: null, sendMethod: 'direct', inviteStatus: 'sent',
  rsvpStatus: 'pending', rsvpSource: 'manual', substituteName: '', hasBanquet: false, notes: '', masterContactId: null,
};

export function harness(opts: { now?: Instant } = {}) {
  const seed = {
    sce_tcsk_events: [], sce_tcsk_task_groups: [], sce_tcsk_steps: [], sce_tcsk_guests: [], sce_tcsk_seat_assignments: [], sce_tcsk_checkins: [],
    sce_tcsk_booths: [], sce_tcsk_media_clippings: [], sce_tcsk_bidding_packages: [], sce_tcsk_press_releases: [], sce_tcsk_daily_reports: [],
    sce_tcsk_audit_logs: [],
  };
  const lookup = commandLookup({ reports: { commands }, guests: { commands: guestCommands }, venue: { commands: venueCommands }, progress: { commands: progressCommands } });
  const clock = { now: opts.now ?? NOW };
  const calendar = buildWorkCalendar(HOLIDAYS);
  const ctx = (actor: Actor, db: Db = memoryDb(seed, actor)): RequestContext => ({ actor, db, settings: SETTINGS, calendar, now: clock.now });
  const run = <K extends CommandId>(actor: Actor, id: K, input: InputOf<K>) => runCommand(ctx(actor), lookup, id, input) as Promise<CommandResult<OutputOf<K>>>;
  /** As `actor` on a Db that answers like an admin's: whatever is refused here, the command's own authorize refused. */
  const runWithoutRls = <K extends CommandId>(actor: Actor, id: K, input: InputOf<K>) =>
    runCommand(ctx(actor, memoryDb(seed, admin)), lookup, id, input) as Promise<CommandResult<OutputOf<K>>>;
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

  const createEvent = async (o: { department?: DepartmentName; supportingDepartments?: ReadonlyArray<DepartmentName>; eventDate?: string; targetGuests?: number } = {}) => {
    const id = newId<'Event'>();
    await ok(admin, 'progress.createEvent', {
      id,
      draft: {
        name: 'Hội nghị Xúc tiến Đầu tư 2026', type: 'hoi_nghi', eventDate: (o.eventDate ?? '2026-12-15') as IsoDate, eventTime: '08:30' as HHmm, location: 'Hà Nội',
        department: o.department ?? XTDT, supportingDepartments: o.supportingDepartments ?? [], leadPerson: '', budget: null, targetGuests: o.targetGuests ?? 10, note: '', applyStandardTemplate: false,
      },
    });
    return id;
  };
  /** One group of calendar-day steps, `[offsetDays, done]`. */
  const addSteps = async (eventId: EventId, steps: ReadonlyArray<readonly [number, boolean]>) => {
    await ok(admin, 'progress.createGroups', {
      eventId,
      groups: [{
        id: newId<'TaskGroup'>(), phase: 'phase_prepare', name: 'Nhóm 1', leadPerson: '', note: '', sort: 0,
        steps: steps.map(([offsetDays, done], i) => ({
          id: newId<'Step'>(), name: `Bước T-${offsetDays}`, requirement: '', targetPhase: 'before' as const, offsetDays, dayType: 'calendar' as const,
          assignee: '', templateKey: '', subTasks: [], links: [], sort: i, done,
        })),
      }],
    });
  };
  const addGuests = async (eventId: EventId, count: number, rsvpStatus: RsvpStatus = 'pending') => {
    for (let i = 0; i < count; i++) {
      await ok(admin, 'guests.create', {
        eventId, id: newId<'Guest'>(),
        draft: { ...BLANK_GUEST, name: `Khách ${rsvpStatus} ${i}`, rsvpStatus, substituteName: rsvpStatus === 'substituted' ? 'Người thay' : '' },
      });
    }
  };
  let boothNo = 0;
  const addBooth = async (eventId: EventId, status: BoothStatus) => {
    boothNo += 1;
    await ok(admin, 'venue.createBooth', {
      eventId, id: newId<'Booth'>(),
      draft: { code: `A${String(boothNo).padStart(2, '0')}`, size: '3x3', company: status === 'available' ? '' : `Công ty ${boothNo}`, products: '', subsidyPercent: 0, status, contact: '', staff: '' },
    });
  };
  const packageDraft = (code: string, budget: number, winningPrice: number | null): PackageDraft => ({
    code, name: `Gói ${code}`, department: 'Phòng Hành chính - Tổ chức', budget: budget as Vnd, winningPrice: winningPrice === null ? null : (winningPrice as Vnd),
    contractor: null, status: 'Đang thực hiện hợp đồng',
  });
  const addPackage = (eventId: EventId, code: string, budget: number, winningPrice: number | null) =>
    ok(admin, 'reports.createPackage', { eventId, id: newId<'BiddingPackage'>(), draft: packageDraft(code, budget, winningPrice) });
  const issue = (actor: Actor, eventId: EventId, draft = ISSUE, id: DailyReportId = newId<'DailyReport'>()) => run(actor, 'reports.issueDailyReport', { eventId, id, draft });

  const reports = (eventId: EventId) => readDailyReports(ctx(admin), eventId);
  const packages = (eventId: EventId) => readPackages(ctx(admin), eventId);
  const clippings = (eventId: EventId) => readClippings(ctx(admin), eventId);
  const pressReleases = (eventId: EventId) => readPressReleases(ctx(admin), eventId);
  const audits = () => inspectMemoryDb(seed, 'sce_tcsk_audit_logs');
  const rows = (table: string) => inspectMemoryDb(seed, table);
  return {
    seed, clock, ctx, run, runWithoutRls, runWith, ok, undo, createEvent, addSteps, addGuests, addBooth, packageDraft, addPackage, issue,
    reports, packages, clippings, pressReleases, audits, rows,
  };
}
