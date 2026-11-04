import { describe, expect, it } from 'vitest';
import type { CampaignId, Email, EventId, GuestId, Instant } from '@/core/brand';
import { testActor, XTDT } from '@/core/testing/actors';
import { campaignIdFor, CLAIM_LEASE_MS } from '../server/deliveries';
import { failingWrites, harness, NOW, xtdtUser } from './harness';

const SENDER = 'btc@x.vn' as Email;
const MESSAGE = { subject: 'Giấy mời {ho_ten}', body: '<p>Kính gửi {danh_xung} {ho_ten}</p>' };
const colleague = testActor('user', XTDT);

type H = ReturnType<typeof harness>;
const to = (email: string, guestId: GuestId | null = null) => ({ guestId, email: email as Email, recipientName: `Người ${email}` });
const sent = (email: string, guestId: GuestId | null = null) => ({ ...to(email, guestId), status: 'sent' as const, providerMessageId: `msg-${email}`, error: null });
const failed = (email: string, guestId: GuestId | null = null) => ({ ...to(email, guestId), status: 'error' as const, providerMessageId: null, error: 'Gmail: Invalid To header' });

const start = async (h: H, eventId: EventId, recipients: ReturnType<typeof to>[], actor = xtdtUser, message = MESSAGE) =>
  (await h.ok(actor, 'comms.startCampaign', { eventId, senderEmail: SENDER, ...message, recipients })).value;
const record = (h: H, eventId: EventId, campaignId: CampaignId, results: ReadonlyArray<ReturnType<typeof sent> | ReturnType<typeof failed>>, actor = xtdtUser) =>
  h.run(actor, 'comms.recordDeliveries', { eventId, campaignId, senderEmail: SENDER, subject: 'Giấy mời', results });
const deliveries = (h: H) =>
  (h.rows('sce_tcsk_email_deliveries') as Array<Record<string, unknown>>).map((r) => [r.email, r.status]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));

describe('comms.startCampaign', () => {
  it('claims each address as queued, once, under an id that the message decides', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const r = await start(h, eventId, [to('a@x.vn'), to('b@x.vn'), to('a@x.vn')]);
    expect(r).toEqual({ campaignId: campaignIdFor(eventId, MESSAGE.subject, MESSAGE.body), claimed: ['a@x.vn', 'b@x.vn'], alreadySent: [], inFlight: [] });
    expect(deliveries(h)).toEqual([['a@x.vn', 'queued'], ['b@x.vn', 'queued']]);
    expect(h.audits().at(-1)).toMatchObject({ action: 'BẮT ĐẦU GỬI THƯ', summary: `Bắt đầu đợt gửi "${MESSAGE.subject}" từ btc@x.vn: giữ chỗ 2 người nhận` });
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
    expect(await start(h, eventId, [to('a@x.vn'), to('b@x.vn')], colleague)).toMatchObject({ claimed: ['b@x.vn'], inFlight: ['a@x.vn'] });
    // The same officer resumes their own claim at once.
    expect(await start(h, eventId, [to('a@x.vn')])).toMatchObject({ claimed: ['a@x.vn'], inFlight: [] });
    h.clock.now = new Date(Date.parse(String((h.rows('sce_tcsk_email_deliveries') as Array<{ email: string; updated_at: string }>).find((r) => r.email === 'a@x.vn')!.updated_at)) + CLAIM_LEASE_MS + 1).toISOString() as Instant;
    expect(await start(h, eventId, [to('a@x.vn')], colleague)).toMatchObject({ claimed: ['a@x.vn'], inFlight: [] });
  });

  it('a claim that stops part-way audits what it holds and fails', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const r = await h.runWith(failingWrites((t, op, nth) => t === 'sce_tcsk_email_deliveries' && op === 'insert' && nth === 1), xtdtUser, 'comms.startCampaign', {
      eventId, senderEmail: SENDER, ...MESSAGE, recipients: [to('a@x.vn'), to('b@x.vn')],
    });
    expect(r).toMatchObject({ ok: false, kind: 'conflict', message: expect.stringContaining('Đã giữ chỗ 1 người nhận') });
    expect(deliveries(h)).toEqual([['a@x.vn', 'queued']]);
    expect(h.audits().at(-1)).toMatchObject({ action: 'BẮT ĐẦU GỬI THƯ', summary: expect.stringContaining('đã giữ chỗ 1 người nhận rồi dừng vì lỗi') });
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
    const retry = await start(h, eventId, [to('a@x.vn'), to('b@x.vn')]);
    expect(retry).toMatchObject({ claimed: ['a@x.vn'], alreadySent: ['b@x.vn'] });
    expect(await record(h, eventId, campaignId, [sent('a@x.vn'), failed('b@x.vn')])).toMatchObject({ ok: true, value: { recorded: 1 } });
    expect(deliveries(h)).toEqual([['a@x.vn', 'sent'], ['b@x.vn', 'sent']]);
    expect(h.audits().at(-1)!.summary).toContain('1 kết quả bỏ qua vì đã gửi thành công trước đó');
  });

  it('a batch that stops part-way audits what was recorded and fails, naming the loss', async () => {
    const { h, eventId, campaignId } = await claimed(['a@x.vn', 'b@x.vn']);
    const r = await h.runWith(failingWrites((t, op, nth) => t === 'sce_tcsk_email_deliveries' && op === 'update' && nth === 1), xtdtUser, 'comms.recordDeliveries', {
      eventId, campaignId, senderEmail: SENDER, subject: 'Giấy mời', results: [sent('a@x.vn'), sent('b@x.vn')],
    });
    expect(r).toMatchObject({ ok: false, kind: 'conflict', message: 'Chỉ ghi được 1/2 kết quả gửi. Kiểm tra Nhật ký gửi trước khi gửi tiếp.' });
    expect(deliveries(h)).toEqual([['a@x.vn', 'sent'], ['b@x.vn', 'queued']]);
    expect(h.audits().at(-1)).toMatchObject({ action: 'GỬI THƯ MỜI', summary: 'Gửi thư "Giấy mời" từ btc@x.vn: ghi được 1 thư đã gửi, 0 thư lỗi rồi dừng vì lỗi; 1 kết quả chưa ghi' });
  });
});

describe('comms.releaseDeliveries', () => {
  it('frees my unused claims only: recorded results and another officer’s fresh claims stay', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const { campaignId } = await start(h, eventId, [to('a@x.vn'), to('b@x.vn')]);
    await record(h, eventId, campaignId, [sent('a@x.vn')]);
    const stamped = Date.parse((h.rows('sce_tcsk_email_deliveries') as Array<{ updated_at: string }>)[0]!.updated_at);
    h.clock.now = new Date(stamped + 1000).toISOString() as Instant;
    await start(h, eventId, [to('c@x.vn')], colleague);
    const r = await h.ok(xtdtUser, 'comms.releaseDeliveries', { eventId, campaignId, emails: ['a@x.vn', 'b@x.vn', 'c@x.vn'] as Email[] });
    expect(r.value).toEqual({ released: 1 });
    expect(deliveries(h)).toEqual([['a@x.vn', 'sent'], ['c@x.vn', 'queued']]);
    expect(h.audits().at(-1)).toMatchObject({ action: 'DỪNG GỬI THƯ', summary: 'Bỏ giữ chỗ 1 thư chưa gửi của đợt gửi' });
  });
});
