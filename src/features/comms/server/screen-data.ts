// The comms screens' data: the event (progress), the roster (guests), and comms' own rows.
// `can*` flags hide controls only; the commands and RLS decide.

import type { RequestContext } from '@/core/auth';
import { parseUuid, type CampaignId, type EventId, type GuestId } from '@/core/brand';
import { devMemoryEnabled } from '@/core/dev/mode';
import { can } from '@/core/permissions';
import { orgIdentity } from '@/core/settings';
import { readRoster } from '@/features/guests/server';
import { readEvent } from '@/features/progress/server';
import { detectColumns } from '../domain/columns';
import { parseAnswerLabels, parseColumnMap } from '../domain/responses';
import type { DeliveryLogData, FormScreenData, InvitationScreenData, MailboxesScreenData, ScreenEvent } from '../domain/screen';
import { serverSyncReady } from './cron';
import { listCampaigns, listDeliveries, listMailboxes, listResponses, readCampaign, readForm } from './reads';

async function eventOf(ctx: RequestContext, eventId: EventId) {
  const event = await readEvent(ctx, eventId);
  if (!event) return null;
  const view: ScreenEvent = { id: event.id, name: event.name, eventDate: event.eventDate, eventTime: event.eventTime || null, location: event.location, targetGuests: event.targetGuests };
  return { view, scope: { departments: [event.department, ...event.supportingDepartments] } };
}

export async function invitationScreenData(ctx: RequestContext, eventId: EventId, retryCampaign: string | null): Promise<InvitationScreenData | null> {
  const event = await eventOf(ctx, eventId);
  if (!event) return null;
  const [roster, mailboxes, form, deliveries] = await Promise.all([readRoster(ctx, eventId), listMailboxes(ctx), readForm(ctx, eventId), listDeliveries(ctx, eventId)]);
  // Newest first, so the first row per guest is the latest result.
  const lastOf = new Map<GuestId, 'sent' | 'error' | 'unknown'>();
  for (const d of deliveries) if (d.guestId && d.status !== 'queued' && d.status !== 'sending' && !lastOf.has(d.guestId)) lastOf.set(d.guestId, d.status);
  const campaignId = parseUuid<'EmailCampaign'>(retryCampaign);
  const failed = campaignId ? deliveries.filter((d) => d.campaignId === campaignId && d.status === 'error') : [];
  const campaign = campaignId && failed.length > 0 ? await readCampaign(ctx, eventId, campaignId) : null;
  return {
    event: event.view,
    guests: roster.map((g) => ({
      id: g.id, name: g.name, title: g.title, organization: g.organization, group: g.group, email: g.email, rsvpStatus: g.rsvpStatus,
      seatCode: g.seatCode, checkinCode: g.checkinCode, lastDelivery: lastOf.get(g.id) ?? null,
    })),
    mailboxes,
    googleClientId: ctx.settings.googleClientId,
    formUrl: form?.formUrl ?? null,
    officer: { name: ctx.actor.profile.fullname, email: ctx.actor.profile.email },
    org: orgIdentity(ctx.settings),
    canSend: can(ctx.actor, 'comms.send', event.scope),
    retry: campaignId && failed.length > 0
      ? {
          campaignId,
          guestIds: failed.flatMap((d) => (d.guestId ? [d.guestId] : [])),
          manual: failed.filter((d) => !d.guestId).map((d) => ({ email: d.email, name: d.recipientName })),
          message: campaign && { subject: campaign.subjectTemplate, body: campaign.bodyTemplate, attachQr: campaign.attachQr },
        }
      : null,
    devTransport: devMemoryEnabled(),
  };
}

export async function deliveryLogData(ctx: RequestContext, eventId: EventId): Promise<DeliveryLogData | null> {
  const event = await eventOf(ctx, eventId);
  if (!event) return null;
  const [rows, kept] = await Promise.all([listDeliveries(ctx, eventId), listCampaigns(ctx, eventId)]);
  const subjects = new Map(kept.map((c) => [c.id, c.subjectTemplate]));
  // A row's own subject is merged for its recipient, so it names a campaign only for legacy rows, which have one text.
  const campaigns = new Map<CampaignId, string>();
  for (const d of rows) {
    if (!campaigns.has(d.campaignId)) campaigns.set(d.campaignId, subjects.get(d.campaignId) ?? (d.imported ? d.subject : 'Đợt gửi chưa lưu mẫu thư'));
  }
  return {
    event: event.view,
    campaigns: [...campaigns].map(([id, label]) => ({ id, label })),
    rows: rows.map((d) => ({
      id: d.id, campaignId: d.campaignId, guestId: d.guestId, recipientName: d.recipientName, email: d.email, subject: d.subject, senderEmail: d.senderEmail,
      status: d.status, sentAt: d.sentAt, updatedAt: d.updatedAt, error: d.error, imported: d.imported,
    })),
    canSend: can(ctx.actor, 'comms.send', event.scope),
  };
}

export async function formScreenData(ctx: RequestContext, eventId: EventId): Promise<FormScreenData | null> {
  const event = await eventOf(ctx, eventId);
  if (!event) return null;
  const [form, responses, roster] = await Promise.all([readForm(ctx, eventId), listResponses(ctx, eventId), readRoster(ctx, eventId)]);
  const byId = new Map(roster.map((g) => [g.id, g]));
  const ref = (id: GuestId) => {
    const g = byId.get(id);
    return g ? { id, name: g.name, organization: g.organization } : null;
  };
  return {
    event: event.view,
    form: form && {
      formUrl: form.formUrl, sheetCsvUrl: form.sheetCsvUrl, autoSync: form.autoSync, autoAddNewGuests: form.autoAddNewGuests,
      columnMap: parseColumnMap(form.columnMap), detectedMap: detectColumns(form.sheetHeaders), sheetHeaders: form.sheetHeaders,
      lastSyncAt: form.lastSyncAt, lastAttemptAt: form.lastAttemptAt, lastSyncError: form.lastSyncError, answerLabels: parseAnswerLabels(form.answerLabels), version: form.version,
    },
    // Newest first on screen.
    responses: [...responses].reverse().map((r) => ({
      id: r.id, version: r.version, respondedAt: r.respondedAt, name: r.name, organization: r.organization, title: r.title, email: r.email, phone: r.phone,
      rsvpAnswer: r.rsvpAnswer, rsvp: r.rsvp, hasBanquet: r.hasBanquet, substitute: r.substitute, notes: r.notes, match: r.match, applyStatus: r.applyStatus,
      matchedGuest: r.matchedGuestId ? (ref(r.matchedGuestId) ?? null) : null,
      candidates: r.candidateGuestIds.flatMap((id) => { const c = ref(id); return c ? [c] : []; }),
    })),
    guests: roster.map((g) => ({ id: g.id, name: g.name, organization: g.organization, email: g.email, phone: g.phone })),
    canManage: can(ctx.actor, 'comms.rsvp.manage', event.scope),
    serverSync: serverSyncReady(),
  };
}

export async function mailboxesScreenData(ctx: RequestContext): Promise<MailboxesScreenData> {
  return { mailboxes: await listMailboxes(ctx), googleClientId: ctx.settings.googleClientId };
}
