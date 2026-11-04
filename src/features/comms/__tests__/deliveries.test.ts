import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newId, type CampaignId, type Email, type EventId, type GuestId, type Instant } from '@/core/brand';
import { testActor, XTDT } from '@/core/testing/actors';
import { campaignIdFor, CLAIM_LEASE_MS, CLAIM_SKEW_MS } from '../server/deliveries';
import { deliveryLogData, invitationScreenData } from '../server/screen-data';
import { campaignsTable } from '../server/tables';
import type { CommandId } from '@/core/commands';
import { MESSAGES } from '@/core/commands/pipeline';
import { DbError, type AuditWriter, type Db } from '@/core/db';
import { admin, failingWrites, harness, NOW, xtdtUser } from './harness';

const SENDER = 'btc@x.vn' as Email;
const MESSAGE = { subject: 'Giấy mời {ho_ten}', body: '<p>Kính gửi {danh_xung} {ho_ten}</p>' };
const colleague = testActor('user', XTDT);
/** One run of the send loop each: two tabs of one officer are two runs. */
const TAB_A = newId<'CampaignRun'>();
const TAB_B = newId<'CampaignRun'>();

// memoryDb stamps updated_at from Date, and the lease compares it with the command's clock: both read NOW.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.parse(NOW));
});
afterEach(() => {
  vi.useRealTimers();
});

type H = ReturnType<typeof harness>;
const to = (email: string, guestId: GuestId | null = null) => ({ guestId, email: email as Email, recipientName: `Người ${email}` });
const sent = (email: string, guestId: GuestId | null = null) => ({ ...to(email, guestId), status: 'sent' as const, providerMessageId: `msg-${email}`, error: null });
const failed = (email: string, guestId: GuestId | null = null) => ({ ...to(email, guestId), status: 'error' as const, providerMessageId: null, error: 'Gmail: Invalid To header' });
const lost = (email: string, guestId: GuestId | null = null) => ({ ...to(email, guestId), status: 'unknown' as const, providerMessageId: null, error: 'Không kết nối được Gmail.' });

const start = async (h: H, eventId: EventId, recipients: ReturnType<typeof to>[], actor = xtdtUser, message: { subject: string; body: string; attachQr?: boolean } = MESSAGE, runToken = TAB_A, takeOver = false) =>
  (await h.ok(actor, 'comms.startCampaign', { eventId, senderEmail: SENDER, attachQr: false, ...message, runToken, takeOver, recipients })).value;
const record = (h: H, eventId: EventId, campaignId: CampaignId, results: ReadonlyArray<ReturnType<typeof sent> | ReturnType<typeof failed> | ReturnType<typeof lost>>, actor = xtdtUser, runToken = TAB_A) =>
  h.run(actor, 'comms.recordDeliveries', { eventId, campaignId, runToken, senderEmail: SENDER, subject: 'Giấy mời', results });
const marking = (h: H, eventId: EventId, campaignId: CampaignId, email: string, runToken = TAB_A, actor = xtdtUser) =>
  h.run(actor, 'comms.markSending', { eventId, campaignId, runToken, email: email as Email });
const after = (h: H, email: string, ms: number) => {
  const row = (h.rows('sce_tcsk_email_deliveries') as Array<{ email: string; updated_at: string }>).find((r) => r.email === email)!;
  h.clock.now = new Date(Date.parse(row.updated_at) + ms).toISOString() as Instant;
};
const deliveries = (h: H) =>
  (h.rows('sce_tcsk_email_deliveries') as Array<Record<string, unknown>>).map((r) => [r.email, r.status]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));

describe('comms.startCampaign', () => {
  it('claims each address as queued, once, under an id that the message decides', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const r = await start(h, eventId, [to('a@x.vn'), to('b@x.vn'), to('a@x.vn')]);
    expect(r).toEqual({ campaignId: campaignIdFor(eventId, MESSAGE.subject, MESSAGE.body), claimed: ['a@x.vn', 'b@x.vn'], alreadySent: [], inFlight: [], ownInFlight: [], unclear: [] });
    expect(deliveries(h)).toEqual([['a@x.vn', 'queued'], ['b@x.vn', 'queued']]);
    expect(h.audits().at(-1)).toMatchObject({ action: 'BẮT ĐẦU GỬI THƯ', summary: `Bắt đầu đợt gửi "${MESSAGE.subject}" từ btc@x.vn: giữ chỗ 2 người nhận` });
  });

  it('refuses a campaign row whose stored message is not the one its id was made from, and claims nothing', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    // An officer writing to the table directly stores another message under this message's id.
    await h.ctx(xtdtUser).db.table(campaignsTable).insert({ id: campaignIdFor(eventId, MESSAGE.subject, MESSAGE.body), eventId, subjectTemplate: MESSAGE.subject, bodyTemplate: '<p>Thư khác</p>', attachQr: false });
    const audits = h.audits().length;
    const r = await h.run(xtdtUser, 'comms.startCampaign', { eventId, senderEmail: SENDER, ...MESSAGE, attachQr: false, runToken: TAB_A, takeOver: false, recipients: [to('a@x.vn')] });
    expect(r).toMatchObject({ ok: false, kind: 'conflict', message: expect.stringContaining('Nội dung thư đã lưu của đợt gửi này không khớp') });
    expect(deliveries(h)).toEqual([]);
    expect(h.audits()).toHaveLength(audits);
  });

  it('the same message is the same campaign; another subject or body, or another event, is a new one', async () => {
    const h = harness();
    const [e1, e2] = [await h.createEvent(), await h.createEvent()];
    const id = campaignIdFor(e1, MESSAGE.subject, MESSAGE.body);
    expect(campaignIdFor(e1, ` ${MESSAGE.subject} `, `${MESSAGE.body}\n`)).toBe(id);
    expect(new Set([id, campaignIdFor(e1, 'Thư khác', MESSAGE.body), campaignIdFor(e1, MESSAGE.subject, '<p>Khác</p>'), campaignIdFor(e2, MESSAGE.subject, MESSAGE.body)]).size).toBe(4);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('never claims an address that already received this message, even from a new page (no double send)', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const first = await start(h, eventId, [to('a@x.vn'), to('b@x.vn')]);
    expect(await record(h, eventId, first.campaignId, [sent('a@x.vn'), failed('b@x.vn')])).toMatchObject({ ok: true });
    // A reload composes the same message again.
    const again = await start(h, eventId, [to('a@x.vn'), to('b@x.vn'), to('c@x.vn')]);
    expect(again).toMatchObject({ campaignId: first.campaignId, claimed: ['b@x.vn', 'c@x.vn'], alreadySent: ['a@x.vn'] });
    expect(h.audits().at(-1)!.summary).toContain('bỏ qua 1 người đã nhận thư này');
    // A different message to the same person is a new campaign, and allowed.
    expect((await start(h, eventId, [to('a@x.vn')], xtdtUser, { subject: 'Thư nhắc lịch', body: '<p>Nhắc</p>' })).claimed).toEqual(['a@x.vn']);
  });

  it('leaves another officer’s fresh claim alone, and takes over one older than the lease', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    await start(h, eventId, [to('a@x.vn')]);
    // updated_at is wall-clock time in memoryDb, so the officers' clocks run from it.
    const stamped = Date.parse((h.rows('sce_tcsk_email_deliveries') as Array<{ updated_at: string }>)[0]!.updated_at);
    h.clock.now = new Date(stamped + 60_000).toISOString() as Instant;
    expect(await start(h, eventId, [to('a@x.vn'), to('b@x.vn')], colleague, MESSAGE, TAB_B)).toMatchObject({ claimed: ['b@x.vn'], inFlight: ['a@x.vn'], ownInFlight: [] });
    // Taking over is for one's own runs only.
    expect(await start(h, eventId, [to('a@x.vn')], colleague, MESSAGE, TAB_B, true)).toMatchObject({ claimed: [], inFlight: ['a@x.vn'] });
    // The run that holds it carries on.
    expect(await start(h, eventId, [to('a@x.vn')])).toMatchObject({ claimed: ['a@x.vn'], inFlight: [] });
    after(h, 'a@x.vn', CLAIM_LEASE_MS + CLAIM_SKEW_MS);
    expect(await start(h, eventId, [to('a@x.vn')], colleague, MESSAGE, TAB_B)).toMatchObject({ claimed: ['a@x.vn'], inFlight: [] });
  });

  it('a server clock that runs a little ahead of the database’s does not end a live claim early', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    await start(h, eventId, [to('a@x.vn')]);
    // updated_at is the database's time; the command's clock is the app server's, here a minute ahead past the lease.
    after(h, 'a@x.vn', CLAIM_LEASE_MS + 60_000);
    expect(await start(h, eventId, [to('a@x.vn')], colleague, MESSAGE, TAB_B)).toMatchObject({ claimed: [], inFlight: ['a@x.vn'] });
    after(h, 'a@x.vn', CLAIM_LEASE_MS + CLAIM_SKEW_MS);
    expect(await start(h, eventId, [to('a@x.vn')], colleague, MESSAGE, TAB_B)).toMatchObject({ claimed: ['a@x.vn'] });
  });

  it('a second tab of the same officer claims nothing the first tab holds, so nobody is mailed twice', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const a = await start(h, eventId, [to('a@x.vn'), to('b@x.vn')]);
    expect(a.claimed).toEqual(['a@x.vn', 'b@x.vn']);
    const b = await start(h, eventId, [to('a@x.vn'), to('b@x.vn')], xtdtUser, MESSAGE, TAB_B);
    expect(b).toMatchObject({ claimed: [], inFlight: [], ownInFlight: ['a@x.vn', 'b@x.vn'] });
    expect(h.audits().at(-1)!.summary).toContain('bỏ qua 2 người đang được gửi ở một phiên khác của bạn');
    // Tab B cannot record over tab A's claim; tab A records as usual.
    expect(await record(h, eventId, a.campaignId, [sent('a@x.vn')], xtdtUser, TAB_B)).toMatchObject({ ok: false, kind: 'conflict' });
    expect(await record(h, eventId, a.campaignId, [sent('a@x.vn')])).toMatchObject({ ok: true });
    expect(deliveries(h)).toEqual([['a@x.vn', 'sent'], ['b@x.vn', 'queued']]);
  });

  it('a message sent but never recorded (the tab died) is not claimed by the next run of the same officer', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    await start(h, eventId, [to('a@x.vn')]);
    // Tab A sent to a@ and closed before recording. A reload is a new run.
    expect(await start(h, eventId, [to('a@x.vn')], xtdtUser, MESSAGE, TAB_B)).toMatchObject({ claimed: [], ownInFlight: ['a@x.vn'] });
    expect(deliveries(h)).toEqual([['a@x.vn', 'queued']]);
  });

  it('take over: the officer may take their own other run’s claims, and that run can no longer record or release them', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const a = await start(h, eventId, [to('a@x.vn'), to('b@x.vn')]);
    expect(await start(h, eventId, [to('a@x.vn'), to('b@x.vn')], xtdtUser, MESSAGE, TAB_B, true)).toMatchObject({ claimed: ['a@x.vn', 'b@x.vn'], ownInFlight: [] });
    expect(h.audits().at(-1)!.summary).toContain('tiếp quản');
    expect(await record(h, eventId, a.campaignId, [sent('a@x.vn')])).toMatchObject({ ok: false, kind: 'conflict', message: expect.stringContaining('a@x.vn') });
    expect((await h.ok(xtdtUser, 'comms.releaseDeliveries', { eventId, campaignId: a.campaignId, runToken: TAB_A, emails: ['b@x.vn'] as Email[] })).value).toEqual({ released: 0 });
    expect(await record(h, eventId, a.campaignId, [sent('a@x.vn')], xtdtUser, TAB_B)).toMatchObject({ ok: true });
    expect(deliveries(h)).toEqual([['a@x.vn', 'sent'], ['b@x.vn', 'queued']]);
  });

  it('a result for a row that is no longer queued is refused, except a success that is already there', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const { campaignId } = await start(h, eventId, [to('a@x.vn')]);
    await record(h, eventId, campaignId, [failed('a@x.vn')]);
    // The same run cannot write over its recorded error; a new claim is needed.
    expect(await record(h, eventId, campaignId, [sent('a@x.vn')])).toMatchObject({ ok: false, kind: 'conflict' });
    expect(deliveries(h)).toEqual([['a@x.vn', 'error']]);
  });

  it('a claim that stops part-way audits what it holds and fails', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const audits = h.audits().length;
    const r = await h.runWith(failingWrites((t, op, nth) => t === 'sce_tcsk_email_deliveries' && op === 'insert' && nth === 1), xtdtUser, 'comms.startCampaign', {
      eventId, senderEmail: SENDER, ...MESSAGE, attachQr: false, runToken: TAB_A, takeOver: false, recipients: [to('a@x.vn'), to('b@x.vn')],
    });
    expect(r).toMatchObject({ ok: false, kind: 'conflict', message: expect.stringContaining('Đã giữ chỗ 1 người nhận') });
    expect(deliveries(h)).toEqual([['a@x.vn', 'queued']]);
    expect(h.audits().slice(audits)).toEqual([expect.objectContaining({ action: 'BẮT ĐẦU GỬI THƯ', summary: expect.stringContaining('đã giữ chỗ 1 người nhận rồi dừng vì lỗi') })]);
  });
});

describe('a message being sent', () => {
  it('only the run that holds the claim marks it as being sent', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const { campaignId } = await start(h, eventId, [to('a@x.vn'), to('b@x.vn')]);
    expect(await marking(h, eventId, campaignId, 'a@x.vn', TAB_B)).toMatchObject({ ok: true, value: { held: false } });
    expect(await marking(h, eventId, campaignId, 'a@x.vn')).toMatchObject({ ok: true, value: { held: true } });
    expect(deliveries(h)).toEqual([['a@x.vn', 'sending'], ['b@x.vn', 'queued']]);
    expect(await record(h, eventId, campaignId, [sent('a@x.vn')])).toMatchObject({ ok: true });
    expect(deliveries(h)).toEqual([['a@x.vn', 'sent'], ['b@x.vn', 'queued']]);
  });

  it('a dead run’s message in flight is never claimed again: after the lease it becomes unknown, for a person to check', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const { campaignId } = await start(h, eventId, [to('a@x.vn')]);
    await marking(h, eventId, campaignId, 'a@x.vn');
    after(h, 'a@x.vn', 60_000);
    expect(await start(h, eventId, [to('a@x.vn')], colleague, MESSAGE, TAB_B)).toMatchObject({ claimed: [], inFlight: ['a@x.vn'] });
    after(h, 'a@x.vn', 2 * CLAIM_LEASE_MS);
    expect(await start(h, eventId, [to('a@x.vn')], colleague, MESSAGE, TAB_B)).toMatchObject({ claimed: [], unclear: ['a@x.vn'] });
    expect(deliveries(h)).toEqual([['a@x.vn', 'unknown']]);
    expect(h.audits().at(-1)!.summary).toContain('1 người có thư đang gửi dở khi phiên gửi trước dừng, chuyển sang "Không rõ đã gửi"');
    expect((await deliveryLogData(h.ctx(xtdtUser), eventId))!.rows[0]).toMatchObject({ status: 'unknown', error: expect.stringContaining('Kiểm tra mục Đã gửi') });
  });

  it('taking over a run of one’s own never sends its message in flight again: it becomes unknown', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const { campaignId } = await start(h, eventId, [to('a@x.vn'), to('b@x.vn')]);
    await marking(h, eventId, campaignId, 'a@x.vn');
    expect(await start(h, eventId, [to('a@x.vn'), to('b@x.vn')], xtdtUser, MESSAGE, TAB_B, true)).toMatchObject({ claimed: ['b@x.vn'], unclear: ['a@x.vn'] });
    expect(deliveries(h)).toEqual([['a@x.vn', 'unknown'], ['b@x.vn', 'queued']]);
  });

  it('the run that sent it may still record what Gmail answered, even once it is unknown; nobody else may', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const { campaignId } = await start(h, eventId, [to('a@x.vn'), to('b@x.vn')]);
    await marking(h, eventId, campaignId, 'a@x.vn');
    await marking(h, eventId, campaignId, 'b@x.vn');
    after(h, 'a@x.vn', 2 * CLAIM_LEASE_MS);
    await start(h, eventId, [to('a@x.vn'), to('b@x.vn')], colleague, MESSAGE, TAB_B);
    expect(deliveries(h)).toEqual([['a@x.vn', 'unknown'], ['b@x.vn', 'unknown']]);
    expect(await record(h, eventId, campaignId, [sent('a@x.vn')], colleague, TAB_B)).toMatchObject({ ok: false, kind: 'conflict' });
    expect(await record(h, eventId, campaignId, [failed('b@x.vn')])).toMatchObject({ ok: false, kind: 'conflict' });
    expect(await record(h, eventId, campaignId, [sent('a@x.vn')])).toMatchObject({ ok: true });
    expect(deliveries(h)).toEqual([['a@x.vn', 'sent'], ['b@x.vn', 'unknown']]);
  });

  it('recording the same result twice (an answer lost on the way back) is not an error', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const { campaignId } = await start(h, eventId, [to('a@x.vn'), to('b@x.vn')]);
    await record(h, eventId, campaignId, [failed('a@x.vn'), sent('b@x.vn')]);
    expect(await record(h, eventId, campaignId, [failed('a@x.vn'), sent('b@x.vn')])).toMatchObject({ ok: true, value: { recorded: 0 } });
  });

  it('a stopped run frees the message it marked but never handed to Gmail', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const { campaignId } = await start(h, eventId, [to('a@x.vn')]);
    await marking(h, eventId, campaignId, 'a@x.vn');
    expect((await h.ok(xtdtUser, 'comms.releaseDeliveries', { eventId, campaignId, runToken: TAB_B, emails: ['a@x.vn'] as Email[] })).value).toEqual({ released: 0 });
    expect((await h.ok(xtdtUser, 'comms.releaseDeliveries', { eventId, campaignId, runToken: TAB_A, emails: ['a@x.vn'] as Email[] })).value).toEqual({ released: 1 });
    expect(deliveries(h)).toEqual([]);
  });
});

describe('a claim that fails before it holds anything leaves nothing behind', () => {
  const input = (eventId: EventId) => ({ eventId, senderEmail: SENDER, ...MESSAGE, attachQr: false, runToken: TAB_A, takeOver: false, recipients: [to('a@x.vn')] });
  const unreadable = (db: Db): Db => ({
    rpc: db.rpc.bind(db),
    table(def) {
      const t = db.table(def);
      return def.name === 'sce_tcsk_email_deliveries' ? { ...t, list: () => Promise.reject(new DbError('unavailable')) } : t;
    },
  });

  it('a read of the claims that fails stores no message and audits nothing', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const audits = h.audits().length;
    expect(await h.runWith(unreadable, xtdtUser, 'comms.startCampaign', input(eventId))).toMatchObject({ ok: false });
    expect(h.rows('sce_tcsk_email_campaigns')).toEqual([]);
    expect(h.audits()).toHaveLength(audits);
  });

  it('a first claim that fails takes the message it stored out again', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const audits = h.audits().length;
    expect(await h.runWith(failingWrites((t, op) => t === 'sce_tcsk_email_deliveries' && op === 'insert'), xtdtUser, 'comms.startCampaign', input(eventId))).toMatchObject({ ok: false });
    expect(h.rows('sce_tcsk_email_campaigns')).toEqual([]);
    expect(deliveries(h)).toEqual([]);
    expect(h.audits()).toHaveLength(audits);
  });
});

describe('a campaign keeps its message', () => {
  it('"Gửi lại thư lỗi" gets the very templates of the failed campaign, so the retry is the same message', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const guest = await h.addGuest(eventId, { email: 'loi@b.vn' as Email });
    const custom = { subject: 'Thư mời riêng {ho_ten}', body: '<p>Nội dung đã sửa cho {danh_xung} {ho_ten}</p>', attachQr: true };
    const { campaignId } = await start(h, eventId, [to('loi@b.vn', guest.id), to('ngoai@x.vn')], xtdtUser, custom);
    await record(h, eventId, campaignId, [failed('loi@b.vn', guest.id), failed('ngoai@x.vn')]);
    const screen = (await invitationScreenData(h.ctx(xtdtUser), eventId, campaignId))!;
    expect(screen.retry).toEqual({ campaignId, guestIds: [guest.id], manual: [{ email: 'ngoai@x.vn', name: 'Người ngoai@x.vn' }], message: custom });
    expect(campaignIdFor(eventId, screen.retry!.message!.subject, screen.retry!.message!.body)).toBe(campaignId);
    // Another officer of the event reads the same message; the latest QR choice wins.
    await start(h, eventId, [to('loi@b.vn', guest.id)], xtdtUser, { ...custom, attachQr: false }, TAB_B);
    expect((await invitationScreenData(h.ctx(admin), eventId, campaignId))!.retry?.message).toEqual({ ...custom, attachQr: false });
  });

  it('the log names a campaign by its subject template, never by a recipient’s merged name', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const { campaignId } = await start(h, eventId, [to('a@x.vn')]);
    await h.run(xtdtUser, 'comms.recordDeliveries', { eventId, campaignId, runToken: TAB_A, senderEmail: SENDER, subject: 'Giấy mời Nguyễn Văn An', results: [sent('a@x.vn')] });
    expect((await deliveryLogData(h.ctx(xtdtUser), eventId))!.campaigns).toEqual([{ id: campaignId, label: MESSAGE.subject }]);
  });
});

describe('comms.recordDeliveries', () => {
  async function claimed(emails: string[], guests = false) {
    const h = harness();
    const eventId = await h.createEvent();
    const ids = new Map<string, GuestId>();
    if (guests) for (const e of emails) ids.set(e, (await h.addGuest(eventId, { email: e as Email, name: `Khách ${e}` })).id);
    const { campaignId } = await start(h, eventId, emails.map((e) => to(e, ids.get(e) ?? null)));
    return { h, eventId, campaignId, ids };
  }

  it('completes claims: sent with Gmail’s id and the server time, guests marked invited, exact counts audited', async () => {
    const { h, eventId, campaignId, ids } = await claimed(['an@a.vn', 'loi@b.vn'], true);
    expect(await record(h, eventId, campaignId, [sent('an@a.vn', ids.get('an@a.vn')), failed('loi@b.vn', ids.get('loi@b.vn'))])).toMatchObject({ ok: true, value: { recorded: 2, notInvited: 0 } });
    const rows = h.rows('sce_tcsk_email_deliveries') as Array<Record<string, unknown>>;
    expect(rows.map((r) => [r.email, r.status, r.provider_message_id, r.sent_at, r.error])).toEqual([
      ['an@a.vn', 'sent', 'msg-an@a.vn', NOW, null],
      ['loi@b.vn', 'error', null, null, 'Gmail: Invalid To header'],
    ]);
    expect(await h.guest(eventId, ids.get('an@a.vn')!)).toMatchObject({ inviteStatus: 'sent', sendMethod: 'email' });
    expect(await h.guest(eventId, ids.get('loi@b.vn')!)).toMatchObject({ inviteStatus: 'pending' });
    expect(h.audits().find((a) => a.action === 'GỬI THƯ MỜI')!.summary).toBe('Gửi thư "Giấy mời" từ btc@x.vn: 1 thư đã gửi, 1 thư lỗi');
  });

  it('refuses a result for an address nobody claimed, and writes nothing', async () => {
    const { h, eventId, campaignId } = await claimed(['a@x.vn']);
    const before = h.rows('sce_tcsk_email_deliveries');
    expect(await record(h, eventId, campaignId, [sent('a@x.vn'), sent('z@x.vn')])).toMatchObject({ ok: false, kind: 'conflict', message: expect.stringContaining('z@x.vn') });
    expect(h.rows('sce_tcsk_email_deliveries')).toEqual(before);
  });

  it.each([
    ['sent without a Gmail id', { ...sent('a@x.vn'), providerMessageId: null }],
    ['sent with an error', { ...sent('a@x.vn'), error: 'x' }],
    ['error without a reason', { ...failed('a@x.vn'), error: null }],
    ['a dev-fake id outside the dev runtime', { ...sent('a@x.vn'), providerMessageId: 'dev-fake-1' }],
    ['an address with a line break', { ...sent('a@x.vn'), email: 'a@x.vn\r\nBcc: v@evil.com' }],
  ])('refuses %s', async (_, result) => {
    const { h, eventId, campaignId } = await claimed(['a@x.vn']);
    expect(await record(h, eventId, campaignId, [result as never])).toMatchObject({ ok: false, kind: 'invalid' });
    expect(deliveries(h)).toEqual([['a@x.vn', 'queued']]);
  });

  it('retry: an error is claimed again and can become sent; a success is never overwritten', async () => {
    const { h, eventId, campaignId } = await claimed(['a@x.vn', 'b@x.vn']);
    await record(h, eventId, campaignId, [failed('a@x.vn'), sent('b@x.vn')]);
    const retry = await start(h, eventId, [to('a@x.vn'), to('b@x.vn')], xtdtUser, MESSAGE, TAB_B);
    expect(retry).toMatchObject({ claimed: ['a@x.vn'], alreadySent: ['b@x.vn'] });
    expect(await record(h, eventId, campaignId, [sent('a@x.vn'), failed('b@x.vn')], xtdtUser, TAB_B)).toMatchObject({ ok: true, value: { recorded: 1 } });
    expect(deliveries(h)).toEqual([['a@x.vn', 'sent'], ['b@x.vn', 'sent']]);
    expect(h.audits().at(-1)!.summary).toContain('1 kết quả bỏ qua vì đã gửi thành công trước đó');
  });

  it('a batch that stops part-way audits what was recorded and fails, naming the loss', async () => {
    const { h, eventId, campaignId } = await claimed(['a@x.vn', 'b@x.vn']);
    const audits = h.audits().length;
    const r = await h.runWith(failingWrites((t, op, nth) => t === 'sce_tcsk_email_deliveries' && op === 'update' && nth === 1), xtdtUser, 'comms.recordDeliveries', {
      eventId, campaignId, runToken: TAB_A, senderEmail: SENDER, subject: 'Giấy mời', results: [sent('a@x.vn'), sent('b@x.vn')],
    });
    expect(r).toMatchObject({ ok: false, kind: 'conflict', message: 'Chỉ ghi được 1/2 kết quả gửi. Kiểm tra Nhật ký gửi trước khi gửi tiếp.' });
    expect(deliveries(h)).toEqual([['a@x.vn', 'sent'], ['b@x.vn', 'queued']]);
    expect(h.audits().slice(audits)).toEqual([expect.objectContaining({ action: 'GỬI THƯ MỜI', summary: 'Gửi thư "Giấy mời" từ btc@x.vn: ghi được 1 thư đã gửi, 0 thư lỗi rồi dừng vì lỗi; 1 kết quả chưa ghi' })]);
  });
});

describe('a send whose answer was lost', () => {
  it('is recorded as unknown, never claimed again by any run, until an officer marks it not sent', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const g = await h.addGuest(eventId, { email: 'a@x.vn' as Email });
    const { campaignId } = await start(h, eventId, [to('a@x.vn', g.id), to('b@x.vn')]);
    expect(await record(h, eventId, campaignId, [lost('a@x.vn', g.id)])).toMatchObject({ ok: true, value: { recorded: 1 } });
    expect(h.audits().at(-1)!.summary).toContain('1 thư không rõ đã gửi hay chưa');
    // Not marked invited: nobody knows yet.
    expect(await h.guest(eventId, g.id)).toMatchObject({ inviteStatus: 'pending' });
    expect(await start(h, eventId, [to('a@x.vn', g.id)], xtdtUser, MESSAGE, TAB_B, true)).toMatchObject({ claimed: [], unclear: ['a@x.vn'] });
    expect(await start(h, eventId, [to('a@x.vn', g.id)], colleague, MESSAGE, TAB_B)).toMatchObject({ claimed: [], unclear: ['a@x.vn'] });

    const marked = await h.ok(xtdtUser, 'comms.markNotSent', { eventId, campaignId, emails: ['a@x.vn', 'b@x.vn'] as Email[] });
    expect(marked.value).toEqual({ marked: 1 });
    expect(h.audits().at(-1)).toMatchObject({ action: 'XÁC NHẬN THƯ CHƯA GỬI', summary: expect.stringContaining('1 thư') });
    expect(deliveries(h)).toEqual([['a@x.vn', 'error'], ['b@x.vn', 'queued']]);
    expect((await start(h, eventId, [to('a@x.vn', g.id)], xtdtUser, MESSAGE, TAB_B)).claimed).toEqual(['a@x.vn']);
  });

  it('a message a take-over turned unknown is not confirmed unsent while its first run may still answer; that run’s late "sent" stands', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const { campaignId } = await start(h, eventId, [to('a@x.vn')]);
    await marking(h, eventId, campaignId, 'a@x.vn');
    // The officer takes over while the first tab still waits for Gmail.
    expect(await start(h, eventId, [to('a@x.vn')], xtdtUser, MESSAGE, TAB_B, true)).toMatchObject({ unclear: ['a@x.vn'] });
    const audits = h.audits().length;
    const early = await h.run(xtdtUser, 'comms.markNotSent', { eventId, campaignId, emails: ['a@x.vn'] as Email[] });
    expect(early).toMatchObject({ ok: false, kind: 'conflict', message: expect.stringContaining('phiên gửi trước có thể vẫn đang chờ Gmail trả lời') });
    expect(h.audits()).toHaveLength(audits);
    expect(deliveries(h)).toEqual([['a@x.vn', 'unknown']]);
    expect(await record(h, eventId, campaignId, [sent('a@x.vn')])).toMatchObject({ ok: true });
    expect(deliveries(h)).toEqual([['a@x.vn', 'sent']]);
  });

  it('once that run’s lease is over, the officer may confirm it unsent', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const { campaignId } = await start(h, eventId, [to('a@x.vn')]);
    await marking(h, eventId, campaignId, 'a@x.vn');
    await start(h, eventId, [to('a@x.vn')], xtdtUser, MESSAGE, TAB_B, true);
    after(h, 'a@x.vn', CLAIM_LEASE_MS + CLAIM_SKEW_MS);
    expect((await h.ok(xtdtUser, 'comms.markNotSent', { eventId, campaignId, emails: ['a@x.vn'] as Email[] })).value).toEqual({ marked: 1 });
  });

  it('marking not sent touches only unknown rows: a sent, failed, claimed or in-flight message stays as it is', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const { campaignId } = await start(h, eventId, [to('s@x.vn'), to('e@x.vn'), to('q@x.vn'), to('f@x.vn')]);
    await record(h, eventId, campaignId, [sent('s@x.vn'), failed('e@x.vn')]);
    await marking(h, eventId, campaignId, 'f@x.vn');
    const before = h.rows('sce_tcsk_email_deliveries');
    const audits = h.audits().length;
    const r = await h.ok(xtdtUser, 'comms.markNotSent', { eventId, campaignId, emails: ['s@x.vn', 'e@x.vn', 'q@x.vn', 'f@x.vn', 'none@x.vn'] as Email[] });
    expect(r.value).toEqual({ marked: 0 });
    expect(h.rows('sce_tcsk_email_deliveries')).toEqual(before);
    expect(h.audits()).toHaveLength(audits + 1);
  });

  it('an unknown result never overwrites a success', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const { campaignId } = await start(h, eventId, [to('a@x.vn')]);
    await record(h, eventId, campaignId, [sent('a@x.vn')]);
    expect(await record(h, eventId, campaignId, [lost('a@x.vn')])).toMatchObject({ ok: true, value: { recorded: 0 } });
    expect(deliveries(h)).toEqual([['a@x.vn', 'sent']]);
  });
});

describe('comms.markSending', () => {
  it('is a write like any other: one audit row, also when the run no longer holds the claim', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const { campaignId } = await start(h, eventId, [to('a@x.vn')]);
    const audits = h.audits().length;
    expect(await marking(h, eventId, campaignId, 'a@x.vn')).toMatchObject({ ok: true, value: { held: true } });
    expect(deliveries(h)).toEqual([['a@x.vn', 'sending']]);
    expect(h.audits().slice(audits)).toEqual([expect.objectContaining({ action: 'ĐANG GỬI THƯ', summary: 'Bắt đầu gửi thư "Giấy mời {ho_ten}" tới a@x.vn' })]);
    expect(await marking(h, eventId, campaignId, 'a@x.vn', TAB_B)).toMatchObject({ ok: true, value: { held: false } });
    expect(h.audits().at(-1)).toMatchObject({ action: 'ĐANG GỬI THƯ', summary: expect.stringContaining('Không gửi thư tới a@x.vn: phiên gửi này không còn giữ chỗ') });
    expect(deliveries(h)).toEqual([['a@x.vn', 'sending']]);
  });

  it('a record marks the run’s next message as being sent, in its own audit row', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const { campaignId } = await start(h, eventId, [to('a@x.vn'), to('b@x.vn')]);
    await marking(h, eventId, campaignId, 'a@x.vn');
    const audits = h.audits().length;
    const r = await h.ok(xtdtUser, 'comms.recordDeliveries', { eventId, campaignId, runToken: TAB_A, senderEmail: SENDER, subject: 'Giấy mời', results: [sent('a@x.vn')], next: 'b@x.vn' as Email });
    expect(r.value).toEqual({ recorded: 1, notInvited: 0, nextHeld: true });
    expect(deliveries(h)).toEqual([['a@x.vn', 'sent'], ['b@x.vn', 'sending']]);
    expect(h.audits().slice(audits)).toEqual([expect.objectContaining({ action: 'GỬI THƯ MỜI', summary: expect.stringContaining('bắt đầu gửi thư tiếp theo tới b@x.vn') })]);
    // Another run's claim is not this run's to mark: the record stands and says so.
    expect((await start(h, eventId, [to('c@x.vn')], colleague, MESSAGE, TAB_B)).claimed).toEqual(['c@x.vn']);
    const lost = await h.ok(xtdtUser, 'comms.recordDeliveries', { eventId, campaignId, runToken: TAB_A, senderEmail: SENDER, subject: 'Giấy mời', results: [sent('b@x.vn')], next: 'c@x.vn' as Email });
    expect(lost.value).toEqual({ recorded: 1, notInvited: 0, nextHeld: false });
    expect(deliveries(h)).toEqual([['a@x.vn', 'sent'], ['b@x.vn', 'sent'], ['c@x.vn', 'queued']]);
  });
});

describe('comms.releaseDeliveries', () => {
  it('frees this run’s unused claims only: recorded results and other runs’ claims stay', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const { campaignId } = await start(h, eventId, [to('a@x.vn'), to('b@x.vn')]);
    await record(h, eventId, campaignId, [sent('a@x.vn')]);
    const stamped = Date.parse((h.rows('sce_tcsk_email_deliveries') as Array<{ updated_at: string }>)[0]!.updated_at);
    h.clock.now = new Date(stamped + 1000).toISOString() as Instant;
    await start(h, eventId, [to('c@x.vn')], colleague, MESSAGE, TAB_B);
    await start(h, eventId, [to('d@x.vn')], xtdtUser, MESSAGE, TAB_B);
    const r = await h.ok(xtdtUser, 'comms.releaseDeliveries', { eventId, campaignId, runToken: TAB_A, emails: ['a@x.vn', 'b@x.vn', 'c@x.vn', 'd@x.vn'] as Email[] });
    expect(r.value).toEqual({ released: 1 });
    expect(deliveries(h)).toEqual([['a@x.vn', 'sent'], ['c@x.vn', 'queued'], ['d@x.vn', 'queued']]);
    expect(h.audits().at(-1)).toMatchObject({ action: 'DỪNG GỬI THƯ', summary: 'Bỏ giữ chỗ 1 thư chưa gửi của đợt gửi' });
  });

  it('a message marked as being sent that never reached Gmail goes back to a claim, then is freed, as Postgres allows', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const { campaignId } = await start(h, eventId, [to('a@x.vn'), to('b@x.vn')]);
    expect(await marking(h, eventId, campaignId, 'a@x.vn')).toMatchObject({ ok: true, value: { held: true } });
    // 202611041480: Postgres refuses to delete a 'sending' row; memoryDb does not emulate the guard.
    const postgresDeletes = (db: Db): Db => ({
      rpc: db.rpc.bind(db),
      table(def) {
        const t = db.table(def);
        if (def.name !== 'sce_tcsk_email_deliveries') return t;
        return { ...t, remove: async (id, o) => ((await t.get(id) as { status?: string } | null)?.status === 'sending' ? Promise.reject(new DbError('forbidden')) : t.remove(id, o)) };
      },
    });
    const r = await h.runWith(postgresDeletes, xtdtUser, 'comms.releaseDeliveries', { eventId, campaignId, runToken: TAB_A, emails: ['a@x.vn', 'b@x.vn'] as Email[] });
    expect(r).toMatchObject({ ok: true, value: { released: 2 } });
    expect(deliveries(h)).toEqual([]);
  });
});

describe('comms.renewClaims', () => {
  it('keeps a long run’s unsent tail: a colleague 31 minutes after the claim still cannot take it', async () => {
    const t0 = Date.parse(NOW);
    const h = harness();
    const at = (min: number) => {
      vi.setSystemTime(t0 + min * 60_000);
      h.clock.now = new Date(t0 + min * 60_000).toISOString() as Instant;
    };
    at(0);
    const eventId = await h.createEvent();
    const { campaignId } = await start(h, eventId, [to('a@x.vn'), to('b@x.vn')]);
    at(29);
    await record(h, eventId, campaignId, [sent('a@x.vn')]);
    const renewed = await h.ok(xtdtUser, 'comms.renewClaims', { eventId, campaignId, runToken: TAB_A });
    expect(renewed.value).toEqual({ held: ['b@x.vn'] });
    at(31);
    expect(await start(h, eventId, [to('a@x.vn'), to('b@x.vn')], colleague, MESSAGE, TAB_B)).toMatchObject({ claimed: [], alreadySent: ['a@x.vn'], inFlight: ['b@x.vn'] });
    // Without a renewal the lease (and the clock-skew margin) runs out and the claim may be taken over.
    at(29 + (CLAIM_LEASE_MS + CLAIM_SKEW_MS) / 60_000);
    expect(await start(h, eventId, [to('b@x.vn')], colleague, MESSAGE, TAB_B)).toMatchObject({ claimed: ['b@x.vn'] });
    // A renewal that holds nothing renews nothing: it fails and writes no audit row.
    const audits = h.audits().length;
    expect(await h.run(xtdtUser, 'comms.renewClaims', { eventId, campaignId, runToken: TAB_A })).toMatchObject({ ok: false, kind: 'conflict' });
    expect(h.audits()).toHaveLength(audits);
  });
});

describe('audit rows of commands that write more than once', () => {
  const refusing: AuditWriter = async () => {
    throw new DbError('forbidden');
  };
  const failingNth = (table: string, op: 'insert' | 'update' | 'remove', n: number) => failingWrites((t, o, nth) => t === table && o === op && nth === n);
  const newRows = (h: H, from: number) => h.audits().slice(from);

  it('a confirmation that stops part-way writes one row naming what it marked', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const { campaignId } = await start(h, eventId, [to('a@x.vn'), to('b@x.vn')]);
    await record(h, eventId, campaignId, [lost('a@x.vn'), lost('b@x.vn')]);
    const audits = h.audits().length;
    const r = await h.runWith(failingNth('sce_tcsk_email_deliveries', 'update', 1), xtdtUser, 'comms.markNotSent', { eventId, campaignId, emails: ['a@x.vn', 'b@x.vn'] as Email[] });
    expect(r).toMatchObject({ ok: false, kind: 'conflict', message: 'Chỉ xác nhận được 1 thư là chưa gửi. Tải lại Nhật ký gửi.' });
    expect(deliveries(h)).toEqual([['a@x.vn', 'error'], ['b@x.vn', 'unknown']]);
    expect(newRows(h, audits)).toEqual([expect.objectContaining({ action: 'XÁC NHẬN THƯ CHƯA GỬI', summary: expect.stringContaining('Xác nhận 1 thư không rõ kết quả là chưa gửi rồi dừng vì lỗi') })]);
  });

  it('a release that stops part-way writes one row naming what it freed', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const { campaignId } = await start(h, eventId, [to('a@x.vn'), to('b@x.vn')]);
    const audits = h.audits().length;
    const r = await h.runWith(failingNth('sce_tcsk_email_deliveries', 'remove', 1), xtdtUser, 'comms.releaseDeliveries', { eventId, campaignId, runToken: TAB_A, emails: ['a@x.vn', 'b@x.vn'] as Email[] });
    expect(r).toMatchObject({ ok: false, kind: 'conflict', message: 'Chỉ bỏ giữ chỗ được 1 thư chưa gửi.' });
    expect(deliveries(h)).toEqual([['b@x.vn', 'queued']]);
    expect(newRows(h, audits)).toEqual([expect.objectContaining({ action: 'DỪNG GỬI THƯ', summary: expect.stringContaining('Bỏ giữ chỗ 1 thư chưa gửi rồi dừng vì lỗi') })]);
  });

  it('a renewal that stops part-way writes one row; one that renewed nothing writes none', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const { campaignId } = await start(h, eventId, [to('a@x.vn'), to('b@x.vn')]);
    const audits = h.audits().length;
    expect(await h.runWith(failingNth('sce_tcsk_email_deliveries', 'update', 0), xtdtUser, 'comms.renewClaims', { eventId, campaignId, runToken: TAB_A })).toMatchObject({ ok: false, kind: 'unavailable' });
    expect(newRows(h, audits)).toEqual([]);
    const r = await h.runWith(failingNth('sce_tcsk_email_deliveries', 'update', 1), xtdtUser, 'comms.renewClaims', { eventId, campaignId, runToken: TAB_A });
    expect(r).toMatchObject({ ok: false, kind: 'conflict', message: 'Chỉ gia hạn được 1 thư chưa gửi.' });
    expect(newRows(h, audits)).toEqual([expect.objectContaining({ action: 'GIA HẠN GIỮ CHỖ', summary: 'Gia hạn giữ chỗ 1 thư chưa gửi của đợt gửi đang chạy rồi dừng vì lỗi' })]);
  });

  it('a first claim that fails and cannot take its message back out writes one row saying the message stayed', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const audits = h.audits().length;
    const r = await h.runWith(failingWrites((t, op) => (t === 'sce_tcsk_email_deliveries' && op === 'insert') || (t === 'sce_tcsk_email_campaigns' && op === 'remove')), xtdtUser, 'comms.startCampaign', {
      eventId, senderEmail: SENDER, ...MESSAGE, attachQr: false, runToken: TAB_A, takeOver: false, recipients: [to('a@x.vn')],
    });
    expect(r).toMatchObject({ ok: false, kind: 'conflict', message: 'Chưa giữ chỗ được người nhận nào. Hãy bấm gửi lại sau ít phút.' });
    expect(h.rows('sce_tcsk_email_campaigns')).toHaveLength(1);
    expect(deliveries(h)).toEqual([]);
    expect(newRows(h, audits)).toEqual([expect.objectContaining({ action: 'BẮT ĐẦU GỬI THƯ', summary: `Lưu nội dung thư "${MESSAGE.subject}" nhưng không giữ chỗ được người nhận nào vì lỗi; chưa thư nào được gửi` })]);
  });

  it('a partial failure whose row the database refuses still fails, keeps what stuck, and logs the entry', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const h = harness();
    const eventId = await h.createEvent();
    const { campaignId } = await start(h, eventId, [to('a@x.vn'), to('b@x.vn')]);
    const audits = h.audits().length;
    const r = await h.runWith(failingNth('sce_tcsk_email_deliveries', 'update', 1), xtdtUser, 'comms.recordDeliveries', {
      eventId, campaignId, runToken: TAB_A, senderEmail: SENDER, subject: 'Giấy mời', results: [sent('a@x.vn'), sent('b@x.vn')],
    }, refusing);
    expect(r).toMatchObject({ ok: false, kind: 'conflict', message: 'Chỉ ghi được 1/2 kết quả gửi. Kiểm tra Nhật ký gửi trước khi gửi tiếp.' });
    expect(deliveries(h)).toEqual([['a@x.vn', 'sent'], ['b@x.vn', 'queued']]);
    expect(newRows(h, audits)).toEqual([]);
    expect(log).toHaveBeenCalledWith('command comms.recordDeliveries: partial-failure audit row not written', expect.objectContaining({ action: 'GỬI THƯ MỜI', perm: 'comms.send' }), expect.any(DbError));
    log.mockRestore();
  });

  describe('a change saved whose row the database refuses is reported saved, unaudited, never as a failure', () => {
    type Prepared = { input: unknown; after: unknown[][]; check?: () => Promise<void> };
    const cases: ReadonlyArray<[CommandId, (h: H, eventId: EventId) => Promise<Prepared>]> = [
      ['comms.startCampaign', async (_h, eventId) => ({
        input: { eventId, senderEmail: SENDER, ...MESSAGE, attachQr: false, runToken: TAB_A, takeOver: false, recipients: [to('a@x.vn')] },
        after: [['a@x.vn', 'queued']],
      })],
      ['comms.markSending', async (h, eventId) => {
        const { campaignId } = await start(h, eventId, [to('a@x.vn')]);
        return { input: { eventId, campaignId, runToken: TAB_A, email: 'a@x.vn' }, after: [['a@x.vn', 'sending']] };
      }],
      ['comms.recordDeliveries', async (h, eventId) => {
        const g = await h.addGuest(eventId, { email: 'a@x.vn' as Email });
        const { campaignId } = await start(h, eventId, [to('a@x.vn', g.id), to('b@x.vn')]);
        return {
          input: { eventId, campaignId, runToken: TAB_A, senderEmail: SENDER, subject: 'Giấy mời', results: [sent('a@x.vn', g.id), failed('b@x.vn')] },
          after: [['a@x.vn', 'sent'], ['b@x.vn', 'error']],
          check: async () => expect(await h.guest(eventId, g.id)).toMatchObject({ inviteStatus: 'sent' }),
        };
      }],
      ['comms.renewClaims', async (h, eventId) => {
        const { campaignId } = await start(h, eventId, [to('a@x.vn')]);
        return { input: { eventId, campaignId, runToken: TAB_A }, after: [['a@x.vn', 'queued']] };
      }],
      ['comms.markNotSent', async (h, eventId) => {
        const { campaignId } = await start(h, eventId, [to('a@x.vn')]);
        await record(h, eventId, campaignId, [lost('a@x.vn')]);
        return { input: { eventId, campaignId, emails: ['a@x.vn'] }, after: [['a@x.vn', 'error']] };
      }],
      ['comms.releaseDeliveries', async (h, eventId) => {
        const { campaignId } = await start(h, eventId, [to('a@x.vn'), to('b@x.vn')]);
        return { input: { eventId, campaignId, runToken: TAB_A, emails: ['a@x.vn'] }, after: [['b@x.vn', 'queued']] };
      }],
    ];

    it.each(cases)('%s', async (id, prepare) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const h = harness();
      const eventId = await h.createEvent();
      const { input, after, check } = await prepare(h, eventId);
      const audits = h.audits().length;
      expect(await h.runWith((db) => db, xtdtUser, id, input as never, refusing)).toMatchObject({ ok: true, unaudited: MESSAGES.unaudited });
      expect(deliveries(h)).toEqual(after);
      await check?.();
      expect(h.audits()).toHaveLength(audits);
      expect(log).toHaveBeenCalledWith(`command ${id}: saved, but its audit row was not written`, expect.objectContaining({ command: id, perm: 'comms.send' }), expect.any(DbError));
      log.mockRestore();
    });
  });
});
