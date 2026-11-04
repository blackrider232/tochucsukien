// Server-only. The dev memory runtime: one process-wide memoryDb that
// requestContext() serves when devMemoryEnabled(), seeded once by every
// feature's optional devSeed in registry order. Each export goes through
// runtimeHolder(), which throws outside dev memory mode, so no seed or fixture
// can run in production. See docs/rewrite/dev-runtime.md.

import { createHash } from 'node:crypto';
import type { Instant, Uuid } from '@/core/brand';
import type { Actor } from '@/core/auth';
import { gateFor } from '@/core/auth/gate';
import { parseHolidayRows } from '@/core/auth/profile';
import { nowInstant, type Holiday } from '@/core/dates';
import { memoryDb, type Db } from '@/core/db';
import { inspectMemoryDb } from '@/core/db/memory';
import { registry, type FeatureKey } from '@/core/registry';
import { DEFAULT_SETTINGS, parseSettingsRow, type SystemSettings } from '@/core/settings';
import { DEPARTMENTS, type DepartmentName } from '@/core/vocab';
import { assertDevMemory, DEV_ROLES, devActor, devIdentity, type DevIdentity, type DevRole } from './mode';

export interface DevSeedHelpers {
  /** A Db acting as another dev identity, e.g. so a row's created_by is a chuyên viên. */
  as(role: DevRole, department?: DepartmentName): Db;
  actor(role: DevRole, department?: DepartmentName): Actor;
  /** The same uuid on every reset, so a bookmarked /events/<id>/... URL keeps working. */
  id<E extends string>(entity: E, key: string): Uuid<E>;
  now: Instant;
}

/** Optional on a feature's server record. Gets an admin Db; writes go through the same RLS as the app. */
export type DevSeed = (db: Db, helpers: DevSeedHelpers) => Promise<void>;

type Rows = Array<Record<string, unknown>>;
type Seed = Readonly<Record<string, Rows>>;

interface DevRuntime {
  seed: Seed;
  ready: Promise<void>;
}

const HOLDER = Symbol.for('sce.devRuntime');
type Holder = { current: DevRuntime | null };

/** The single entry point. On globalThis so a hot reload of this module keeps the data. */
function runtimeHolder(): Holder {
  assertDevMemory();
  const g = globalThis as { [HOLDER]?: Holder };
  return (g[HOLDER] ??= { current: null });
}

const FIXED_HOLIDAYS: ReadonlyArray<[month: number, day: number, name: string]> = [
  [1, 1, 'Tết Dương lịch'],
  [4, 30, 'Ngày Giải phóng miền Nam'],
  [5, 1, 'Ngày Quốc tế Lao động'],
  [9, 2, 'Quốc khánh'],
];

/** What the migrations seed (departments, settings row, 0005 holidays) plus one profile per dev role. */
function baseSeed(): Seed {
  const at = '2026-01-01T00:00:00.000Z';
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    sce_tcsk_departments: DEPARTMENTS.map((d, i) => ({
      name: d.name, code: d.code, short_name: d.shortName, duty: d.duty, self_registerable: d.selfRegisterable, can_chair_events: d.canChairEvents, sort: i + 1,
    })),
    sce_tcsk_system_settings: [{
      id: 1, agency_name: DEFAULT_SETTINGS.agencyName, agency_short_name: DEFAULT_SETTINGS.agencyShortName, parent_agency: DEFAULT_SETTINGS.parentAgency,
      daily_report_threshold_days: DEFAULT_SETTINGS.dailyReportThresholdDays, field_presence_hours: DEFAULT_SETTINGS.fieldPresenceHours,
      guest_quota_percent: DEFAULT_SETTINGS.guestQuotaPercent, badge_quota_percent: DEFAULT_SETTINGS.badgeQuotaPercent,
      google_client_id: DEFAULT_SETTINGS.googleClientId, version: 1, updated_at: at, updated_by: null,
    }],
    sce_tcsk_holidays: [2026, 2027].flatMap((y) =>
      FIXED_HOLIDAYS.map(([m, d, name]) => ({ holiday_date: `${y}-${pad(m)}-${pad(d)}`, name, kind: 'holiday', updated_at: at, updated_by: null })),
    ),
    sce_tcsk_profiles: DEV_ROLES.map((role) => {
      const { profile } = devActor(devIdentity(role));
      return {
        id: profile.id, email: profile.email, fullname: profile.fullname, role: profile.role, department: profile.department,
        status: profile.status, is_active: profile.status === 'active', created_at: at, updated_at: at,
      };
    }),
  };
}

function stableId<E extends string>(entity: E, key: string): Uuid<E> {
  const h = createHash('sha256').update(`sce-dev|${entity}|${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}` as Uuid<E>;
}

/** Registry (manifest) order, which is the features' dependency order: core, progress, templates, ... */
async function featureSeeds(): Promise<Array<[FeatureKey, DevSeed]>> {
  // Imported lazily: feature server code imports @/core/auth/server, which imports this module.
  const { featureServers } = await import('@/features/registry-server');
  return registry.manifests.flatMap((m): Array<[FeatureKey, DevSeed]> => {
    const devSeed = featureServers[m.key].devSeed;
    return devSeed ? [[m.key, devSeed]] : [];
  });
}

function start(holder: Holder): DevRuntime {
  const seed = baseSeed();
  const actor = (role: DevRole, department?: DepartmentName) => devActor(devIdentity(role, department));
  const helpers: DevSeedHelpers = { as: (role, dept) => memoryDb(seed, actor(role, dept)), actor, id: stableId, now: nowInstant() };
  const ready = (async () => {
    for (const [key, devSeed] of await featureSeeds()) {
      try {
        await devSeed(memoryDb(seed, actor('admin')), helpers);
      } catch (cause) {
        throw new Error(`devSeed of feature "${key}" failed`, { cause });
      }
    }
  })();
  const runtime: DevRuntime = { seed, ready };
  // A failed seed is not cached: the next request starts over from an empty database.
  ready.catch(() => {
    if (holder.current === runtime) holder.current = null;
  });
  return runtime;
}

async function seeded(): Promise<Seed> {
  const holder = runtimeHolder();
  const runtime = (holder.current ??= start(holder));
  await runtime.ready;
  return runtime.seed;
}

/** Drops every row and runs the seeds again. GET or POST /dev/reset. */
export async function resetDevRuntime(): Promise<void> {
  const holder = runtimeHolder();
  holder.current = start(holder);
  await holder.current.ready;
}

/** A Db on the shared dev database, acting as `actor`. */
export async function devDb(actor: Actor): Promise<Db> {
  return memoryDb(await seeded(), actor);
}

export type DevContext =
  | { ok: true; actor: Actor; db: Db; settings: SystemSettings; holidays: ReadonlyArray<Holiday> }
  | { ok: false; gate: 'pending' | 'locked' };

/** What loadRequestContext() needs for the dev identity in the sce_dev_role cookie. */
export async function devContext(identity: DevIdentity): Promise<DevContext> {
  const seed = await seeded();
  const actor = devActor(identity);
  const gate = gateFor({ hasSession: true, profile: actor.profile, aal: actor.aal, hasVerifiedTotp: actor.hasVerifiedTotp });
  if (gate.kind === 'pending' || gate.kind === 'locked') return { ok: false, gate: gate.kind };
  if (gate.kind !== 'ok') throw new Error(`dev actor ${identity.role} hit gate ${gate.kind}`);
  const holidays = parseHolidayRows(inspectMemoryDb(seed, 'sce_tcsk_holidays'));
  return { ok: true, actor, db: memoryDb(seed, actor), settings: parseSettingsRow(inspectMemoryDb(seed, 'sce_tcsk_system_settings')[0]), holidays };
}
