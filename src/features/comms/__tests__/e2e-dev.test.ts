// @vitest-environment node
// The whole comms path in the SCE_DEV_MEMORY runtime, wired as the app wires
// it: the real registry and dev seeds, the registered commands (whose sheet
// source is the dev fake) and the browser's runCampaign over the fake Gmail
// transport. Invite, send, log, form response, guest RSVP through
// guests.applyRsvp, audit; no second copy of a message; retry rules. Any
// network call fails the test.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Email, EventId } from '@/core/brand';
import type { CommandId, InputOf, OutputOf } from '@/core/commands';
import { commandLookup, runCommand } from '@/core/commands/pipeline';
import { featureServers } from '@/features/registry-server';
import { readRoster } from '@/features/guests/server';
import { runCampaign, type CampaignApi } from '../domain/campaign';
import { fromAddress, fromGuest, fromManual, invitationMessage, senderChoice, type Compose, type MessageContext, type Recipient } from '../domain/compose';
import { TransportError, type SendFailure } from '../domain/dispatcher';
import { emailTemplate } from '../domain/email-templates';
import { fakeTransport, type GmailTransport } from '../domain/transport';
import { cronSystemContext } from '../server/cron';
import { deliveryLogData, formScreenData, invitationScreenData } from '../server/screen-data';
import { formsTable } from '../server/tables';

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
  const run = async <K extends CommandId>(id: K, input: InputOf<K>): Promise<OutputOf<K>> => {
    const r = await runCommand(ctx, lookup, id, input);
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
  const api: CampaignApi = {
    claim: async (chunk) => run('comms.startCampaign', { eventId, senderEmail: mctx.from.email, subject: compose.subject, body: compose.body, recipients: chunk.map((r) => ({ guestId: r.guestId, email: r.email, recipientName: r.name })) }),
    async record(campaignId, o) {
      const result = o.kind === 'sent'
        ? { guestId: o.recipient.guestId, email: o.recipient.email, recipientName: o.recipient.name, status: 'sent' as const, providerMessageId: o.messageId, error: null }
        : { guestId: o.recipient.guestId, email: o.recipient.email, recipientName: o.recipient.name, status: 'error' as const, providerMessageId: null, error: o.failure.message };
      await run('comms.recordDeliveries', { eventId, campaignId, senderEmail: mctx.from.email, subject: invitationMessage(o.recipient, compose, mctx, null).subject, results: [result] });
      return true;
    },
    async release(campaignId, emails) {
      await run('comms.releaseDeliveries', { eventId, campaignId, emails });
    },
  };
  const send = (transport: GmailTransport, recipients: ReadonlyArray<Recipient>) =>
    runCampaign({
      recipients,
      api,
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
  return { ctx, run, eventId, guests, devGmail, send, raws, sentTo, audits };
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
    expect(report).toMatchObject({ claimFailed: false, stoppedBy: null, skipped: [], unrecorded: [], alreadySent: [], inFlight: [] });
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

    // The dev sheet: E confirms with banquet, G declines, a newcomer and a row without a time wait for review.
    const sync = await s.run('comms.syncForm', { eventId: s.eventId });
    expect(sync).toMatchObject({ status: 'ok', rows: 5, fresh: 5, applied: 2, created: 0, failed: 0 });
    const roster = await readRoster(s.ctx, s.eventId);
    expect(roster.find((g) => g.email === 'thu.nghiem.e@example.com')).toMatchObject({ rsvpStatus: 'confirmed', hasBanquet: true, rsvpSource: 'google_form' });
    expect(roster.find((g) => g.email === 'guest.g@example.org')).toMatchObject({ rsvpStatus: 'declined', rsvpSource: 'google_form' });
    const form = (await formScreenData(s.ctx, s.eventId))!;
    expect(form.responses.find((r) => r.name.includes('onerror'))).toMatchObject({ name: '<img src=x onerror=alert(3)> Thử XSS', applyStatus: 'pending', match: 'none' });

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
    expect((await s.audits()).at(-2)!.summary).toContain('bỏ qua 2 người đã nhận thư này');
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

  it('a send outside the dev runtime refuses the fake transport’s results', async () => {
    const s = await scenario();
    const claim = await s.run('comms.startCampaign', { eventId: s.eventId as EventId, senderEmail: 'ban.to.chuc@example.com' as Email, subject: 's', body: '<p>b</p>', recipients: [{ guestId: null, email: 'x@example.com' as Email, recipientName: '' }] });
    vi.stubEnv('SCE_DEV_MEMORY', '');
    const r = await runCommand(s.ctx, lookup, 'comms.recordDeliveries', {
      eventId: s.eventId, campaignId: claim.campaignId, senderEmail: 'ban.to.chuc@example.com', subject: 's',
      results: [{ guestId: null, email: 'x@example.com', recipientName: '', status: 'sent', providerMessageId: 'dev-fake-abc', error: null }],
    });
    vi.stubEnv('SCE_DEV_MEMORY', '1');
    expect(r).toMatchObject({ ok: false, kind: 'invalid' });
  });
});
