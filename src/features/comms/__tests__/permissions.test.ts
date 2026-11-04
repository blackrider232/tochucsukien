import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newId, type Email, type EventId, type Version } from '@/core/brand';
import type { CommandId } from '@/core/commands';
import { PTDN, testActor } from '@/core/testing/actors';
import { commands } from '../server/commands';
import { fakeSheetSource } from '../server/sheet-source';
import { harness, xtdtUser } from './harness';

// Every role holds comms.read, comms.send and comms.rsvp.manage alike, so no actor in the matrix tells them apart.
// This stands in for a role that lacks exactly one, and shows each command asks for its own permission.
const grants = vi.hoisted(() => ({ withhold: null as string | null }));
vi.mock('@/core/permissions', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/core/permissions')>();
  return { ...real, can: (...args: Parameters<typeof real.can>) => args[1] !== grants.withhold && real.can(...args) };
});

beforeEach(() => {
  grants.withhold = null;
});

const RUN = newId<'CampaignRun'>();
const SHEET = 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit';
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/export?format=csv';
const answering = () => fakeSheetSource({ [SHEET_CSV_URL]: 'Dấu thời gian,Họ và tên,Email,Xác nhận tham dự\n04/11/2026 10:00:00,An,an@a.vn,Có' });
const EVENT_COMMANDS = {
  saveForm: 'comms.rsvp.manage',
  saveColumnMap: 'comms.rsvp.manage',
  syncForm: 'comms.rsvp.manage',
  resolveResponse: 'comms.rsvp.manage',
  startCampaign: 'comms.send',
  recordDeliveries: 'comms.send',
  releaseDeliveries: 'comms.send',
} as const;

async function fixture() {
  const h = harness({ sheets: answering() });
  const eventId = await h.createEvent();
  const form = (await h.ok(xtdtUser, 'comms.saveForm', { eventId, version: null, config: { formUrl: null, sheetUrl: SHEET, autoSync: false, autoAddNewGuests: false } } as never)).value;
  await h.ok(xtdtUser, 'comms.syncForm', { eventId });
  const response = (h.rows('sce_tcsk_rsvp_responses') as Array<{ id: string; version: number }>)[0]!;
  const claim = (await h.ok(xtdtUser, 'comms.startCampaign', { eventId, senderEmail: 'btc@x.vn' as Email, subject: 's', body: '<p>a</p>', runToken: RUN, takeOver: false, recipients: [{ guestId: null, email: 'a@x.vn' as Email, recipientName: '' }] })).value;
  const inputs: Record<keyof typeof EVENT_COMMANDS, unknown> = {
    saveForm: { eventId, version: form.version + 2, config: { formUrl: 'https://forms.gle/x', sheetUrl: SHEET, autoSync: true, autoAddNewGuests: false } },
    saveColumnMap: { eventId, version: form.version + 2, columnMap: { name: 0, email: 1 } },
    syncForm: { eventId },
    resolveResponse: { eventId, id: response.id, version: response.version as Version, action: { kind: 'dismiss' } },
    startCampaign: { eventId, senderEmail: 'btc@x.vn' as Email, subject: 's', body: '<p>b</p>', runToken: RUN, takeOver: false, recipients: [{ guestId: null, email: 'b@x.vn', recipientName: '' }] },
    recordDeliveries: { eventId, campaignId: claim.campaignId, runToken: RUN, senderEmail: 'btc@x.vn' as Email, subject: 's', results: [{ guestId: null, email: 'a@x.vn', recipientName: '', status: 'error', providerMessageId: null, error: 'x' }] },
    releaseDeliveries: { eventId, campaignId: claim.campaignId, runToken: RUN, emails: ['a@x.vn'] },
  };
  return { h, eventId, inputs };
}

const state = (h: ReturnType<typeof harness>) => ({
  forms: h.rows('sce_tcsk_rsvp_forms'),
  responses: h.rows('sce_tcsk_rsvp_responses'),
  deliveries: h.rows('sce_tcsk_email_deliveries'),
  guests: h.rows('sce_tcsk_guests'),
  audits: h.audits().length,
});

describe('every event command asks for its own permission', () => {
  it('covers every command of the feature', () => {
    expect(Object.keys(commands).sort()).toEqual([...Object.keys(EVENT_COMMANDS), 'deleteMailbox', 'restoreMailbox', 'saveMailbox'].sort());
  });

  it.each(Object.entries(EVENT_COMMANDS))('comms.%s is refused without %s, with RLS bypassed, and writes nothing', async (verb, perm) => {
    const { h, inputs } = await fixture();
    const input = inputs[verb as keyof typeof EVENT_COMMANDS] as never;
    const before = state(h);
    grants.withhold = perm;
    expect(await h.runWithoutRls(xtdtUser, `comms.${verb}` as CommandId, input)).toMatchObject({ ok: false, kind: 'forbidden' });
    grants.withhold = null;
    expect(state(h)).toEqual(before);
    // The same call is allowed once the permission is back, so the refusal above was the permission and nothing else.
    const again = await h.runWithoutRls(xtdtUser, `comms.${verb}` as CommandId, input);
    expect(again.ok || (again as { kind: string }).kind !== 'forbidden').toBe(true);
  });

  it.each(Object.keys(EVENT_COMMANDS))('comms.%s is refused to another department, through RLS and with RLS bypassed', async (verb) => {
    const { h, inputs } = await fixture();
    const other = testActor('user', PTDN);
    const input = inputs[verb as keyof typeof EVENT_COMMANDS] as never;
    const before = state(h);
    const viaRls = await h.run(other, `comms.${verb}` as CommandId, input);
    expect(viaRls.ok).toBe(false);
    expect(['forbidden', 'not_found']).toContain((viaRls as { kind: string }).kind);
    expect(await h.runWithoutRls(other, `comms.${verb}` as CommandId, input)).toMatchObject({ ok: false, kind: 'forbidden' });
    expect(state(h)).toEqual(before);
  });

  it('a nested guest effect keeps guests’ own check: without guests.write a sync applies nothing', async () => {
    const h = harness({ sheets: answering() });
    const eventId: EventId = await h.createEvent();
    await h.addGuest(eventId, { email: 'an@a.vn' as Email });
    await h.ok(xtdtUser, 'comms.saveForm', { eventId, version: null, config: { formUrl: null, sheetUrl: SHEET, autoSync: false, autoAddNewGuests: false } } as never);
    grants.withhold = 'guests.write';
    const r = await h.runWithoutRls(xtdtUser, 'comms.syncForm', { eventId });
    expect(r).toMatchObject({ ok: true, value: { status: 'ok', applied: 0, failed: 1 } });
    expect((r as unknown as { value: { failures: string[] } }).value.failures[0]).toContain('không có quyền');
    expect((await h.roster(eventId))[0]).toMatchObject({ rsvpStatus: 'pending' });
  });

  it('a send guests will not mark invited is still recorded, and the audit says which invitation status to fix', async () => {
    const h = harness();
    const eventId: EventId = await h.createEvent();
    const g = await h.addGuest(eventId, { email: 'an@a.vn' as Email });
    const { campaignId } = (await h.ok(xtdtUser, 'comms.startCampaign', { eventId, senderEmail: 'btc@x.vn' as Email, subject: 's', body: '<p>b</p>', runToken: RUN, takeOver: false, recipients: [{ guestId: g.id, email: 'an@a.vn' as Email, recipientName: 'An' }] })).value;
    grants.withhold = 'guests.write';
    const r = await h.run(xtdtUser, 'comms.recordDeliveries', { eventId, campaignId, runToken: RUN, senderEmail: 'btc@x.vn' as Email, subject: 's', results: [{ guestId: g.id, email: 'an@a.vn' as Email, recipientName: 'An', status: 'sent', providerMessageId: 'msg-1', error: null }] });
    expect(r).toMatchObject({ ok: true, value: { recorded: 1, notInvited: 1 } });
    expect((h.rows('sce_tcsk_email_deliveries') as Array<{ status: string }>).map((d) => d.status)).toEqual(['sent']);
    expect(await h.guest(eventId, g.id)).toMatchObject({ inviteStatus: 'pending' });
    expect(h.audits().at(-1)!.summary).toContain('chưa cập nhật được trạng thái giấy mời của 1 khách, cần cập nhật thủ công');
  });
});
