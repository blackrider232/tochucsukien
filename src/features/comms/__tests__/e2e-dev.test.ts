// @vitest-environment node
// The whole comms path in the SCE_DEV_MEMORY runtime, wired as the app wires
// it: the real registry and dev seeds, the registered commands (whose sheet
// source is the dev fake) and the browser's runCampaign over the fake Gmail
// transport. Invite, send, log, form response, guest RSVP through
// guests.applyRsvp, audit; no second copy of a message, from a second tab or
// after a crash; retry rules. Any network call fails the test.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newId, type Email, type EventId, type Instant } from '@/core/brand';
import type { CommandId, InputOf, OutputOf } from '@/core/commands';
import { commandLookup, runCommand } from '@/core/commands/pipeline';
import { featureServers } from '@/features/registry-server';
import { readRoster } from '@/features/guests/server';
import { runCampaign, type CampaignApi } from '../domain/campaign';
import { fromAddress, fromGuest, fromManual, invitationMessage, senderChoice, type Compose, type MessageContext, type Recipient } from '../domain/compose';
import { TransportError, type SendFailure } from '../domain/dispatcher';
import { emailTemplate } from '../domain/email-templates';
import { fakeTransport, type GmailTransport } from '../domain/transport';
import { createCommands } from '../server/commands';
import { cronSystemContext } from '../server/cron';
import { DEV_SHEET_URL, DEV_SHEETS } from '../server/dev-sheets';
import { fakeSheetSource } from '../server/sheet-source';
import { deliveryLogData, formScreenData, invitationScreenData } from '../server/screen-data';
import { formsTable } from '../server/tables';

// The registry reaches core/auth/admin, which is server-only.
vi.mock('next/dist/compiled/server-only', () => ({}));

const lookup = commandLookup(featureServers);
const network = vi.fn(async () => {
  throw new Error('no network in the dev scenario');
});

beforeEach(async () => {
  vi.stubEnv('SCE_DEV_MEMORY', '1');
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubGlobal('fetch', network);
  const { resetDevRuntime } = await import('@/core/dev/runtime');
  await resetDevRuntime();
});
afterEach(() => {
  expect(network).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function scenario() {
  const ctx = (await cronSystemContext())!;
  /** The context of a request made now: the clock moves on between requests, as in the app. */
  const at = () => ({ ...ctx, now: new Date().toISOString() as Instant });
  const run = async <K extends CommandId>(id: K, input: InputOf<K>): Promise<OutputOf<K>> => {
    const r = await runCommand(at(), lookup, id, input);
    if (!r.ok) throw new Error(`${id}: ${r.kind} ${r.message}`);
    return r.value as OutputOf<K>;
  };
  const eventId = (await ctx.db.table(formsTable).list())[0]!.eventId;
  const screen = (await invitationScreenData(ctx, eventId, null))!;
  const template = emailTemplate('invitation');
  const compose: Compose = { senderId: screen.mailboxes[0]!.id, templateKey: 'invitation', subject: template.subject, body: template.html, contactPhone: '024 0000 0000', attachQr: false };
  const choice = senderChoice(compose.senderId, screen.mailboxes, () => null)!;
  // In the dev runtime the signed-in Google account is the chosen mailbox (InvitationsPage does the same).
  const from = fromAddress(choice, choice.kind === 'mailbox' ? choice.mailbox.email : null, screen.officer.name);
  if (!from.ok) throw new Error(from.message);
  const mctx: MessageContext = { event: screen.event, from: from.from, officerName: screen.officer.name, formUrl: screen.formUrl, org: screen.org };
  const guests = screen.guests.filter((g) => g.email).map((g) => fromGuest({ ...g, email: g.email! }));

  const raws: string[] = [];
  /** Every address a message was built for and handed to the fake Gmail, refused or not. */
  const sentTo: string[] = [];
  /** The page's api; `recordFails` names addresses whose result cannot be recorded, as when the tab dies right after Gmail answered. */
  const apiFor = (recordFails: ReadonlySet<string> = new Set()): CampaignApi => ({
    claim: async (chunk, r) =>
      run('comms.startCampaign', {
        eventId, senderEmail: mctx.from.email, subject: compose.subject, body: compose.body, attachQr: compose.attachQr, runToken: r.token, takeOver: r.takeOver,
        recipients: chunk.map((x) => ({ guestId: x.guestId, email: x.email, recipientName: x.name })),
      }),
    async record(campaignId, runToken, o, next) {
      if (recordFails.has(o.recipient.email)) return false;
      const result = o.kind === 'sent'
        ? { guestId: o.recipient.guestId, email: o.recipient.email, recipientName: o.recipient.name, status: 'sent' as const, providerMessageId: o.messageId, error: null }
        : { guestId: o.recipient.guestId, email: o.recipient.email, recipientName: o.recipient.name, status: o.kind === 'unknown' ? ('unknown' as const) : ('error' as const), providerMessageId: null, error: o.failure.message };
      const r = await runCommand(at(), lookup, 'comms.recordDeliveries', { eventId, campaignId, runToken, senderEmail: mctx.from.email, subject: invitationMessage(o.recipient, compose, mctx, null).subject, results: [result], next });
      return r.ok && { nextHeld: (r.value as OutputOf<'comms.recordDeliveries'>).nextHeld };
    },
    async release(campaignId, runToken, emails) {
      await run('comms.releaseDeliveries', { eventId, campaignId, runToken, emails });
    },
    renew: async (campaignId, runToken) => (await run('comms.renewClaims', { eventId, campaignId, runToken })).held,
    async markSending(campaignId, runToken, email) {
      // As the page reads it: the answer says whether the run still holds the claim; a failure is null.
      const r = await runCommand(at(), lookup, 'comms.markSending', { eventId, campaignId, runToken, email });
      return r.ok ? (r.value as OutputOf<'comms.markSending'>).held : null;
    },
  });
  /** One press of "Bắt đầu gửi" (or of "Tiếp quản phiên gửi" with takeOver), in a tab of its own. */
  const send = (transport: GmailTransport, recipients: ReadonlyArray<Recipient>, o: { takeOver?: boolean; recordFails?: ReadonlySet<string> } = {}) =>
    runCampaign({
      recipients,
      api: apiFor(o.recordFails),
      run: { token: newId<'CampaignRun'>(), takeOver: o.takeOver ?? false },
      signal: new AbortController().signal,
      sleep: async () => undefined,
      send: (r) => transport.send(invitationMessage(r, compose, mctx, null)),
    });
  const devGmail = fakeTransport({
    onSend: (raw, m) => {
      raws.push(raw);
      sentTo.push(m.to[0]!.email);
    },
  });
  /** The event's audit rows, oldest first, read as the admin reads the audit screen. */
  const audits = async () => [...(await ctx.db.rpc('sce_tcsk_list_audit', { eventId, limit: 200 }))].reverse();
  return { ctx, at, run, eventId, guests, devGmail, send, raws, sentTo, audits };
}

/** Fails the listed addresses as Gmail would, in order, then delivers through `inner`. */
function scripted(inner: GmailTransport, failures: Record<string, SendFailure[]>): GmailTransport {
  return {
    kind: inner.kind,
    async send(m) {
      const next = failures[m.to[0]!.email]?.shift();
      if (next) throw new TransportError(next);
      return inner.send(m);
    },
  };
}

describe('comms in the dev memory runtime, end to end', () => {
  it('invites, sends through the fake mailbox, logs, then applies the form answer to the guest, all audited', async () => {
    const s = await scenario();
    expect(s.guests.map((g) => g.email).sort()).toEqual(['guest.g@example.org', 'thu.nghiem.e@example.com']);
    const typo = fromManual({ email: 'loi.dia.chi@example.com' as Email, name: 'Sai Địa Chỉ', organization: '' });

    const report = await s.send(s.devGmail, [...s.guests, typo]);
    expect(report).toMatchObject({ claimFailed: false, stoppedBy: null, skipped: [], unrecorded: [], alreadySent: [], inFlight: [], ownInFlight: [] });
    expect(report.sent.map((x) => x.recipient.email).sort()).toEqual(['guest.g@example.org', 'thu.nghiem.e@example.com']);
    expect(report.failed.map((x) => x.recipient.email)).toEqual(['loi.dia.chi@example.com']);
    // The message that left is a real one: the merged name, the From of the mailbox, nothing unencoded.
    expect(s.raws[0]).toMatch(/^From: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=\r\n <ban\.to\.chuc@example\.com>\r\nTo: /);
    expect(s.raws.every((raw) => /^[\x20-\x7e\r\n]*$/.test(raw))).toBe(true);

    const log = (await deliveryLogData(s.ctx, s.eventId))!;
    expect(log.rows.map((r) => [r.email, r.status]).sort()).toEqual([['guest.g@example.org', 'sent'], ['loi.dia.chi@example.com', 'error'], ['thu.nghiem.e@example.com', 'sent']]);
    expect(log.rows.find((r) => r.status === 'sent')!.subject).toContain('Kính gửi');
    const screen = (await invitationScreenData(s.ctx, s.eventId, null))!;
    expect(screen.guests.filter((g) => g.lastDelivery === 'sent').map((g) => g.email).sort()).toEqual(['guest.g@example.org', 'thu.nghiem.e@example.com']);

    // The dev sheet: E confirms with banquet, G declines, a newcomer and a row without a time wait for review, and so does
    // E's later sentence, for a person to decide; E stays confirmed.
    const sync = await s.run('comms.syncForm', { eventId: s.eventId });
    expect(sync).toMatchObject({ status: 'ok', rows: 6, fresh: 6, applied: 2, created: 0, failed: 0 });
    const roster = await readRoster(s.ctx, s.eventId);
    expect(roster.find((g) => g.email === 'thu.nghiem.e@example.com')).toMatchObject({ rsvpStatus: 'confirmed', hasBanquet: true, rsvpSource: 'google_form' });
    expect(roster.find((g) => g.email === 'guest.g@example.org')).toMatchObject({ rsvpStatus: 'declined', rsvpSource: 'google_form' });
    const form = (await formScreenData(s.ctx, s.eventId))!;
    expect(form.responses.find((r) => r.name.includes('onerror'))).toMatchObject({ name: '<img src=x onerror=alert(3)> Thử XSS', applyStatus: 'pending', match: 'none' });
    expect(form.responses.find((r) => r.rsvpAnswer.startsWith('Có tham dự nhưng'))).toMatchObject({ applyStatus: 'review', match: 'email', matchedGuest: { name: 'Doanh nhân Thử Nghiệm E' } });

    const actions = (await s.audits()).map((a) => a.action);
    for (const a of ['BẮT ĐẦU GỬI THƯ', 'GỬI THƯ MỜI', 'ĐỒNG BỘ GOOGLE FORM', 'CẬP NHẬT RSVP']) expect(actions).toContain(a);
    expect((await s.audits()).filter((a) => a.action === 'GỬI THƯ MỜI').map((a) => a.summary)).toEqual(
      expect.arrayContaining([expect.stringContaining('1 thư đã gửi, 0 thư lỗi'), expect.stringContaining('0 thư đã gửi, 1 thư lỗi')]),
    );
  });

  it('never sends the same message twice: a second run of it mails only the failed address again', async () => {
    const s = await scenario();
    const typo = fromManual({ email: 'loi.dia.chi@example.com' as Email, name: 'Sai Địa Chỉ', organization: '' });
    await s.send(s.devGmail, [...s.guests, typo]);
    const delivered = () => s.sentTo.filter((e) => e !== typo.email);
    expect(delivered()).toHaveLength(2);

    const again = await s.send(s.devGmail, [...s.guests, typo]);
    expect(again.alreadySent.map((r) => r.email).sort()).toEqual(['guest.g@example.org', 'thu.nghiem.e@example.com']);
    // Only the address that failed was tried again; the fake still refuses it.
    expect(again.failed.map((f) => f.recipient.email)).toEqual(['loi.dia.chi@example.com']);
    expect(delivered()).toHaveLength(2);
    expect(s.sentTo.filter((e) => e === typo.email)).toHaveLength(2);
    expect((await s.audits()).filter((a) => a.action === 'BẮT ĐẦU GỬI THƯ').at(-1)!.summary).toContain('bỏ qua 2 người đã nhận thư này');
  });

  it('retries a rate limit by itself, records a refusal as an error, and stops on an expired token, freeing what it did not send', async () => {
    const s = await scenario();
    const [a, b] = s.guests as [Recipient, Recipient];
    const c = fromManual({ email: 'nguoi.thu.ba@example.com' as Email, name: 'Người Thứ Ba', organization: '' });
    const gmail = scripted(s.devGmail, {
      [a.email]: [{ kind: 'rate', message: 'Gmail: rate limit', retryAfterMs: 1 }],
      [b.email]: [{ kind: 'auth', message: 'Phiên đăng nhập Google đã hết hạn.' }],
    });
    const report = await s.send(gmail, [a, b, c]);
    expect(report.sent.map((x) => x.recipient.email)).toEqual([a.email]);
    expect(report).toMatchObject({ stoppedBy: 'auth', failed: [] });
    expect(report.skipped.map((x) => [x.recipient.email, x.reason])).toEqual([[b.email, 'auth'], [c.email, 'auth']]);
    // The stopped run's claims are released, so the log has only what Gmail answered.
    const log = (await deliveryLogData(s.ctx, s.eventId))!;
    expect(log.rows.map((r) => [r.email, r.status])).toEqual([[a.email, 'sent']]);

    // After signing in again, the same message goes to the rest and not to the first one.
    const resumed = await s.send(s.devGmail, [a, b, c]);
    expect(resumed.alreadySent.map((r) => r.email)).toEqual([a.email]);
    expect(resumed.sent.map((x) => x.recipient.email)).toEqual([b.email, c.email]);
    expect(s.sentTo.filter((e) => e === a.email)).toHaveLength(1);
  });

  it('a send whose answer was lost is not retried and not resent by the next run, until an officer says it did not go', async () => {
    const s = await scenario();
    const [a, b] = s.guests as [Recipient, Recipient];
    // Gmail took a's message, then the connection dropped before its answer arrived.
    const dropped: GmailTransport = {
      kind: s.devGmail.kind,
      async send(m) {
        const r = await s.devGmail.send(m);
        if (m.to[0]!.email === a.email) throw new TransportError({ kind: 'network', message: 'Không kết nối được Gmail.' });
        return r;
      },
    };
    const first = await s.send(dropped, [a, b]);
    expect(first).toMatchObject({ stoppedBy: 'unknown', sent: [] });
    expect(first.unknown.map((u) => u.recipient.email)).toEqual([a.email]);
    expect(s.sentTo.filter((e) => e === a.email)).toHaveLength(1);
    const log = (await deliveryLogData(s.ctx, s.eventId))!;
    expect(log.rows.map((r) => [r.email, r.status])).toEqual([[a.email, 'unknown']]);

    const again = await s.send(s.devGmail, [a, b]);
    expect(again.unclear.map((r) => r.email)).toEqual([a.email]);
    expect(again.sent.map((x) => x.recipient.email)).toEqual([b.email]);
    expect(s.sentTo.filter((e) => e === a.email)).toHaveLength(1);

    // The officer checked Gmail's Sent folder: it is not there.
    await s.run('comms.markNotSent', { eventId: s.eventId, campaignId: log.rows[0]!.campaignId, emails: [a.email] });
    expect((await s.send(s.devGmail, [a])).sent.map((x) => x.recipient.email)).toEqual([a.email]);
  });

  it('two tabs of the same officer: the second sends nothing the first holds, and every guest gets the message once', async () => {
    const s = await scenario();
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const slow: GmailTransport = {
      kind: s.devGmail.kind,
      async send(m) {
        await gate;
        return s.devGmail.send(m);
      },
    };
    const tabA = s.send(slow, s.guests);
    // Let tab A claim and start on its first message.
    await vi.waitFor(async () => expect((await deliveryLogData(s.ctx, s.eventId))!.rows).toHaveLength(2));
    const tabB = await s.send(s.devGmail, s.guests);
    expect(tabB).toMatchObject({ sent: [], failed: [], skipped: [], inFlight: [] });
    expect(tabB.ownInFlight.map((r) => r.email).sort()).toEqual(s.guests.map((g) => g.email).sort());
    open();
    expect((await tabA).sent).toHaveLength(2);
    expect(s.sentTo.sort()).toEqual(s.guests.map((g) => g.email).sort());
  });

  it('a crash between Gmail’s answer and the record: the next run does not mail that guest again, nor does a take-over', async () => {
    const s = await scenario();
    const [a, b] = s.guests as [Recipient, Recipient];
    // Gmail accepts a's message, then the tab dies before the result is written.
    const crashed = await s.send(s.devGmail, [a, b], { recordFails: new Set([a.email]) });
    expect(crashed).toMatchObject({ stoppedBy: 'record' });
    expect(crashed.unrecorded.map((u) => u.recipient.email)).toEqual([a.email]);
    // The reloaded page is another run: a is still held by the dead one and is not mailed; b was released and goes.
    const reloaded = await s.send(s.devGmail, [a, b]);
    expect(reloaded.ownInFlight.map((r) => r.email)).toEqual([a.email]);
    expect(reloaded.sent.map((x) => x.recipient.email)).toEqual([b.email]);
    expect(s.sentTo.filter((e) => e === a.email)).toHaveLength(1);
    // Taking over is the officer's explicit choice and is audited; a's message was in flight, so it waits as unknown.
    const taken = await s.send(s.devGmail, [a], { takeOver: true });
    expect(taken.unclear.map((r) => r.email)).toEqual([a.email]);
    expect(s.sentTo.filter((e) => e === a.email)).toHaveLength(1);
    expect((await s.audits()).some((x) => x.action === 'BẮT ĐẦU GỬI THƯ' && x.summary.includes('chuyển sang "Không rõ đã gửi"'))).toBe(true);
  });

  it('a message Gmail accepted but the app never recorded is not mailed again after the lease: it waits as unknown', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const s = await scenario();
      const [a, b] = s.guests as [Recipient, Recipient];
      const crashed = await s.send(s.devGmail, [a, b], { recordFails: new Set([a.email]) });
      expect(crashed.unrecorded.map((u) => u.recipient.email)).toEqual([a.email]);
      // The tab is gone; an hour later someone sends the same message again.
      vi.setSystemTime(Date.now() + 60 * 60_000);
      const later = await s.send(s.devGmail, [a, b]);
      expect(later.unclear.map((r) => r.email)).toEqual([a.email]);
      expect(s.sentTo.filter((e) => e === a.email)).toHaveLength(1);
      const log = (await deliveryLogData(s.at(), s.eventId))!.rows.find((r) => r.email === a.email)!;
      expect(log).toMatchObject({ status: 'unknown' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('a long run renews its claims, so a run started after the lease sends nothing of its unsent tail', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const s = await scenario();
      const extra = [1, 2].map((n) => fromManual({ email: `them.${n}@example.com` as Email, name: `Người Thêm ${n}`, organization: '' }));
      const list = [...s.guests, ...extra];
      let second: Awaited<ReturnType<typeof runCommand>> | null = null;
      // Every message takes 12 minutes (rate limits, a slow network); the third one is where a second run starts.
      const slow: GmailTransport = {
        kind: s.devGmail.kind,
        async send(m) {
          vi.setSystemTime(Date.now() + 12 * 60_000);
          if (m.to[0]!.email === list[2]!.email) {
            second = await runCommand({ ...s.ctx, now: new Date().toISOString() as Instant }, lookup, 'comms.startCampaign', {
              eventId: s.eventId, senderEmail: 'ban.to.chuc@example.com' as Email, subject: emailTemplate('invitation').subject, body: emailTemplate('invitation').html, attachQr: false,
              runToken: newId<'CampaignRun'>(), takeOver: false, recipients: list.map((r) => ({ guestId: r.guestId, email: r.email, recipientName: r.name })),
            });
          }
          return s.devGmail.send(m);
        },
      };
      const first = await s.send(slow, list);
      expect(first.sent).toHaveLength(4);
      // 36 minutes after the first claim, the second run finds the tail still held, renewed 12 minutes before.
      expect(second).toMatchObject({ ok: true, value: { claimed: [] } });
      expect(s.sentTo.sort()).toEqual(list.map((r) => r.email).sort());
      expect((await s.audits()).filter((a) => a.action === 'GIA HẠN GIỮ CHỖ').length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ten recipients and one rate limit write one audit row per message, plus the claim', async () => {
    const s = await scenario();
    const manual = Array.from({ length: 8 }, (_, n) => fromManual({ email: `nguoi.${n}@example.com` as Email, name: `Người ${n}`, organization: '' }));
    const before = (await s.audits()).length;
    const gmail = scripted(s.devGmail, { [manual[0]!.email]: [{ kind: 'rate', message: 'Gmail: rate limit', retryAfterMs: 1 }] });
    const report = await s.send(gmail, [...s.guests, ...manual]);
    expect(report.sent).toHaveLength(10);
    const rows = (await s.audits()).slice(before);
    const count = (action: string) => rows.filter((a) => a.action === action).length;
    // The first message is marked on its own; every record marks the next one, and the retry marks nothing again.
    expect({ start: count('BẮT ĐẦU GỬI THƯ'), records: count('GỬI THƯ MỜI'), marks: count('ĐANG GỬI THƯ') }).toEqual({ start: 1, records: 10, marks: 1 });
    // Besides those, only guests' own rows for the two invitations it marked.
    expect(rows.length - 12).toBeLessThanOrEqual(2);
  });

  it('a rate limit whose retry falls due for a renewal goes on: the message being sent is still this run’s', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const s = await scenario();
      let limited = false;
      // Gmail answers 429 after 6 minutes; the retry is past the 5-minute renewal, with the message already 'sending'.
      const gmail: GmailTransport = {
        kind: s.devGmail.kind,
        async send(m) {
          if (!limited) {
            limited = true;
            vi.setSystemTime(Date.now() + 6 * 60_000);
            throw new TransportError({ kind: 'rate', message: 'Gmail: rate limit', retryAfterMs: 1 });
          }
          return s.devGmail.send(m);
        },
      };
      const report = await s.send(gmail, s.guests);
      expect(report).toMatchObject({ stoppedBy: null, skipped: [], unrecorded: [] });
      expect(report.sent.map((x) => x.recipient.email).sort()).toEqual(s.guests.map((g) => g.email).sort());
      expect((await s.audits()).filter((a) => a.action === 'GIA HẠN GIỮ CHỖ')).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('an answer with both a yes and a no word never declines a confirmed guest or frees the seat', async () => {
    const s = await scenario();
    await s.run('comms.syncForm', { eventId: s.eventId });
    const guestE = async () => (await readRoster(s.ctx, s.eventId)).find((g) => g.email === 'thu.nghiem.e@example.com')!;
    const before = await guestE();
    expect(before).toMatchObject({ rsvpStatus: 'confirmed' });
    const sheets = fakeSheetSource(DEV_SHEETS);
    const comms = commandLookup({ ...featureServers, comms: { commands: createCommands({ sheets }) } });
    const phrases = [
      'Tôi xác nhận tham dự, không ăn tiệc',
      'Xin xác nhận sẽ tham dự cùng Ban Giám đốc',
      'Tôi sẽ tham dự, không có gì thay đổi',
      'Em xác nhận tham dự, không cử người đi thay',
      'Có, nhưng không tham dự được',
      'Ban Giám đốc',
    ];
    for (const [i, answer] of phrases.entries()) {
      sheets.set(DEV_SHEET_URL, `${DEV_SHEETS[DEV_SHEET_URL]}\r\n04/11/2026 1${i}:00:00,Doanh nhân Thử Nghiệm E,Công ty Thử Nghiệm Một,thu.nghiem.e@example.com,,"${answer}",Không,`);
      const r = await runCommand(s.ctx, comms, 'comms.syncForm', { eventId: s.eventId });
      expect(r).toMatchObject({ ok: true });
      expect(await guestE(), answer).toMatchObject({ rsvpStatus: before.rsvpStatus, substituteName: before.substituteName, seatCode: before.seatCode });
    }
  });

  it('a send outside the dev runtime refuses the fake transport’s results', async () => {
    const s = await scenario();
    const runToken = newId<'CampaignRun'>();
    const claim = await s.run('comms.startCampaign', { eventId: s.eventId as EventId, senderEmail: 'ban.to.chuc@example.com' as Email, subject: 's', body: '<p>b</p>', attachQr: false, runToken, takeOver: false, recipients: [{ guestId: null, email: 'x@example.com' as Email, recipientName: '' }] });
    vi.stubEnv('SCE_DEV_MEMORY', '');
    const r = await runCommand(s.ctx, lookup, 'comms.recordDeliveries', {
      eventId: s.eventId, campaignId: claim.campaignId, runToken, senderEmail: 'ban.to.chuc@example.com', subject: 's',
      results: [{ guestId: null, email: 'x@example.com', recipientName: '', status: 'sent', providerMessageId: 'dev-fake-abc', error: null }],
    });
    vi.stubEnv('SCE_DEV_MEMORY', '1');
    expect(r).toMatchObject({ ok: false, kind: 'invalid' });
  });
});
