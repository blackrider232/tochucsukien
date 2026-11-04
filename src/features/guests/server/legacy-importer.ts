// Imports legacy appData.eventGuests into sce_tcsk_guests. Pure and
// deterministic: every id is a uuid v5 of (legacy event, legacy guest),
// because legacy guest ids repeat across events and even inside one (m4a B42).
// Seat, check-in and email facts the legacy guest row carries belong to venue,
// live and comms: their importers read them through legacyGuestIndex,
// legacyCheckins and legacyEmailStatuses below instead of guests writing their
// tables. The design's key mapping: seats come from eventSeating only, and
// a guest-side seatCode / assignedSeat that disagrees is reported here.

import type { EventId, GuestId, Instant, IsoDate } from '@/core/brand';
import { legacyScanKey } from '@/core/checkin-code';
import { combineVN, parseHHmm, parseInstant, parseIsoDate } from '@/core/dates';
import { isDemoLegacyEvent, isDemoLegacyId, type ImportContext, type ImportIssue, type LegacyBlob, type LegacyImporter } from '@/core/legacy';
import { foldVi, parseEmail } from '@/core/text';
import type { GuestGroup, InviteStatus, RsvpStatus, SendMethod } from '@/core/vocab';
import { legacyImporter as progressImporter } from '@/features/progress/server';
import { GUEST_GROUP_VALUES, RSVP_VALUES } from '../domain/schemas';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const BLOB_KEY = 'eventGuests';

/** Repeated keys get '#2', '#3' so every row keeps its own deterministic id. */
function uniqueKeys() {
  const seen = new Map<string, number>();
  return (key: string) => {
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return n === 1 ? key : `${key}#${n}`;
  };
}

/** Legacy free text and codes, as the export's label helpers read them (m4c §1.6.1). */
function sendMethodOf(raw: unknown): SendMethod | null {
  const m = foldVi(str(raw));
  if (!m) return 'direct';
  if (m === 'direct' || m.includes('tan tay') || m.includes('truc tiep')) return 'direct';
  if (m === 'ems' || m.includes('buu dien') || m.includes('chuyen phat')) return 'ems';
  if (m === 'email' || m.includes('mail') || m.includes('dien tu')) return 'email';
  return null;
}
function inviteStatusOf(raw: unknown): InviteStatus | null {
  const s = foldVi(str(raw));
  if (!s) return 'pending';
  // 'chưa nhận' is pending; the legacy helper tested 'nhận' first and read it as received.
  if (s === 'pending' || s.includes('chua')) return 'pending';
  if (s === 'received' || s.includes('nhan')) return 'received';
  if (s === 'sent' || s.includes('phat hanh') || s.includes('da gui')) return 'sent';
  return null;
}

/** Legacy check-in times are 'HH:MM:SS' wall clock on the event day, or an ISO instant. */
function checkInInstant(raw: unknown, eventDate: IsoDate): { at: Instant | null; coerced: boolean } {
  const iso = parseInstant(raw);
  if (iso) return { at: iso, coerced: false };
  const hhmm = parseHHmm(str(raw).slice(0, 5));
  return hhmm ? { at: combineVN(eventDate, hhmm), coerced: true } : { at: null, coerced: str(raw) !== '' };
}

interface ImportedEvent {
  id: EventId;
  date: IsoDate;
}

interface ParsedGuest {
  legacyEventId: string;
  rawId: string;
  legacyKey: string;
  eventId: EventId;
  eventDate: IsoDate;
  guestId: GuestId;
  raw: Obj;
  row: Readonly<Record<string, unknown>>;
}

/** The events progress imports, by legacy id; guests of any other event key are orphans (or a skipped demo event). */
function importedEvents(blob: LegacyBlob, ctx: ImportContext): ReadonlyMap<string, ImportedEvent> {
  const rows = progressImporter.plan(blob, ctx).batches.find((b) => b.table === 'sce_tcsk_events')?.rows ?? [];
  return new Map(rows.map((r) => [String(r.legacy_id), { id: r.id as EventId, date: parseIsoDate(r.event_date) as IsoDate }]));
}

function parseGuests(blob: LegacyBlob, ctx: ImportContext): { guests: ParsedGuest[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const guests: ParsedGuest[] = [];
  const issue = (severity: ImportIssue['severity'], legacyId: string | null, message: string) => issues.push({ severity, blobKey: BLOB_KEY, legacyId, message });
  const byEvent = blob[BLOB_KEY];
  if (!isObj(byEvent)) return { guests, issues };
  const events = importedEvents(blob, ctx);
  const seating = isObj(blob.eventSeating) ? blob.eventSeating : {};

  for (const [legacyEventId, list] of Object.entries(byEvent)) {
    if (!Array.isArray(list)) {
      issue('dropped_invalid', legacyEventId, `Danh sách khách mời của sự kiện ${legacyEventId} không phải một mảng.`);
      continue;
    }
    const event = events.get(legacyEventId);
    if (!event) {
      if (list.length === 0) continue;
      const source = [blob.events, blob.programs].flatMap((l) => (Array.isArray(l) ? l : [])).find((e) => isObj(e) && str(e.id) === legacyEventId);
      if (isDemoLegacyEvent(source as Obj | undefined)) issue('skipped_demo', legacyEventId, `${list.length} khách mời của sự kiện mẫu ${legacyEventId} không được nhập.`);
      else issue('orphan', legacyEventId, `${list.length} khách mời thuộc sự kiện ${legacyEventId} không được nhập (sự kiện không tồn tại hoặc không có ngày hợp lệ).`);
      continue;
    }
    const seatMap = isObj(seating[legacyEventId]) ? (seating[legacyEventId] as Obj) : {};
    const key = uniqueKeys();

    list.forEach((raw: unknown, i: number) => {
      if (!isObj(raw)) return issue('dropped_invalid', null, `Khách mời thứ ${i + 1} của sự kiện ${legacyEventId} không hợp lệ.`);
      const rawId = str(raw.id) || `index-${i + 1}`;
      const name = str(raw.name);
      if (!ctx.includeDemo && isDemoLegacyId(rawId)) return issue('skipped_demo', rawId, `Khách mời mẫu "${name}" (sự kiện ${legacyEventId}) không được nhập.`);
      if (!name) return issue('dropped_invalid', rawId, `Khách mời ${rawId} của sự kiện ${legacyEventId} không có họ tên.`);
      const legacyKey = key(rawId);
      if (legacyKey !== rawId) issue('coerced', rawId, `Mã khách mời "${rawId}" bị trùng trong sự kiện ${legacyEventId} (lỗi tạo mã cũ); "${name}" nhận mã ${legacyKey}. Sơ đồ chỗ ngồi và check-in cũ gắn với mã này thuộc về khách đầu tiên.`);

      const group = GUEST_GROUP_VALUES.includes(raw.group as GuestGroup) ? (raw.group as GuestGroup) : 'DoanhNghiep';
      if (group !== raw.group) issue('coerced', legacyKey, `Nhóm khách "${str(raw.group)}" của "${name}" không có trong danh mục; gán Doanh nghiệp.`);
      const sendMethod = sendMethodOf(raw.sendMethod) ?? 'direct';
      if (sendMethodOf(raw.sendMethod) === null) issue('coerced', legacyKey, `Hình thức gửi "${str(raw.sendMethod)}" của "${name}" không đọc được; gán Đưa tận tay.`);
      const inviteStatus = inviteStatusOf(raw.inviteStatus) ?? 'pending';
      if (inviteStatusOf(raw.inviteStatus) === null) issue('coerced', legacyKey, `Trạng thái giấy mời "${str(raw.inviteStatus)}" của "${name}" không đọc được; gán Chưa gửi.`);
      const rsvpText = str(raw.rsvpStatus);
      const rsvpStatus: RsvpStatus = RSVP_VALUES.includes(rsvpText as RsvpStatus) ? (rsvpText as RsvpStatus) : 'pending';
      if (rsvpText && rsvpStatus !== rsvpText) issue('coerced', legacyKey, `RSVP "${rsvpText}" của "${name}" không đọc được; gán Chưa phản hồi.`);

      const emailText = str(raw.email);
      const email = emailText ? parseEmail(emailText) : null;
      if (emailText && !email) issue('coerced', legacyKey, `Email "${emailText}" của "${name}" không hợp lệ; đã bỏ.`);

      // Only a 'substituted' guest has a substitute; anything else (live's walk-in wrote the absent person there, m4a B55) is kept as a note.
      const substitute = str(raw.substituteName);
      const notes = [str(raw.notes), rsvpStatus !== 'substituted' && substitute ? `Ghi chú cũ về người thay: ${substitute}` : ''].filter(Boolean).join(' | ');

      const fromForm = raw.rsvpSource === 'google_form';
      const respondedText = str(raw.rsvpRespondedAt);
      const rsvpAt = fromForm ? parseInstant(respondedText) : null;
      if (fromForm && respondedText && !rsvpAt) issue('coerced', legacyKey, `Thời điểm phản hồi Form "${respondedText}" của "${name}" không đọc được; để trống.`);

      const guestSeat = str(raw.seatCode) || str(raw.assignedSeat);
      if (str(raw.seatCode) && str(raw.assignedSeat) && str(raw.seatCode) !== str(raw.assignedSeat)) {
        issue('coerced', legacyKey, `"${name}" ghi hai ghế khác nhau (seatCode ${str(raw.seatCode)}, assignedSeat ${str(raw.assignedSeat)}).`);
      }
      const mapSeats = Object.entries(seatMap).filter(([, g]) => g === rawId).map(([code]) => code);
      if (guestSeat && !mapSeats.includes(guestSeat)) {
        issue('coerced', legacyKey, `Ghế ${guestSeat} trên hồ sơ "${name}" không khớp sơ đồ chỗ ngồi (${mapSeats.join(', ') || 'chưa xếp'}); dùng sơ đồ chỗ ngồi.`);
      }

      const guestId = ctx.ids.idFor('Guest', legacyKey, legacyEventId);
      guests.push({
        legacyEventId, rawId, legacyKey, eventId: event.id, eventDate: event.date, guestId, raw,
        row: {
          id: guestId,
          event_id: event.id,
          legacy_id: legacyKey,
          name,
          guest_group: group,
          title: str(raw.title),
          organization: str(raw.organization),
          phone: str(raw.phone),
          email,
          send_method: sendMethod,
          invite_status: inviteStatus,
          rsvp_status: rsvpStatus,
          rsvp_source: fromForm ? 'google_form' : 'import',
          rsvp_at: rsvpAt,
          substitute_name: rsvpStatus === 'substituted' ? substitute : '',
          has_banquet: raw.hasBanquet === true || raw.banquet === true || raw.banquet === 'confirmed',
          notes,
        },
      });
    });
  }
  return { guests, issues };
}

export const legacyImporter: LegacyImporter = {
  feature: 'guests',
  dependsOn: ['progress'],
  plan(blob, ctx) {
    const { guests, issues } = parseGuests(blob, ctx);
    return { batches: [{ table: 'sce_tcsk_guests', rows: guests.map((g) => g.row) }], issues };
  },
};

/**
 * legacyScanKey(legacy event id, legacy guest id) -> imported guest id. venue resolves eventSeating values and live old
 * badges through it. A raw id that collided inside an event resolves to its first guest, as the legacy app did.
 */
export function legacyGuestIndex(blob: LegacyBlob, ctx: ImportContext): ReadonlyMap<string, GuestId> {
  const index = new Map<string, GuestId>();
  for (const g of parseGuests(blob, ctx).guests) {
    const key = legacyScanKey(g.legacyEventId, g.rawId);
    if (!index.has(key)) index.set(key, g.guestId);
  }
  return index;
}

/** Check-in facts for live's importer (sce_tcsk_checkins). A 'HH:MM:SS' time is combined with the event date and flagged. */
export interface LegacyCheckin {
  eventId: EventId;
  guestId: GuestId;
  legacyGuestId: string;
  checkedInAt: Instant | null;
  checkedInAtCoerced: boolean;
  giftGiven: boolean;
  staff: string;
}
export function legacyCheckins(blob: LegacyBlob, ctx: ImportContext): ReadonlyArray<LegacyCheckin> {
  return parseGuests(blob, ctx).guests.flatMap((g): LegacyCheckin[] => {
    const checkedIn = g.raw.isCheckedIn === true;
    const gift = g.raw.hasGiftPackage === true;
    if (!checkedIn && !gift) return [];
    const time = checkedIn ? checkInInstant(g.raw.checkInTime, g.eventDate) : { at: null, coerced: false };
    return [{ eventId: g.eventId, guestId: g.guestId, legacyGuestId: g.legacyKey, checkedInAt: time.at, checkedInAtCoerced: time.coerced, giftGiven: gift, staff: str(g.raw.checkInStaff) }];
  });
}

/** Delivery results the bulk sender wrote on the guest, for comms' importer (sce_tcsk_email_deliveries). */
export interface LegacyEmailStatus {
  eventId: EventId;
  guestId: GuestId;
  status: 'sent' | 'error';
  sentAt: Instant | null;
  error: string;
}
export function legacyEmailStatuses(blob: LegacyBlob, ctx: ImportContext): ReadonlyArray<LegacyEmailStatus> {
  return parseGuests(blob, ctx).guests.flatMap((g): LegacyEmailStatus[] => {
    const status = g.raw.emailStatus;
    if (status !== 'sent' && status !== 'error') return [];
    return [{ eventId: g.eventId, guestId: g.guestId, status, sentAt: parseInstant(g.raw.emailSentAt), error: str(g.raw.emailError) }];
  });
}
