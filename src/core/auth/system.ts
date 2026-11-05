// The actor of a scheduled job (a cron route), which no person signs in as, and
// the checks a cron request passes before it gets one. A job is trusted only
// after its bearer CRON_SECRET matches (in constant time) and its replay window
// is free. Its commands then run through the pipeline like anyone's, limited to
// the (command, permission) pairs of SYSTEM_JOBS, and audited as 'system:<job>'.
// Wiring with the service role lives in ./admin.ts and ./cron.ts (server-only).

import { createHash, timingSafeEqual } from 'node:crypto';
import type { Email, Instant, UserId } from '@/core/brand';
import { SYSTEM_JOBS, type SystemJob } from '@/core/permissions';
import type { Actor, RequestContext } from './index';

/** A label for created_by and memoryDb only. Postgres stores system rows with a null actor id. */
export const SYSTEM_ACTOR_ID = '00000000-0000-4000-8000-00000000c205' as UserId;
export const MIN_CRON_SECRET = 32;

/** The profile is a label for screens and memoryDb: role 'user' with no department, and can() refuses `system` anyway. */
export function systemActor(job: SystemJob): Actor {
  return {
    profile: {
      id: SYSTEM_ACTOR_ID,
      email: `system:${job}` as Email,
      fullname: `Hệ thống (${SYSTEM_JOBS[job].label})`,
      role: 'user',
      department: null,
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z' as Instant,
      updatedAt: '2026-01-01T00:00:00.000Z' as Instant,
    },
    aal: 'aal1',
    hasVerifiedTotp: false,
    system: job,
  };
}

const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();

/** Equal-length digests, so the comparison takes the same time whatever was presented. */
export function bearerMatches(header: string | null, secret: string): boolean {
  const presented = header?.startsWith('Bearer ') ? header.slice(7) : '';
  return timingSafeEqual(digest(presented), digest(secret));
}

export interface CronDeps {
  secret: string | undefined;
  /** Claims the job's replay window: false when a run started inside it. */
  startRun(job: SystemJob): Promise<boolean>;
  /** The system context of the job; null when the deployment has no service key. */
  context(job: SystemJob): Promise<RequestContext | null>;
}

export type CronAuthorization = { ok: true; ctx: RequestContext } | { ok: false; response: Response };

const refuse = (status: number, error: string): CronAuthorization => ({
  ok: false,
  response: Response.json({ error }, { status, headers: { 'cache-control': 'no-store' } }),
});

export async function checkCron(request: Request, job: SystemJob, deps: CronDeps): Promise<CronAuthorization> {
  const secret = deps.secret?.trim();
  if (!secret || secret.length < MIN_CRON_SECRET) return refuse(503, `CRON_SECRET chưa được cấu hình (tối thiểu ${MIN_CRON_SECRET} ký tự).`);
  if (!bearerMatches(request.headers.get('authorization'), secret)) return refuse(401, 'unauthorized');
  if (!(await deps.startRun(job))) return refuse(429, 'Tác vụ vừa chạy; lần gọi lặp lại bị bỏ qua.');
  const ctx = await deps.context(job);
  if (!ctx) return refuse(503, 'Chưa cấu hình khóa dịch vụ để chạy tác vụ hệ thống.');
  return { ok: true, ctx };
}

/**
 * The replay window in one process (tests, the dev memory runtime). Production claims it in Postgres
 * (sce_tcsk_start_system_run), since serverless instances share no memory.
 */
export function memoryRunClaims(clock: () => number = Date.now): (job: SystemJob) => Promise<boolean> {
  const started = new Map<SystemJob, number>();
  return async (job) => {
    const now = clock();
    const last = started.get(job);
    if (last !== undefined && now - last < SYSTEM_JOBS[job].minIntervalSeconds * 1000) return false;
    started.set(job, now);
    return true;
  };
}
