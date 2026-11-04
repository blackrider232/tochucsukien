// Runs core commands through the real pipeline on a memoryDb, as any actor.

import { vi } from 'vitest';
import type { Actor, RequestContext } from '@/core/auth';
import { parseHolidayRows } from '@/core/auth/profile';
import type { Instant, IsoDate, UserId } from '@/core/brand';
import type { CommandId, CommandResult, InputOf, Inverse, OutputOf } from '@/core/commands';
import { commandLookup, runCommand } from '@/core/commands/pipeline';
import { buildWorkCalendar } from '@/core/dates';
import { memoryDb } from '@/core/db';
import { inspectMemoryDb } from '@/core/db/memory';
import { DEFAULT_SETTINGS, parseSettingsRow } from '@/core/settings';
import { testActor, PTDN, XTDT } from '@/core/testing/actors';

export const NEW_USER_ID = '99999999-0000-4000-8000-000000000001' as UserId;
export const createAuthUser = vi.fn(async () => NEW_USER_ID);
vi.mock('@/core/auth/admin', () => ({ createAuthUser: (...args: unknown[]) => createAuthUser(...(args as [])) }));
const { commands } = await import('../server/commands');

export const NOW = '2026-11-04T02:00:00.000Z' as Instant;

export const actors = {
  admin: testActor('admin', null),
  admin2: testActor('admin', null),
  leader: testActor('leader', 'Ban Giám đốc'),
  xtdtLeader: testActor('dept_leader', XTDT),
  xtdtUser: testActor('user', XTDT),
  ptdnUser: testActor('user', PTDN),
};
export const adminAal1 = { ...actors.admin, aal: 'aal1' } as Actor;
export const pending = testActor('user', XTDT, { status: 'pending' });
export const locked = testActor('user', XTDT, { status: 'locked' });

const profileRow = (a: Actor) => ({
  id: a.profile.id, email: a.profile.email, fullname: a.profile.fullname, role: a.profile.role, department: a.profile.department,
  status: a.profile.status, is_active: a.profile.status === 'active', created_at: a.profile.createdAt, updated_at: a.profile.updatedAt,
});

export function harness(opts: { profiles?: ReadonlyArray<Actor> } = {}) {
  const seed = {
    sce_tcsk_profiles: (opts.profiles ?? [...Object.values(actors), pending, locked]).map(profileRow) as Array<Record<string, unknown>>,
    sce_tcsk_system_settings: [{
      id: 1, agency_name: DEFAULT_SETTINGS.agencyName, agency_short_name: DEFAULT_SETTINGS.agencyShortName, parent_agency: DEFAULT_SETTINGS.parentAgency,
      daily_report_threshold_days: 10, field_presence_hours: 2, guest_quota_percent: 130, badge_quota_percent: 120, google_client_id: null,
      version: 1, updated_at: NOW, updated_by: null,
    }],
    sce_tcsk_holidays: [
      { holiday_date: '2027-01-01', name: 'Tết Dương lịch', kind: 'holiday', updated_at: NOW, updated_by: null },
      { holiday_date: '2027-04-30', name: 'Ngày Giải phóng miền Nam', kind: 'holiday', updated_at: NOW, updated_by: null },
      { holiday_date: '2028-01-01', name: 'Tết Dương lịch', kind: 'holiday', updated_at: NOW, updated_by: null },
    ],
    sce_tcsk_audit_logs: [] as Array<Record<string, unknown>>,
    sce_tcsk_backups: [] as Array<Record<string, unknown>>,
  };
  const lookup = commandLookup({ core: { commands } });
  const rows = (table: string) => inspectMemoryDb(seed, table);
  const settings = () => parseSettingsRow(rows('sce_tcsk_system_settings')[0]);
  const holidays = (year?: number) => parseHolidayRows(rows('sce_tcsk_holidays')).filter((h) => year === undefined || h.date.startsWith(`${year}-`));
  const ctx = (actor: Actor): RequestContext => ({ actor, db: memoryDb(seed, actor), settings: settings(), calendar: buildWorkCalendar(holidays()), now: NOW });
  const run = <K extends CommandId>(actor: Actor, id: K, input: InputOf<K>) => runCommand(ctx(actor), lookup, id, input) as Promise<CommandResult<OutputOf<K>>>;
  /**
   * Runs as `actor` against a Db that answers like an admin's, so the emulated RLS and SQL checks let everything through.
   * Whatever is refused here is refused by the command's own authorize and checks.
   */
  const runWithoutRls = <K extends CommandId>(actor: Actor, id: K, input: InputOf<K>) =>
    runCommand({ ...ctx(actor), db: memoryDb(seed, actors.admin) }, lookup, id, input) as Promise<CommandResult<OutputOf<K>>>;
  const ok = async <K extends CommandId>(actor: Actor, id: K, input: InputOf<K>) => {
    const r = await run(actor, id, input);
    if (!r.ok) throw new Error(`${id} failed: ${r.kind} ${r.message} ${JSON.stringify(r.fieldErrors ?? {})}`);
    return r;
  };
  const undo = (actor: Actor, inverse: Inverse | undefined) => {
    if (!inverse) throw new Error('no inverse');
    return run(actor, inverse.command, inverse.input as never);
  };
  const audits = () => rows('sce_tcsk_audit_logs');
  const profile = (a: Actor) => rows('sce_tcsk_profiles').find((p) => p.id === a.profile.id)!;
  return { seed, ctx, run, runWithoutRls, ok, undo, rows, audits, settings, holidays, profile };
}

export const day = (s: string) => s as IsoDate;
