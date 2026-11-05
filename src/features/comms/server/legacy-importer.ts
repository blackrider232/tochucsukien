// Imports the legacy keys comms owns: systemSettings.unitSenderEmails into
// sce_tcsk_sender_mailboxes, the events' Google Form fields into
// sce_tcsk_rsvp_forms, and the guests' email results into
// sce_tcsk_email_deliveries under one legacy campaign per event. The legacy
// app marked sandbox sends as sent (m4a B12), so imported rows are flagged
// `imported` and carry no Gmail id. systemSettings.googleClientId is core's
// (it lands in the settings row). The response cache was never persisted.

import type { EventId, GuestId } from '@/core/brand';
import { parseInstant } from '@/core/dates';
import type { ImportContext, ImportIssue, LegacyBlob, LegacyImporter } from '@/core/legacy';
import { parseEmail } from '@/core/text';
import { legacyEmailStatuses, legacyImporter as guestsImporter } from '@/features/guests/server';
import { legacyImporter as progressImporter } from '@/features/progress/server';
import { parseFormUrl, toSheetCsvUrl } from '../domain/sheet-url';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/** DEFAULT_CONFIGURED_GOOGLE_EMAILS (L18192): seeded by the old app, skipped while unchanged (decision 13). */
const SEED_MAILBOXES: ReadonlyMap<string, string> = new Map([
  ['gmail_cfg_1', 'hanoi.sce.event@gmail.com'],
  ['gmail_cfg_2', 'xuctiendautu.hanoi@gmail.com'],
  ['gmail_cfg_3', 'hotrodoanhnghiep.sce@gmail.com'],
]);

function mailboxRows(blob: LegacyBlob, ctx: ImportContext, issues: ImportIssue[]) {
  const settings = isObj(blob.systemSettings) ? blob.systemSettings : {};
  const list = Array.isArray(settings.unitSenderEmails) ? settings.unitSenderEmails : [];
  const rows: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const raw of list) {
    if (!isObj(raw)) continue;
    const legacyId = str(raw.id) || null;
    const issue = (severity: ImportIssue['severity'], message: string) => issues.push({ severity, blobKey: 'systemSettings', legacyId, message });
    const email = parseEmail(raw.email);
    const clientId = str(raw.clientId);
    if (legacyId && SEED_MAILBOXES.get(legacyId) === email && !clientId && !ctx.includeDemo) {
      issue('skipped_demo', `Bỏ qua hòm thư mẫu của phần mềm cũ: ${email}`);
      continue;
    }
    if (!email) {
      issue('dropped_invalid', `Hòm thư có email không hợp lệ: ${str(raw.email) || '(trống)'}`);
      continue;
    }
    if (seen.has(email)) {
      issue('dropped_invalid', `Hòm thư trùng email ${email}, giữ hòm thư đầu tiên`);
      continue;
    }
    seen.add(email);
    rows.push({
      id: ctx.ids.idFor('Mailbox', legacyId ?? email),
      legacy_id: legacyId,
      display_name: (str(raw.displayName) || str(raw.name) || email).slice(0, 120),
      email,
      client_id: /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(clientId) ? clientId : null,
      is_default: raw.isDefault === true,
    });
    if (clientId && rows.at(-1)!.client_id === null) issue('coerced', `Client ID không hợp lệ của ${email} được bỏ trống`);
  }
  // Exactly one default: the first flagged one, else the first mailbox (the old app enforced this loosely, m4c B56).
  const first = rows.findIndex((r) => r.is_default) === -1 ? 0 : rows.findIndex((r) => r.is_default);
  rows.forEach((r, i) => (r.is_default = i === first));
  return rows;
}

/** Legacy event id -> imported event id, for events progress imports. */
function importedEvents(blob: LegacyBlob, ctx: ImportContext): ReadonlyMap<string, EventId> {
  const rows = progressImporter.plan(blob, ctx).batches.find((b) => b.table === 'sce_tcsk_events')?.rows ?? [];
  return new Map(rows.map((r) => [String(r.legacy_id), r.id as EventId]));
}

function formRows(blob: LegacyBlob, ctx: ImportContext, events: ReadonlyMap<string, EventId>, issues: ImportIssue[]) {
  const source = Array.isArray(blob.events) && blob.events.length > 0 ? blob.events : Array.isArray(blob.programs) ? blob.programs : [];
  const done = new Set<string>();
  return source.filter(isObj).flatMap((raw) => {
    const legacyId = str(raw.id);
    const eventId = events.get(legacyId);
    if (!eventId || done.has(legacyId)) return [];
    const formRaw = str(raw.googleFormUrl);
    const sheetRaw = str(raw.googleSheetUrl);
    if (!formRaw && !sheetRaw) return [];
    done.add(legacyId);
    const issue = (message: string) => issues.push({ severity: 'coerced', blobKey: 'events', legacyId, message });
    const formUrl = formRaw ? parseFormUrl(formRaw) : null;
    if (formRaw && !formUrl) issue(`Link Google Form không hợp lệ, bỏ trống: ${formRaw.slice(0, 120)}`);
    const sheet = sheetRaw ? toSheetCsvUrl(sheetRaw) : null;
    if (sheet && !sheet.ok) issue(`Link Google Sheet không hợp lệ, bỏ trống: ${sheetRaw.slice(0, 120)}`);
    return [{
      id: ctx.ids.idFor('RsvpForm', legacyId),
      event_id: eventId,
      form_url: formUrl,
      sheet_csv_url: sheet?.ok ? sheet.csvUrl : null,
      auto_sync: raw.autoSyncGoogleForm === true,
      // The old app treated a missing flag as on.
      auto_add_new_guests: raw.autoAddNewGuestsFromForm !== false,
      column_map: null,
      last_sync_at: parseInstant(raw.lastFormSyncTime),
      last_attempt_at: parseInstant(raw.lastFormSyncTime),
      last_sync_error: null,
      sheet_headers: [],
    }];
  });
}

function deliveryRows(blob: LegacyBlob, ctx: ImportContext, issues: ImportIssue[]) {
  const guests = new Map(
    (guestsImporter.plan(blob, ctx).batches.find((b) => b.table === 'sce_tcsk_guests')?.rows ?? []).map((r) => [r.id as GuestId, r]),
  );
  const seen = new Set<string>();
  return legacyEmailStatuses(blob, ctx).flatMap((s) => {
    const guest = guests.get(s.guestId);
    const email = parseEmail(guest?.email);
    const legacyId = guest ? str(guest.legacy_id) : null;
    if (!guest || !email) {
      issues.push({ severity: 'dropped_invalid', blobKey: 'eventGuests', legacyId, message: 'Kết quả gửi thư của khách mời không có email hợp lệ, bỏ qua' });
      return [];
    }
    const campaignId = ctx.ids.idFor('EmailCampaign', 'legacy', s.eventId);
    if (seen.has(`${campaignId}|${email}`)) {
      issues.push({ severity: 'dropped_invalid', blobKey: 'eventGuests', legacyId, message: `Hai khách mời cùng email ${email}: giữ kết quả gửi của khách đầu tiên` });
      return [];
    }
    seen.add(`${campaignId}|${email}`);
    return [{
      id: ctx.ids.idFor('EmailDelivery', s.guestId),
      event_id: s.eventId,
      campaign_id: campaignId,
      guest_id: s.guestId,
      email,
      recipient_name: str(guest.name),
      subject: 'Thư gửi từ phần mềm cũ',
      sender_email: '',
      status: s.status,
      sent_at: s.sentAt,
      error: s.status === 'error' ? s.error || 'Lỗi gửi (dữ liệu phần mềm cũ không ghi lý do)' : null,
      provider_message_id: null,
      imported: true,
    }];
  });
}

export const legacyImporter: LegacyImporter = {
  feature: 'comms',
  dependsOn: ['progress', 'guests'],
  plan(blob, ctx) {
    const issues: ImportIssue[] = [];
    const events = importedEvents(blob, ctx);
    return {
      batches: [
        { table: 'sce_tcsk_sender_mailboxes', rows: mailboxRows(blob, ctx, issues) },
        { table: 'sce_tcsk_rsvp_forms', rows: formRows(blob, ctx, events, issues) },
        { table: 'sce_tcsk_email_deliveries', rows: deliveryRows(blob, ctx, issues) },
      ],
      issues,
    };
  },
};
