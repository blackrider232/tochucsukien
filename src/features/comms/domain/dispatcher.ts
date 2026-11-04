// The send loop: one message at a time, spaced, with retry and backoff for
// rate limits and server errors, a clean stop on cancel, an expired token or
// the daily quota, and a report that names every recipient exactly once as
// sent, failed, unknown or skipped (m4a B28, m4c B45, B49). A send whose
// answer never came (the connection dropped) may have gone: it is never
// retried, it is recorded as unknown for a person to check, and the run stops. Each outcome is recorded
// before the next message goes, so a closed tab loses at most the message in
// flight. No sleep after the last message.

/**
 * claim_lost: the run no longer holds the next recipient's claim (another run took it over), so nothing more may go.
 * network: no usable answer from Gmail, so the message may or may not have been sent.
 */
export type SendFailureKind = 'auth' | 'quota' | 'claim_lost' | 'rate' | 'server' | 'network' | 'invalid' | 'too_large';
export interface SendFailure {
  kind: SendFailureKind;
  message: string;
  /** From Retry-After, when the server sent one. */
  retryAfterMs?: number;
}
export class TransportError extends Error {
  constructor(readonly failure: SendFailure) {
    super(failure.message);
  }
}

export type SkipReason = 'cancelled' | 'auth' | 'quota' | 'claim_lost' | 'unknown' | 'not_recorded';
export type DispatchOutcome<R> =
  | { kind: 'sent'; recipient: R; messageId: string }
  | { kind: 'failed'; recipient: R; failure: SendFailure; attempts: number }
  | { kind: 'unknown'; recipient: R; failure: SendFailure };

export interface DispatchReport<R> {
  sent: ReadonlyArray<{ recipient: R; messageId: string }>;
  failed: ReadonlyArray<{ recipient: R; failure: SendFailure }>;
  /** Gmail's answer was lost: maybe sent. Recorded as such and never sent again without a person's check. */
  unknown: ReadonlyArray<{ recipient: R; failure: SendFailure }>;
  skipped: ReadonlyArray<{ recipient: R; reason: SkipReason }>;
  /** Sent, but recording the result failed; the loop stopped there (sending more would leave more unrecorded). */
  unrecorded: ReadonlyArray<{ recipient: R; messageId: string }>;
  stoppedBy: Exclude<SkipReason, 'not_recorded'> | 'record' | null;
}

export interface DispatchOptions<R> {
  recipients: ReadonlyArray<R>;
  send(recipient: R): Promise<{ messageId: string }>;
  /** Persists one outcome (a delivery row). Throwing stops the loop. */
  record(outcome: DispatchOutcome<R>): Promise<void>;
  onProgress?(done: number, total: number, current: R | null): void;
  signal: AbortSignal;
  /** Resolves after ms, or early when the signal aborts. */
  sleep(ms: number, signal: AbortSignal): Promise<void>;
  spacingMs?: number;
  maxRetries?: number;
  backoffBaseMs?: number;
  maxBackoffMs?: number;
}

export const SEND_SPACING_MS = 1200;
const RETRYABLE: ReadonlySet<SendFailureKind> = new Set(['rate', 'server']);
const STOPPING: ReadonlySet<SendFailureKind> = new Set(['auth', 'quota', 'claim_lost']);
type Stop = 'auth' | 'quota' | 'claim_lost';

function failureOf(e: unknown): SendFailure {
  if (e instanceof TransportError) return e.failure;
  return { kind: 'network', message: e instanceof Error ? e.message : String(e) };
}

export async function dispatch<R>(o: DispatchOptions<R>): Promise<DispatchReport<R>> {
  const spacing = o.spacingMs ?? SEND_SPACING_MS;
  const maxRetries = o.maxRetries ?? 3;
  const base = o.backoffBaseMs ?? 2000;
  const maxBackoff = o.maxBackoffMs ?? 60_000;
  const sent: { recipient: R; messageId: string }[] = [];
  const failed: { recipient: R; failure: SendFailure }[] = [];
  const unknown: { recipient: R; failure: SendFailure }[] = [];
  const skipped: { recipient: R; reason: SkipReason }[] = [];
  const unrecorded: { recipient: R; messageId: string }[] = [];
  let stoppedBy: DispatchReport<R>['stoppedBy'] = null;

  const skipFrom = (i: number, reason: SkipReason) => {
    for (const recipient of o.recipients.slice(i)) skipped.push({ recipient, reason });
  };

  for (let i = 0; i < o.recipients.length; i += 1) {
    const recipient = o.recipients[i]!;
    if (o.signal.aborted) {
      stoppedBy = 'cancelled';
      skipFrom(i, 'cancelled');
      break;
    }
    o.onProgress?.(i, o.recipients.length, recipient);

    let outcome: DispatchOutcome<R> | null = null;
    let stop: Stop | 'cancelled' | null = null;
    for (let attempt = 1; ; attempt += 1) {
      try {
        const { messageId } = await o.send(recipient);
        outcome = { kind: 'sent', recipient, messageId };
        break;
      } catch (e) {
        const failure = failureOf(e);
        if (STOPPING.has(failure.kind)) {
          stop = failure.kind as Stop;
          break;
        }
        if (failure.kind === 'network') {
          outcome = { kind: 'unknown', recipient, failure };
          break;
        }
        if (!RETRYABLE.has(failure.kind) || attempt > maxRetries) {
          outcome = { kind: 'failed', recipient, failure, attempts: attempt };
          break;
        }
        await o.sleep(failure.retryAfterMs ?? Math.min(maxBackoff, base * 2 ** (attempt - 1)), o.signal);
        if (o.signal.aborted) {
          stop = 'cancelled';
          break;
        }
      }
    }

    if (stop) {
      stoppedBy = stop;
      skipFrom(i, stop);
      break;
    }
    const done = outcome!;
    const keep = () => {
      if (done.kind === 'sent') sent.push({ recipient, messageId: done.messageId });
      else (done.kind === 'unknown' ? unknown : failed).push({ recipient, failure: done.failure });
    };
    try {
      await o.record(done);
    } catch {
      if (done.kind === 'sent') unrecorded.push({ recipient, messageId: done.messageId });
      else keep();
      stoppedBy = 'record';
      skipFrom(i + 1, 'not_recorded');
      break;
    }
    keep();
    if (done.kind === 'unknown') {
      stoppedBy = 'unknown';
      skipFrom(i + 1, 'unknown');
      break;
    }

    if (i < o.recipients.length - 1) await o.sleep(spacing, o.signal);
  }
  o.onProgress?.(sent.length + failed.length + unknown.length + unrecorded.length, o.recipients.length, null);
  return { sent, failed, unknown, skipped, unrecorded, stoppedBy };
}

/** Sleep that ends early on abort; the default for the browser. */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done);
  });
}
