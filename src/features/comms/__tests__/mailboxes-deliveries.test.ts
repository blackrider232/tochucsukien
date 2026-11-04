import { describe, expect, it } from 'vitest';
import { newId, type CampaignId, type Email, type MailboxId } from '@/core/brand';
import { testActor } from '@/core/testing/actors';
import type { MailboxDraft } from '../domain/schemas';
import { admin, harness, xtdtUser } from './harness';

const draft = (email: string, over: Partial<MailboxDraft> = {}): MailboxDraft => ({ displayName: `Hòm thư ${email}`, email: email as Email, clientId: null, isDefault: false, ...over });

function mailboxes(h: ReturnType<typeof harness>) {
  return (h.rows('sce_tcsk_sender_mailboxes') as Array<{ id: string; email: string; is_default: boolean; version: number }>).map((m) => ({ email: m.email, isDefault: m.is_default }));
}

async function add(h: ReturnType<typeof harness>, email: string, over: Partial<MailboxDraft> = {}) {
  const id = newId<'Mailbox'>();
  return (await h.ok(admin, 'comms.saveMailbox', { id, version: null, draft: draft(email, over) })).value;
}

describe('sender mailboxes', () => {
  it('makes the first mailbox the default and keeps exactly one default', async () => {
    const h = harness();
    await add(h, 'a@x.vn');
    await add(h, 'b@x.vn');
    expect(mailboxes(h)).toEqual([{ email: 'a@x.vn', isDefault: true }, { email: 'b@x.vn', isDefault: false }]);
    await add(h, 'c@x.vn', { isDefault: true });
    expect(mailboxes(h).filter((m) => m.isDefault)).toEqual([{ email: 'c@x.vn', isDefault: true }]);
  });

  it('refuses to switch the default off without a successor, and refuses a taken address', async () => {
    const h = harness();
    const a = await add(h, 'a@x.vn');
    await add(h, 'b@x.vn');
    expect(await h.run(admin, 'comms.saveMailbox', { id: a.id, version: a.version, draft: draft('a@x.vn', { isDefault: false }) })).toMatchObject({ ok: false, kind: 'invalid' });
    expect(await h.run(admin, 'comms.saveMailbox', { id: newId<'Mailbox'>(), version: null, draft: draft('A@X.VN') })).toMatchObject({ ok: false, kind: 'invalid', fieldErrors: { email: expect.any(String) } });
    expect(mailboxes(h).filter((m) => m.isDefault)).toHaveLength(1);
  });

  it('undoes "set as default" through the same rules, giving the default back to the previous one', async () => {
    const h = harness();
    await add(h, 'a@x.vn');
    const b = await add(h, 'b@x.vn');
    const r = await h.ok(admin, 'comms.saveMailbox', { id: b.id, version: b.version, draft: draft('b@x.vn', { isDefault: true }) });
    expect(mailboxes(h).find((m) => m.isDefault)?.email).toBe('b@x.vn');
    expect((await h.undo(admin, r.inverse)).ok).toBe(true);
    expect(mailboxes(h)).toEqual([{ email: 'a@x.vn', isDefault: true }, { email: 'b@x.vn', isDefault: false }]);
  });

  it('deleting the default promotes the next, and undo restores both through the save rules', async () => {
    const h = harness();
    const a = await add(h, 'a@x.vn');
    await add(h, 'b@x.vn');
    const r = await h.ok(admin, 'comms.deleteMailbox', { id: a.id, version: a.version });
    expect(mailboxes(h)).toEqual([{ email: 'b@x.vn', isDefault: true }]);
    expect(h.audits().at(-1)!.summary).toContain('đặt "Hòm thư b@x.vn" <b@x.vn> làm mặc định');
    expect((await h.undo(admin, r.inverse)).ok).toBe(true);
    expect(mailboxes(h).filter((m) => m.isDefault)).toEqual([{ email: 'a@x.vn', isDefault: true }]);
    expect(mailboxes(h)).toHaveLength(2);
  });

  it('a stale version changes nothing, not even the other default', async () => {
    const h = harness();
    await add(h, 'a@x.vn');
    const b = await add(h, 'b@x.vn');
    const r = await h.run(admin, 'comms.saveMailbox', { id: b.id, version: (b.version + 5) as never, draft: draft('b@x.vn', { isDefault: true }) });
    expect(r).toMatchObject({ ok: false, kind: 'conflict' });
    expect(mailboxes(h)).toEqual([{ email: 'a@x.vn', isDefault: true }, { email: 'b@x.vn', isDefault: false }]);
  });

  it('refuses a Client ID that is not a Google web client id', async () => {
    const h = harness();
    const r = await h.run(admin, 'comms.saveMailbox', { id: newId<'Mailbox'>(), version: null, draft: draft('a@x.vn', { clientId: 'javascript:alert(1)' }) });
    expect(r).toMatchObject({ ok: false, kind: 'invalid', fieldErrors: { 'draft.clientId': expect.any(String) } });
  });

  it.each(['leader', 'dept_leader', 'user'] as const)('refuses every mailbox command to %s, even with RLS bypassed', async (role) => {
    const h = harness();
    const a = await add(h, 'a@x.vn');
    const actor = testActor(role, role === 'leader' ? null : 'Phòng Xúc tiến đầu tư');
    const before = h.rows('sce_tcsk_sender_mailboxes');
    for (const [id, input] of [
      ['comms.saveMailbox', { id: newId<'Mailbox'>() as MailboxId, version: null, draft: draft('z@x.vn') }],
      ['comms.saveMailbox', { id: a.id, version: a.version, draft: draft('a@x.vn', { clientId: '1-abc.apps.googleusercontent.com', isDefault: true }) }],
      ['comms.deleteMailbox', { id: a.id, version: a.version }],
      ['comms.restoreMailbox', { id: newId<'Mailbox'>(), draft: draft('y@x.vn') }],
    ] as const) {
      expect(await h.runWithoutRls(actor, id, input as never)).toMatchObject({ ok: false, kind: 'forbidden' });
    }
    expect(h.rows('sce_tcsk_sender_mailboxes')).toEqual(before);
  });
});

describe('comms.recordDeliveries', () => {
  const campaign = () => newId<'EmailCampaign'>() as CampaignId;
  const sent = (email: string, guestId: string | null = null) => ({ guestId: guestId as never, email: email as Email, recipientName: 'An', status: 'sent' as const, providerMessageId: `msg-${email}`, error: null });
  const failed = (email: string, guestId: string | null = null) => ({ guestId: guestId as never, email: email as Email, recipientName: 'An', status: 'error' as const, providerMessageId: null, error: 'Gmail: Invalid To header' });

  it('writes sent rows with Gmail’s id and the server time, marks guests invited, and audits exact counts', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const g = await h.addGuest(eventId, { email: 'an@a.vn' as Email });
    const c = campaign();
    await h.ok(xtdtUser, 'comms.recordDeliveries', { eventId, campaignId: c, senderEmail: 'btc@x.vn' as Email, subject: 'Giấy mời', results: [sent('an@a.vn', g.id), failed('loi@b.vn')] });
    const rows = h.rows('sce_tcsk_email_deliveries') as Array<Record<string, unknown>>;
    expect(rows.map((r) => [r.email, r.status, r.provider_message_id, r.sent_at, r.error])).toEqual([
      ['an@a.vn', 'sent', 'msg-an@a.vn', '2026-11-04T02:00:00.000Z', null],
      ['loi@b.vn', 'error', null, null, 'Gmail: Invalid To header'],
    ]);
    expect(await h.guest(eventId, g.id)).toMatchObject({ inviteStatus: 'sent', sendMethod: 'email' });
    expect(h.audits().find((a) => a.action === 'GỬI THƯ MỜI')!.summary).toBe('Gửi thư "Giấy mời" từ btc@x.vn: 1 thư đã gửi, 1 thư lỗi');
  });

  it('a failed send writes no "sent" row, no sent audit and does not mark the guest invited', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const g = await h.addGuest(eventId, { email: 'an@a.vn' as Email });
    await h.ok(xtdtUser, 'comms.recordDeliveries', { eventId, campaignId: campaign(), senderEmail: 'btc@x.vn' as Email, subject: 'Giấy mời', results: [failed('an@a.vn', g.id)] });
    expect((h.rows('sce_tcsk_email_deliveries') as Array<{ status: string }>).map((r) => r.status)).toEqual(['error']);
    expect(await h.guest(eventId, g.id)).toMatchObject({ inviteStatus: 'pending', sendMethod: 'direct' });
    expect(h.audits().filter((a) => a.action === 'GỬI THƯ MỜI').map((a) => a.summary)).toEqual(['Gửi thư "Giấy mời" từ btc@x.vn: 0 thư đã gửi, 1 thư lỗi']);
    expect(h.audits().some((a) => a.action === 'PHÁT HÀNH GIẤY MỜI')).toBe(false);
  });

  it.each([
    ['sent without a Gmail id', { ...sent('a@x.vn'), providerMessageId: null }],
    ['sent with an error', { ...sent('a@x.vn'), error: 'x' }],
    ['error without a reason', { ...failed('a@x.vn'), error: null }],
    ['a dev-fake id outside the dev runtime', { ...sent('a@x.vn'), providerMessageId: 'dev-fake-1' }],
    ['an address with a line break', { ...sent('a@x.vn\r\nBcc: v@evil.com') }],
  ])('refuses %s', async (_, result) => {
    const h = harness();
    const eventId = await h.createEvent();
    const r = await h.run(xtdtUser, 'comms.recordDeliveries', { eventId, campaignId: campaign(), senderEmail: 'btc@x.vn' as Email, subject: 's', results: [result as never] });
    expect(r).toMatchObject({ ok: false, kind: 'invalid' });
    expect(h.rows('sce_tcsk_email_deliveries')).toEqual([]);
  });

  it('a retry turns an error into sent; a later failure never erases a success', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const c = campaign();
    const rec = (results: never[]) => h.ok(xtdtUser, 'comms.recordDeliveries', { eventId, campaignId: c, senderEmail: 'btc@x.vn' as Email, subject: 's', results });
    await rec([failed('a@x.vn') as never, sent('b@x.vn') as never]);
    await rec([sent('a@x.vn') as never, failed('b@x.vn') as never]);
    const rows = h.rows('sce_tcsk_email_deliveries') as Array<{ email: string; status: string }>;
    expect(rows.map((r) => [r.email, r.status]).sort()).toEqual([['a@x.vn', 'sent'], ['b@x.vn', 'sent']]);
    expect(h.audits().at(-1)!.summary).toContain('1 lỗi bỏ qua vì đã gửi thành công trước đó');
  });
});
