import { commandLookup, runCommand } from '@/core/commands/pipeline';
import type { SyncReport } from '@/features/comms';
import { cronSystemContext, handleCronSync } from '@/features/comms/server';
import { featureServers } from '@/features/registry-server';

export const dynamic = 'force-dynamic';

const lookup = commandLookup(featureServers);

export function GET(request: Request) {
  return handleCronSync(request, {
    secret: process.env.CRON_SECRET,
    systemContext: cronSystemContext,
    sync: (ctx, eventId) => runCommand(ctx, lookup, 'comms.syncForm', { eventId }) as Promise<import('@/core/commands').CommandResult<SyncReport>>,
  });
}
