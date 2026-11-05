import { authorizeCron, runCommandAsSystem } from '@/core/auth/cron';
import { handleCronSync } from '@/features/comms/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeCron(request, 'rsvp-sync');
  if (!auth.ok) return auth.response;
  return handleCronSync({ ctx: auth.ctx, sync: (ctx, eventId) => runCommandAsSystem('rsvp-sync', ctx, 'comms.syncForm', { eventId }) });
}
