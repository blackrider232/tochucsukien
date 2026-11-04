import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Email } from '@/core/brand';
import { abortableSleep, dispatch, TransportError, type DispatchOutcome, type SendFailureKind } from '../domain/dispatcher';
import { MAX_RAW_MESSAGE_BYTES, prepareAttachment, type MailMessage } from '../domain/mime';
import { fakeTransport, gmailTransport, GMAIL_SEND_URL } from '../domain/transport';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const fail = (kind: SendFailureKind, retryAfterMs?: number) => new TransportError({ kind, message: kind, retryAfterMs });

/** Runs a dispatch to its end while advancing fake time; returns the report and the instants each send happened. */
async function run(recipients: string[], behaviour: (r: string, attempt: number) => 'ok' | TransportError, opts: { cancelAfter?: number; recordFails?: string; recordFailsOnce?: string } = {}) {
  const failedOnce = new Set<string>();
  const attempts = new Map<string, number>();
  const sendTimes: Array<[string, number]> = [];
  const recorded: DispatchOutcome<string>[] = [];
  const controller = new AbortController();
  const start = Date.now();
  const done = dispatch({
    recipients,
    signal: controller.signal,
    sleep: abortableSleep,
    async send(r) {
      const n = (attempts.get(r) ?? 0) + 1;
      attempts.set(r, n);
      sendTimes.push([r, Date.now() - start]);
      const outcome = behaviour(r, n);
      if (outcome !== 'ok') throw outcome;
      if (opts.cancelAfter !== undefined && sendTimes.length === opts.cancelAfter) controller.abort();
      return { messageId: `id-${r}` };
    },
    async record(o) {
      if (o.recipient === opts.recordFails) throw new Error('db down');
      if (o.recipient === opts.recordFailsOnce && !failedOnce.has(o.recipient)) {
        failedOnce.add(o.recipient);
        throw new Error('db down');
      }
      recorded.push(o);
    },
  });
  await vi.runAllTimersAsync();
  return { report: await done, sendTimes, recorded, attempts };
}

describe('dispatch', () => {
  it('spaces messages 1.2 s apart and does not wait after the last one', async () => {
    const { report, sendTimes } = await run(['a', 'b', 'c'], () => 'ok');
    expect(sendTimes).toEqual([['a', 0], ['b', 1200], ['c', 2400]]);
    expect(report.sent.map((s) => s.recipient)).toEqual(['a', 'b', 'c']);
    expect(report.stoppedBy).toBeNull();
  });

  it('retries a 429 with exponential backoff, honouring Retry-After, then succeeds', async () => {
    const { report, sendTimes } = await run(['a', 'b'], (r, n) => (r === 'a' && n === 1 ? fail('rate', 5000) : r === 'a' && n === 2 ? fail('server') : 'ok'));
    // a: 0, Retry-After 5 s -> 5000, then backoff 2 s * 2^1 = 4 s -> 9000; b after the 1.2 s spacing.
    expect(sendTimes).toEqual([['a', 0], ['a', 5000], ['a', 9000], ['b', 10200]]);
    expect(report.sent).toHaveLength(2);
  });

  it('gives up after the retries and reports that one recipient as failed, the rest still sent', async () => {
    const { report, attempts, recorded } = await run(['a', 'b', 'c'], (r) => (r === 'b' ? fail('server') : 'ok'));
    expect(attempts.get('b')).toBe(4);
    expect(report.sent.map((s) => s.recipient)).toEqual(['a', 'c']);
    expect(report.failed.map((f) => [f.recipient, f.failure.kind])).toEqual([['b', 'server']]);
    expect(recorded.map((o) => [o.recipient, o.kind])).toEqual([['a', 'sent'], ['b', 'failed'], ['c', 'sent']]);
  });

  it('never retries a send whose answer was lost: it may have gone, so it is recorded as unknown and the run stops', async () => {
    const { report, attempts, recorded } = await run(['a', 'b', 'c'], (r) => (r === 'b' ? fail('network') : 'ok'));
    expect(attempts.get('b')).toBe(1);
    expect(report.sent.map((s) => s.recipient)).toEqual(['a']);
    expect(report.unknown.map((u) => u.recipient)).toEqual(['b']);
    expect(report.failed).toEqual([]);
    expect(report.skipped).toEqual([{ recipient: 'c', reason: 'unknown' }]);
    expect(report.stoppedBy).toBe('unknown');
    expect(recorded.map((o) => [o.recipient, o.kind])).toEqual([['a', 'sent'], ['b', 'unknown']]);
  });

  it('does not retry an invalid address or an oversize message', async () => {
    const { report, attempts } = await run(['a', 'b'], (r) => (r === 'a' ? fail('invalid') : fail('too_large')));
    expect([attempts.get('a'), attempts.get('b')]).toEqual([1, 1]);
    expect(report.failed.map((f) => f.failure.kind)).toEqual(['invalid', 'too_large']);
  });

  it.each(['auth', 'quota'] as const)('stops on %s: the current and remaining recipients are skipped, not failed', async (kind) => {
    const { report, recorded } = await run(['a', 'b', 'c', 'd'], (r) => (r === 'b' ? fail(kind) : 'ok'));
    expect(report.sent.map((s) => s.recipient)).toEqual(['a']);
    expect(report.failed).toEqual([]);
    expect(report.skipped).toEqual([{ recipient: 'b', reason: kind }, { recipient: 'c', reason: kind }, { recipient: 'd', reason: kind }]);
    expect(report.stoppedBy).toBe(kind);
    expect(recorded).toHaveLength(1);
  });

  it('cancels cleanly between messages: nothing after the cancel is sent', async () => {
    const { report, sendTimes } = await run(['a', 'b', 'c'], () => 'ok', { cancelAfter: 1 });
    expect(sendTimes.map(([r]) => r)).toEqual(['a']);
    expect(report.sent.map((s) => s.recipient)).toEqual(['a']);
    expect(report.skipped).toEqual([{ recipient: 'b', reason: 'cancelled' }, { recipient: 'c', reason: 'cancelled' }]);
    expect(report.stoppedBy).toBe('cancelled');
  });

  it('accounts for every recipient exactly once', async () => {
    const recipients = Array.from({ length: 30 }, (_, i) => `r${i}`);
    const { report } = await run(recipients, (r, n) => (r === 'r3' ? fail('invalid') : r === 'r7' && n === 1 ? fail('rate') : r === 'r12' ? fail('network') : 'ok'));
    expect(report.stoppedBy).toBe('unknown');
    const all = [...report.sent, ...report.failed, ...report.unknown, ...report.skipped, ...report.unrecorded].map((x) => x.recipient).sort();
    expect(all).toEqual([...recipients].sort());
  });

  it('tries again to record a send it knows went, and carries on when that works', async () => {
    const { report, recorded } = await run(['a', 'b', 'c'], () => 'ok', { recordFailsOnce: 'b' });
    expect(report.sent.map((s) => s.recipient)).toEqual(['a', 'b', 'c']);
    expect(report.unrecorded).toEqual([]);
    expect(recorded.map((o) => o.recipient)).toEqual(['a', 'b', 'c']);
    expect(report.stoppedBy).toBeNull();
  });

  it('stops when a result cannot be recorded, and names the sent-but-unrecorded recipient', async () => {
    const { report, sendTimes } = await run(['a', 'b', 'c'], () => 'ok', { recordFails: 'b' });
    expect(sendTimes.map(([r]) => r)).toEqual(['a', 'b']);
    expect(report.sent.map((s) => s.recipient)).toEqual(['a']);
    expect(report.unrecorded).toEqual([{ recipient: 'b', messageId: 'id-b' }]);
    expect(report.skipped).toEqual([{ recipient: 'c', reason: 'not_recorded' }]);
    expect(report.stoppedBy).toBe('record');
  });
});

const msg = (over: Partial<MailMessage> = {}): MailMessage => ({
  from: { name: 'BTC', email: 'btc@example.com' as Email },
  to: [{ name: 'An', email: 'an@example.vn' as Email }],
  subject: 'Mời',
  html: '<p>x</p>',
  text: 'x',
  ...over,
});

describe('gmailTransport', () => {
  const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } }));

  it('posts base64url raw with the token in the Authorization header only', async () => {
    const fetchImpl = respond(200, { id: 'msg-1' });
    const t = gmailTransport(() => 'tok-secret', fetchImpl as unknown as typeof fetch);
    await expect(t.send(msg())).resolves.toEqual({ messageId: 'msg-1' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(GMAIL_SEND_URL);
    expect(url).not.toContain('tok-secret');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-secret');
    expect(JSON.parse(init.body as string).raw).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    [401, {}, {}, 'auth'],
    [403, { error: { errors: [{ reason: 'dailyLimitExceeded' }] } }, {}, 'quota'],
    [403, { error: { errors: [{ reason: 'userRateLimitExceeded' }] } }, {}, 'rate'],
    [403, { error: { errors: [{ reason: 'insufficientPermissions' }] } }, {}, 'auth'],
    [429, {}, { 'retry-after': '7' }, 'rate'],
    [503, {}, {}, 'server'],
    [400, { error: { message: 'Invalid To header' } }, {}, 'invalid'],
  ])('maps HTTP %i %j to %s', async (status, body, headers, kind) => {
    const t = gmailTransport(() => 'tok', respond(status, body, headers) as unknown as typeof fetch);
    const err = (await t.send(msg()).catch((e: unknown) => e)) as TransportError;
    expect(err).toBeInstanceOf(TransportError);
    expect(err.failure.kind).toBe(kind);
    if (status === 429) expect(err.failure.retryAfterMs).toBe(7000);
  });

  it('refuses without a token and without calling Gmail', async () => {
    const fetchImpl = respond(200, { id: 'x' });
    const err = (await gmailTransport(() => null, fetchImpl as unknown as typeof fetch).send(msg()).catch((e: unknown) => e)) as TransportError;
    expect(err.failure.kind).toBe('auth');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('checks the size before sending: an oversize message never reaches Gmail and is not retried', async () => {
    const fetchImpl = respond(200, { id: 'x' });
    const big = prepareAttachment({ filename: 'big.bin', contentType: 'application/octet-stream', data: new Uint8Array(MAX_RAW_MESSAGE_BYTES) });
    const err = (await gmailTransport(() => 'tok', fetchImpl as unknown as typeof fetch).send(msg({ attachments: [big] })).catch((e: unknown) => e)) as TransportError;
    expect(err.failure.kind).toBe('too_large');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('a header injection attempt is an invalid message, not a network error to retry', async () => {
    const err = (await fakeTransport().send(msg({ subject: 'a\r\nBcc: x@evil.com' })).catch((e: unknown) => e)) as TransportError;
    expect(err.failure.kind).toBe('invalid');
  });
});
