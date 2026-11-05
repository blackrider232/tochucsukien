// What /api/cron/rsvp-sync does once core has authorized the call: syncs every
// event whose form has auto sync on, on the server, whatever page anyone has
// open (m4a B22, m4c B31). The route answers the bearer secret, the replay
// window and the missing service key through core's authorizeCron; the sync
// itself is comms.syncForm run as the 'rsvp-sync' system actor through the
// pipeline, so it has the same checks and audit as "Đồng bộ ngay".

import type { RequestContext } from '@/core/auth';
import type { EventId } from '@/core/brand';
import type { CommandResult } from '@/core/commands';
import { devMemoryEnabled } from '@/core/dev/mode';
import type { SyncReport } from '../domain/sync-report';
import { formsTable } from './tables';

export interface CronDeps {
  /** The context authorizeCron gave for the 'rsvp-sync' job. */
  ctx: RequestContext;
  sync(ctx: RequestContext, eventId: EventId): Promise<CommandResult<SyncReport>>;
}

/** Core's minimum for CRON_SECRET (MIN_CRON_SECRET in core/auth/system.ts, which a feature may not import). */
const MIN_CRON_SECRET = 32;

/**
 * Whether the route would run a scheduled call here: a CRON_SECRET core accepts and somewhere to act (the service key,
 * or the dev memory runtime). The Form screen promises a server sync only then; an external scheduler still has to
 * call the route. Only names whether values are present, never what they are.
 */
export function serverSyncReady(env: Record<string, string | undefined> = process.env): boolean {
  return (env.CRON_SECRET?.trim().length ?? 0) >= MIN_CRON_SECRET && (devMemoryEnabled() || Boolean(env.SUPABASE_SERVICE_ROLE_KEY));
}

export async function handleCronSync({ ctx, sync }: CronDeps): Promise<Response> {
  const forms = (await ctx.db.table(formsTable).list({ autoSync: true })).filter((f) => f.sheetCsvUrl);
  const results = [];
  for (const form of forms) {
    const r = await sync(ctx, form.eventId);
    results.push(r.ok ? { eventId: form.eventId, ...r.value } : { eventId: form.eventId, status: 'error', message: r.message });
  }
  return Response.json({ synced: forms.length, results }, { headers: { 'cache-control': 'no-store' } });
}
