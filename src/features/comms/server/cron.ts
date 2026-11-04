// GET /api/cron/rsvp-sync: syncs every event whose form has auto sync on, on
// the server, whatever page anyone has open (m4a B22, m4c B31). The bearer
// secret is compared in constant time; the sync itself is comms.syncForm run
// through the pipeline, so it has the same checks and audit as "Đồng bộ ngay".

import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestContext } from '@/core/auth';
import { buildWorkCalendar, nowInstant } from '@/core/dates';
import type { EventId } from '@/core/brand';
import type { CommandResult } from '@/core/commands';
import { devMemoryEnabled } from '@/core/dev/mode';
import type { SyncReport } from '../domain/sync-report';
import { formsTable } from './tables';

export interface CronDeps {
  secret: string | undefined;
  /** The actor the cron acts as; null when the deployment has none (contract change request 1). */
  systemContext(): Promise<RequestContext | null>;
  sync(ctx: RequestContext, eventId: EventId): Promise<CommandResult<SyncReport>>;
}

const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();
const MIN_SECRET = 16;

/** Only the dev memory runtime has an actor the cron may act as; see cronSystemContext. */
const hasSystemIdentity = () => devMemoryEnabled();

/**
 * Whether a scheduled call of the route would sync anything: a system identity and a valid CRON_SECRET. The Form
 * screen promises a server sync only then (an external scheduler still has to call the route).
 */
export function serverSyncReady(secret: string | undefined = process.env.CRON_SECRET): boolean {
  return hasSystemIdentity() && (secret?.trim().length ?? 0) >= MIN_SECRET;
}

/** Equal-length digests, so the comparison takes the same time whatever the input. */
export function bearerMatches(header: string | null, secret: string): boolean {
  const presented = header?.startsWith('Bearer ') ? header.slice(7) : '';
  return timingSafeEqual(digest(presented), digest(secret)) && presented.length > 0;
}

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

export async function handleCronSync(request: Request, deps: CronDeps): Promise<Response> {
  const secret = deps.secret?.trim();
  if (!secret || secret.length < MIN_SECRET) return json(503, { error: 'CRON_SECRET chưa được cấu hình (tối thiểu 16 ký tự).' });
  if (!bearerMatches(request.headers.get('authorization'), secret)) return json(401, { error: 'unauthorized' });
  const ctx = await deps.systemContext();
  if (!ctx) return json(503, { error: 'Chưa có tài khoản hệ thống để chạy đồng bộ tự động.' });
  const forms = (await ctx.db.table(formsTable).list({ autoSync: true })).filter((f) => f.sheetCsvUrl);
  const results = [];
  for (const form of forms) {
    const r = await deps.sync(ctx, form.eventId);
    results.push(r.ok ? { eventId: form.eventId, ...r.value } : { eventId: form.eventId, status: 'error', message: r.message });
  }
  return json(200, { synced: forms.length, results });
}

/**
 * Dev memory runtime: the dev admin. Production has no service identity a request handler may use yet (only the
 * import script holds the service role), so it answers null and the route says so; see contract change request 1.
 */
export async function cronSystemContext(): Promise<RequestContext | null> {
  if (!hasSystemIdentity()) return null;
  const { devContext } = await import('@/core/dev/runtime');
  const dev = await devContext({ role: 'admin', department: null });
  if (!dev.ok) return null;
  return { actor: dev.actor, db: dev.db, settings: dev.settings, calendar: buildWorkCalendar(dev.holidays), now: nowInstant() };
}
