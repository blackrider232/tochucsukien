// Server-only (the import below fails a client build). The one module that holds the service-role client, and it never
// exports it. The service role creates auth users so the calling admin's own
// session is untouched (core B8); the DB trigger then inserts a pending 'user'
// profile, and core.users.create sets role, department and status through the
// profile functions, as the admin, so those re-check and audit. It also writes
// the command pipeline's audit rows, which no user JWT may write, and gives a
// scheduled job its context, run claim and audit writer (./cron.ts).

import 'next/dist/compiled/server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Email, UserId, Version } from '@/core/brand';
import { buildWorkCalendar, nowInstant } from '@/core/dates';
import { DbError, supabaseDb, type AuditWriter, type Db } from '@/core/db';
import { memoryAuditWriter, supabaseAuditWriter } from '@/core/db/audit-writers';
import { translatePgError } from '@/core/db/supabase';
import { devActor, devIdentity, devMemoryEnabled } from '@/core/dev/mode';
import { devContext, devDb } from '@/core/dev/runtime';
import { systemGrant, type SystemJob } from '@/core/permissions';
import { DEFAULT_SETTINGS, parseSettingsRow } from '@/core/settings';
import type { DepartmentName } from '@/core/vocab';
import { requireSupabaseEnv } from './env';
import type { Actor, RequestContext } from './index';
import { parseHolidayRows } from './profile';
import { memoryRunClaims, systemActor } from './system';

let service: SupabaseClient | null = null;

/** No session and no storage: every call carries the service key. `unavailable` without SUPABASE_SERVICE_ROLE_KEY. */
function serviceClient(): SupabaseClient {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new DbError('unavailable', { table: 'service_role' });
  service ??= createClient(requireSupabaseEnv().url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return service;
}

/**
 * The audit writer dispatch hands to runCommand for this request's Db: the dev memory runtime's own store, or the
 * service role. Null without SUPABASE_SERVICE_ROLE_KEY, so a mutation is refused before it runs rather than saved
 * without its row. Only dispatch calls it (audit-guards.test.ts).
 */
export function commandAuditWriter(db: Db): AuditWriter | null {
  if (devMemoryEnabled()) return memoryAuditWriter(db);
  return process.env.SUPABASE_SERVICE_ROLE_KEY ? supabaseAuditWriter(serviceClient) : null;
}

export async function createAuthUser(input: { email: Email; password: string; fullname: string; department: DepartmentName }): Promise<UserId> {
  const { data, error } = await serviceClient().auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { fullname: input.fullname, department: input.department },
  });
  if (error || !data.user) {
    if (error?.code === 'email_exists' || error?.status === 422) throw new DbError('constraint', { table: 'auth.users', constraint: 'email_exists' });
    throw new DbError('unavailable', { table: 'auth.users' });
  }
  return data.user.id as UserId;
}

/**
 * The audit writer of a scheduled job's commands: rows name 'system:<job>' and no person. Only `job`'s own actor and
 * the (command, permission) pairs SYSTEM_JOBS lists for it pass; sce_tcsk_audit_system re-checks them, the event and
 * the action in SQL. Over a memoryDb (tests, dev) the row goes through the memory writer as an admin at AAL2 named
 * 'system:<job>', the way that Db stands in for the service role. Null without a store or the service key.
 */
export function systemAuditWriter(job: SystemJob, db: Db): AuditWriter | null {
  const checked = (write: AuditWriter): AuditWriter => async (actor, row) => {
    if (actor.system !== job || systemGrant(job, row.command) !== row.perm) throw new DbError('forbidden', { table: 'sce_tcsk_audit_logs' });
    await write(actor, row);
  };
  const memory = memoryAuditWriter(db);
  if (memory) return checked((actor, row) => memory(serviceStandIn(actor), row));
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return checked(async (_actor, row) => {
    const { error, status } = await serviceClient().rpc('sce_tcsk_audit_system', {
      job, command: row.command, perm: row.perm, action: row.action, summary: row.summary, event_id: row.eventId, entity: row.entity, entity_id: row.entityId,
    });
    if (error) throw translatePgError(error, status, 'sce_tcsk_audit_logs');
  });
}

/** memoryDb's stand-in for the service role: sees past RLS, keeps the system actor's id and email on what it writes. */
const serviceStandIn = (system: Actor): Actor => ({ profile: { ...system.profile, role: 'admin' }, aal: 'aal2', hasVerifiedTotp: true });

const devRunClaims = memoryRunClaims();

/** Claims `job`'s replay window: false when a run started inside it (sce_tcsk_start_system_run, which audits each start). */
export async function startSystemRun(job: SystemJob): Promise<boolean> {
  if (devMemoryEnabled()) return devRunClaims(job);
  const { data, error, status } = await serviceClient().rpc('sce_tcsk_start_system_run', { job });
  if (error) throw translatePgError(error, status, 'sce_tcsk_audit_logs');
  return data === true;
}

/**
 * The context `job` runs in: its system actor, and a Db over the service role, which bypasses RLS, so the pipeline's
 * job table is the only limit on its commands. Dev memory runs it on the shared store as the dev admin. Null without
 * SUPABASE_SERVICE_ROLE_KEY.
 */
export async function systemContext(job: SystemJob): Promise<RequestContext | null> {
  const actor = systemActor(job);
  if (devMemoryEnabled()) {
    const dev = await devContext(devIdentity('admin'));
    if (!dev.ok) return null;
    return { actor, db: await devDb(devActor(devIdentity('admin'))), settings: dev.settings, calendar: buildWorkCalendar(dev.holidays), now: nowInstant() };
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const client = serviceClient();
  const [settingsRes, holidaysRes] = await Promise.all([
    client.from('sce_tcsk_system_settings').select('*').eq('id', 1).maybeSingle(),
    client.from('sce_tcsk_holidays').select('holiday_date, name, kind').order('holiday_date'),
  ]);
  if (settingsRes.error || holidaysRes.error) throw new Error('settings or holidays read failed');
  const settings = settingsRes.data ? parseSettingsRow(settingsRes.data) : { ...DEFAULT_SETTINGS, version: 0 as Version };
  return { actor, db: supabaseDb(client, actor), settings, calendar: buildWorkCalendar(parseHolidayRows(holidaysRes.data)), now: nowInstant() };
}
