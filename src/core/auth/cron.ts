// Server-only (through ./admin). What a cron route handler calls: authorizeCron()
// checks the bearer CRON_SECRET and the job's replay window and hands back the
// job's system context; runCommandAsSystem() runs a command in it through the
// pipeline with the job's audit writer. Not re-exported from @/core/auth/server:
// it imports the feature registry, and feature server code imports that entry.

import type { CommandId, CommandResult, InputOf, OutputOf } from '@/core/commands';
import { commandLookup, runCommand } from '@/core/commands/pipeline';
import type { SystemJob } from '@/core/permissions';
import { featureServers } from '@/features/registry-server';
import { startSystemRun, systemAuditWriter, systemContext } from './admin';
import type { RequestContext } from './index';
import { checkCron, type CronAuthorization } from './system';

const lookup = commandLookup(featureServers);

/** 503 without a CRON_SECRET of 32+ characters or a service key, 401 on a wrong bearer, 429 inside the replay window. */
export function authorizeCron(request: Request, job: SystemJob): Promise<CronAuthorization> {
  return checkCron(request, job, { secret: process.env.CRON_SECRET, startRun: startSystemRun, context: systemContext });
}

/** `ctx` must be the context authorizeCron() gave for `job`; the pipeline then allows only the job's own commands. */
export async function runCommandAsSystem<K extends CommandId>(job: SystemJob, ctx: RequestContext, id: K, input: InputOf<K>): Promise<CommandResult<OutputOf<K>>> {
  if (ctx.actor.system !== job) throw new Error(`runCommandAsSystem(${job}) needs the context authorizeCron gave for that job`);
  return (await runCommand(ctx, lookup, id, input, systemAuditWriter(job, ctx.db))) as CommandResult<OutputOf<K>>;
}
