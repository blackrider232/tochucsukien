// Imports the legacy blob keys live owns: the check-in fields the legacy app
// kept on each guest (into sce_tcsk_checkins, read through guests'
// legacyCheckins), eventDutyRoster and eventIncidents. Pure and deterministic.
// Demo rows are skipped: duty_01..04, sc_01/02, and the four check-ins the
// legacy seeder faked on every event (m5 BUG-01), recognised by their fixed
// time and staff name.

import type { EventId, HHmm, Instant, IsoDate } from '@/core/brand';
import { addHours, combineVN, parseHHmm, parseInstant, parseIsoDate } from '@/core/dates';
import { isDemoLegacyEvent, isDemoLegacyId, type ImportContext, type ImportIssue, type LegacyBlob, type LegacyImporter } from '@/core/legacy';
import { isDepartmentName, type DepartmentName } from '@/core/vocab';
import { legacyCheckins } from '@/features/guests/server';
import { legacyImporter as progressImporter } from '@/features/progress/server';
import { DUTY_DESKS, deskOfLegacyRole } from '../domain/duty';
import { DESK_VALUES, INCIDENT_STATUS_VALUES, URGENCY_VALUES } from '../domain/schemas';

type Obj = Record<string, unknown>;
type Row = Readonly<Record<string, unknown>>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/** ensureStarterDataForModule5 (legacy 20776-20804): 'HH:MM:SS|staff' of the check-ins it invented. */
const SEEDED_CHECKINS: ReadonlySet<string> = new Set(['08:05:12|Nguyễn Văn Cường', '08:08:45|Nguyễn Văn Cường', '07:50:22|Lê Thị Mai', '08:00:10|Lê Thị Mai']);

interface ImportedEvent {
  legacyId: string;
  id: EventId;
  date: IsoDate;
  time: HHmm;
}

function importedEvents(blob: LegacyBlob, ctx: ImportContext): ReadonlyMap<string, ImportedEvent> {
  const rows = progressImporter.plan(blob, ctx).batches.find((b) => b.table === 'sce_tcsk_events')?.rows ?? [];
  return new Map(rows.map((r) => [String(r.legacy_id), { legacyId: String(r.legacy_id), id: r.id as EventId, date: parseIsoDate(r.event_date) as IsoDate, time: (parseHHmm(r.event_time) ?? '08:30') as HHmm }]));
}

/** 'HH:MM' or 'HH:MM:SS' on the event day in Vietnam time, seconds kept; an ISO instant as it is. */
function wallClock(raw: unknown, date: IsoDate): Instant | null {
  const iso = parseInstant(raw);
  if (iso) return iso;
  const m = /^(\d{1,2}:\d{2})(?::(\d{2}))?/.exec(str(raw));
  const hhmm = m ? parseHHmm(m[1]) : null;
  if (!hhmm) return null;
  return new Date(Date.parse(combineVN(date, hhmm)) + Number(m![2] ?? 0) * 1000).toISOString() as Instant;
}

class Issues {
  readonly list: ImportIssue[] = [];
  add(severity: ImportIssue['severity'], blobKey: string, legacyId: string | null, message: string) {
    this.list.push({ severity, blobKey, legacyId, message });
  }
}

/** The legacy guest a legacy key ('gst_1', its '#2' twin, or 'index-3') names, for the raw check-in time. */
function rawGuest(blob: LegacyBlob, legacyEventId: string, legacyKey: string): Obj | null {
  const list = isObj(blob.eventGuests) ? blob.eventGuests[legacyEventId] : null;
  if (!Array.isArray(list)) return null;
  const [rawId = '', nth = '1'] = legacyKey.split('#');
  const index = /^index-(\d+)$/.exec(rawId);
  if (index) return isObj(list[Number(index[1]) - 1]) ? (list[Number(index[1]) - 1] as Obj) : null;
  return (list.filter((g) => isObj(g) && str(g.id) === rawId)[Number(nth) - 1] as Obj | undefined) ?? null;
}

/** The desk a legacy check-in staff name stands at on that event's roster, as the check-in's desk text; null when the name is not on it. */
function deskOfStaff(blob: LegacyBlob, legacyEventId: string, staff: string): string | null {
  const roster = isObj(blob.eventDutyRoster) ? blob.eventDutyRoster[legacyEventId] : null;
  if (!Array.isArray(roster) || !staff) return null;
  const entry = roster.find((s) => isObj(s) && str(s.name).toLowerCase() === staff.toLowerCase());
  const desk = isObj(entry) ? deskOfLegacyRole(str(entry.role)) : null;
  return desk === null ? null : DUTY_DESKS[desk].short;
}

function planCheckins(blob: LegacyBlob, ctx: ImportContext, events: ReadonlyMap<string, ImportedEvent>, issues: Issues): Row[] {
  const byId = new Map([...events.values()].map((e) => [e.id, e]));
  const rows: Row[] = [];
  let atDesk = 0;
  let unplaced = 0;
  for (const c of legacyCheckins(blob, ctx)) {
    const event = byId.get(c.eventId)!;
    const raw = rawGuest(blob, event.legacyId, c.legacyGuestId);
    const name = str(raw?.name) || c.legacyGuestId;
    const rawTime = str(raw?.checkInTime);
    if (!ctx.includeDemo && SEEDED_CHECKINS.has(`${rawTime}|${c.staff}`)) {
      issues.add('skipped_demo', 'eventGuests', c.legacyGuestId, `Check-in mẫu của "${name}" (${rawTime}, ${c.staff}) do ứng dụng cũ tự tạo, không được nhập (m5 BUG-01).`);
      continue;
    }
    if (raw?.isCheckedIn !== true) {
      issues.add('dropped_invalid', 'eventGuests', c.legacyGuestId, `"${name}": ghi nhận phát quà khi chưa check-in; không nhập (quà chỉ phát cho đại biểu đã check-in, m5 BUG-30).`);
      continue;
    }
    const at = wallClock(rawTime, event.date);
    if (!at) {
      issues.add('dropped_invalid', 'eventGuests', c.legacyGuestId, `"${name}": giờ check-in "${rawTime}" không đọc được; không nhập (giờ check-in là bắt buộc).`);
      continue;
    }
    if (c.checkedInAtCoerced) issues.add('coerced', 'eventGuests', c.legacyGuestId, `Giờ check-in "${rawTime}" của "${name}" được ghép với ngày sự kiện ${event.date} theo giờ Việt Nam.`);
    const desk = deskOfStaff(blob, event.legacyId, c.staff);
    if (desk) atDesk += 1;
    else if (c.staff) unplaced += 1;
    rows.push({
      id: ctx.ids.idFor('Checkin', c.guestId),
      event_id: c.eventId,
      guest_id: c.guestId,
      checked_in_at: at,
      checked_in_by: null,
      desk,
      // The legacy app kept no time for the welcome pack; the check-in time stands in for it.
      gift_given_at: c.giftGiven ? at : null,
    });
  }
  // checked_in_by is a login account and the legacy staff was typed text, so the roster's desk is what survives.
  if (atDesk > 0) issues.add('coerced', 'eventGuests', null, `${atDesk} check-in cũ ghi người check-in bằng chữ; lưu thành bàn trực của người đó trong danh sách trực (người check-in là tài khoản đăng nhập nên không lưu tên).`);
  if (unplaced > 0) issues.add('coerced', 'eventGuests', null, `${unplaced} check-in cũ ghi người check-in không có trong danh sách trực; không lưu bàn và người check-in.`);
  return rows;
}

/** Each legacy event's list of a per-event key, or an issue for events progress did not import. */
function* perEvent(blob: LegacyBlob, key: string, events: ReadonlyMap<string, ImportedEvent>, issues: Issues): Generator<[ImportedEvent, Obj[]]> {
  const byEvent = blob[key];
  if (!isObj(byEvent)) return;
  for (const [legacyEventId, list] of Object.entries(byEvent)) {
    if (!Array.isArray(list)) {
      issues.add('dropped_invalid', key, legacyEventId, `Dữ liệu ${key} của sự kiện ${legacyEventId} không phải một mảng.`);
      continue;
    }
    const event = events.get(legacyEventId);
    if (!event) {
      if (list.length === 0) continue;
      const source = [blob.events, blob.programs].flatMap((l) => (Array.isArray(l) ? l : [])).find((e) => isObj(e) && str(e.id) === legacyEventId);
      if (isDemoLegacyEvent(source as Obj | undefined)) issues.add('skipped_demo', key, legacyEventId, `${list.length} dòng ${key} của sự kiện mẫu ${legacyEventId} không được nhập.`);
      else issues.add('orphan', key, legacyEventId, `${list.length} dòng ${key} thuộc sự kiện ${legacyEventId} không được nhập (sự kiện không tồn tại).`);
      continue;
    }
    yield [event, list.filter((r, i) => isObj(r) || (issues.add('dropped_invalid', key, null, `Dòng ${i + 1} ${key} của sự kiện ${legacyEventId} không hợp lệ.`), false)) as Obj[]];
  }
}

/** Opening time minus the presence hours, as 'HH:MM' on the same clock (the day wraps; a typed '06:30' compares as text). */
function presenceFrom(opening: HHmm, hours: number): HHmm | null {
  const at = parseHHmm(opening);
  if (!at) return null;
  const [h, m] = at.split(':').map(Number) as [number, number];
  const minutes = (((h * 60 + m - Math.round(hours * 60)) % 1440) + 1440) % 1440;
  return parseHHmm(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
}

function planDuty(blob: LegacyBlob, ctx: ImportContext, events: ReadonlyMap<string, ImportedEvent>, issues: Issues): Row[] {
  const KEY = 'eventDutyRoster';
  const rows: Row[] = [];
  const settings = isObj(blob.systemSettings) ? blob.systemSettings : {};
  const presenceHours = Number(settings.fieldPresenceHours) > 0 ? Number(settings.fieldPresenceHours) : 2;
  for (const [event, list] of perEvent(blob, KEY, events, issues)) {
    let differingTimes = 0;
    list.forEach((s, i) => {
      const legacyId = str(s.id) || `index-${i + 1}`;
      const name = str(s.name);
      if (!ctx.includeDemo && isDemoLegacyId(legacyId)) return issues.add('skipped_demo', KEY, legacyId, `Cán bộ trực mẫu "${name}" (sự kiện ${event.legacyId}) không được nhập.`);
      if (!name) return issues.add('dropped_invalid', KEY, legacyId, `Cán bộ trực ${legacyId} của sự kiện ${event.legacyId} không có họ tên.`);
      const role = str(s.role);
      const desk = deskOfLegacyRole(role) ?? DESK_VALUES[0];
      if (deskOfLegacyRole(role) === null) issues.add('coerced', KEY, legacyId, `Vị trí "${role}" của "${name}" không ghi số bàn; gán ${DUTY_DESKS[desk].short}.`);
      const department: DepartmentName = isDepartmentName(str(s.department)) ? (str(s.department) as DepartmentName) : 'Phòng Hành chính - Tổ chức';
      if (department !== str(s.department)) issues.add('coerced', KEY, legacyId, `Phòng ban "${str(s.department)}" của "${name}" không có trong danh mục; gán Phòng Hành chính - Tổ chức.`);
      const checkedText = str(s.checkedInAt);
      const checkedInAt = checkedText ? wallClock(checkedText, event.date) : null;
      if (checkedText && !checkedInAt) issues.add('coerced', KEY, legacyId, `Giờ điểm danh "${checkedText}" của "${name}" không đọc được; để chưa điểm danh.`);
      if (checkedInAt && !parseInstant(checkedText)) issues.add('coerced', KEY, legacyId, `Giờ điểm danh "${checkedText}" của "${name}" được ghép với ngày sự kiện ${event.date} theo giờ Việt Nam.`);
      const typed = /^(\d{1,2}:\d{2})/.exec(str(s.requiredTime));
      const typedAt = typed ? parseHHmm(typed[1]) : null;
      if (str(s.requiredTime) && (typedAt === null || typedAt !== presenceFrom(event.time, presenceHours))) differingTimes += 1;
      rows.push({
        id: ctx.ids.idFor('DutyStaff', legacyId, event.legacyId),
        event_id: event.id,
        legacy_id: legacyId,
        name,
        user_id: null,
        department,
        desk,
        // The full legacy label only when it says more than the desk registry does.
        role_label: role && role !== DUTY_DESKS[desk].label ? role : '',
        checked_in_at: checkedInAt,
      });
    });
    if (differingTimes > 0) {
      issues.add('coerced', KEY, event.legacyId, `${differingTimes} giờ quy định nhập tay của sự kiện ${event.legacyId} khác giờ khai mạc ${event.time} trừ ${presenceHours} giờ có mặt; nay lấy theo công thức, không lấy giờ nhập tay.`);
    }
  }
  return rows;
}

function planIncidents(blob: LegacyBlob, ctx: ImportContext, events: ReadonlyMap<string, ImportedEvent>, issues: Issues): Row[] {
  const KEY = 'eventIncidents';
  const rows: Row[] = [];
  for (const [event, list] of perEvent(blob, KEY, events, issues)) {
    const kept = list.flatMap((s, i) => {
      const legacyId = str(s.id) || `index-${i + 1}`;
      if (!ctx.includeDemo && isDemoLegacyId(legacyId)) {
        issues.add('skipped_demo', KEY, legacyId, `Sự cố mẫu ${str(s.code) || legacyId} (sự kiện ${event.legacyId}) không được nhập.`);
        return [];
      }
      if (!str(s.description)) {
        issues.add('dropped_invalid', KEY, legacyId, `Sự cố ${str(s.code) || legacyId} của sự kiện ${event.legacyId} không có nội dung.`);
        return [];
      }
      return [{ s, legacyId }];
    });
    const used = new Set<number>();
    const coded = kept.map(({ s }) => /^SC-(\d+)$/i.exec(str(s.code)));
    let next = Math.max(0, ...coded.map((m) => (m ? Number(m[1]) : 0)));
    kept.forEach(({ s, legacyId }, i) => {
      const code = str(s.code);
      let seq = coded[i] ? Number(coded[i]![1]) : 0;
      if (seq <= 0 || used.has(seq)) {
        seq = ++next;
        issues.add('coerced', KEY, legacyId, `Mã sự cố "${code}" (sự kiện ${event.legacyId}) thiếu hoặc bị trùng; cấp mã SC-${String(seq).padStart(2, '0')}.`);
      }
      used.add(seq);
      const urgency = URGENCY_VALUES.find((u) => u === s.urgency) ?? 'high';
      if (urgency !== s.urgency) issues.add('coerced', KEY, legacyId, `Mức độ "${str(s.urgency)}" của sự cố ${code} không đọc được; gán Khẩn cấp.`);
      const status = INCIDENT_STATUS_VALUES.find((v) => v === s.status) ?? 'open';
      if (status !== s.status) issues.add('coerced', KEY, legacyId, `Trạng thái "${str(s.status)}" của sự cố ${code} không đọc được; gán Mới tiếp nhận.`);
      const start = combineVN(event.date, event.time);
      let reportedAt = wallClock(s.reportedAt, event.date);
      if (!reportedAt) {
        reportedAt = start;
        issues.add('coerced', KEY, legacyId, `Sự cố ${code} không có giờ báo đọc được; dùng giờ khai mạc ${event.time} ngày ${event.date}.`);
      }
      let resolvedAt = status === 'resolved' ? wallClock(s.resolvedAt, event.date) : null;
      if (status === 'resolved' && !resolvedAt) {
        resolvedAt = reportedAt;
        issues.add('coerced', KEY, legacyId, `Sự cố ${code} đã khắc phục nhưng không có giờ xử lý; dùng giờ báo.`);
      }
      // A time after midnight on a fair's later day reads as earlier than the report: keep resolution after the report.
      if (resolvedAt && Date.parse(resolvedAt) < Date.parse(reportedAt)) resolvedAt = addHours(resolvedAt, 24);
      rows.push({
        id: ctx.ids.idFor('Incident', legacyId, event.legacyId),
        event_id: event.id,
        legacy_id: legacyId,
        seq,
        location: str(s.location) || 'Không ghi vị trí',
        description: str(s.description),
        urgency,
        assignee: str(s.assignee),
        status,
        reported_at: reportedAt,
        resolved_at: resolvedAt,
        resolution_note: str(s.note),
      });
    });
  }
  return rows;
}

export const legacyImporter: LegacyImporter = {
  feature: 'live',
  dependsOn: ['progress', 'guests'],
  plan(blob, ctx) {
    const issues = new Issues();
    const events = importedEvents(blob, ctx);
    return {
      batches: [
        { table: 'sce_tcsk_checkins', rows: planCheckins(blob, ctx, events, issues) },
        { table: 'sce_tcsk_duty_staff', rows: planDuty(blob, ctx, events, issues) },
        { table: 'sce_tcsk_incidents', rows: planIncidents(blob, ctx, events, issues) },
      ],
      issues: issues.list,
    };
  },
};
