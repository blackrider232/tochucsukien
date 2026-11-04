// Imports legacy hallTemplates, eventHallConfig, eventSeating and eventBooths.
// Pure and deterministic: every id is a uuid v5 of the legacy coordinates,
// scoped by event where legacy ids repeat across events (bth_01, gst_vip_01).
// totalSeats is dropped (capacity is derived); duplicate zone prefixes are
// renamed and reported; seats outside the event hall are kept and reported as
// orphans, which the seating screen then offers to release.

import { parseInstant, parseIsoDate } from '@/core/dates';
import { isDemoLegacyEvent, isDemoLegacyId, type ImportContext, type ImportIssue, type LegacyBlob, type LegacyImporter } from '@/core/legacy';
import type { HallZone } from '../contract';
import { BOOTH_CODE_PATTERN, BOOTH_STATUS_VALUES, DEFAULT_BOOTH_SIZE, SUBSIDY_VALUES, boothRow } from '../domain/booths';
import { DEFAULT_HALL_TEMPLATES } from '../domain/default-halls';
import { MAX_SEATS_PER_ZONE, PREFIX_PATTERN, ZONE_COLOR_VALUES, ZONE_GROUP_VALUES, nextZone, parseSeatCode, zoneOfSeat } from '../domain/halls';

type Obj = Record<string, unknown>;
type Issue = (severity: ImportIssue['severity'], blobKey: string, legacyId: string | null, message: string) => void;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const oneOf = <T>(values: ReadonlyArray<T>, v: unknown): T | null => (values.includes(v as T) ? (v as T) : null);
const entries = (v: unknown): Array<[string, unknown]> => (isObj(v) ? Object.entries(v) : []);
const TENT_CARD = 'Biển tên để bàn chữ A';

/**
 * The legacy event ids progress imports: the first event of each id (a repeated id is re-keyed and owns nothing else),
 * with a date, and not a demo event unless --include-demo. Rows of any other event would break the FK, so they are reported.
 */
function importedEvents(blob: LegacyBlob, ctx: ImportContext): ReadonlySet<string> {
  const events = Array.isArray(blob.events) && blob.events.length > 0 ? blob.events : blob.programs;
  const out = new Set<string>();
  const seen = new Set<string>();
  (Array.isArray(events) ? events : []).forEach((e: unknown) => {
    if (!isObj(e)) return;
    const id = str(e.id);
    if (!id || seen.has(id)) return;
    seen.add(id);
    const dated = parseIsoDate(e.eventDate) ?? parseIsoDate(e.date) ?? parseInstant(e.created_at);
    if (dated && (ctx.includeDemo || !isDemoLegacyEvent(e))) out.add(id);
  });
  return out;
}

/** Valid, unique zones from a legacy zone list. Each change is reported; null when nothing usable is left. */
function normalizeZones(raw: unknown, where: string, blobKey: string, legacyId: string, issue: Issue): HallZone[] | null {
  const zones: HallZone[] = [];
  (Array.isArray(raw) ? raw : []).forEach((z: unknown, i: number) => {
    if (!isObj(z)) return issue('dropped_invalid', blobKey, legacyId, `Khu thứ ${i + 1} của ${where} không hợp lệ; đã bỏ.`);
    const name = str(z.name);
    const rawPrefix = str(z.prefix).toUpperCase();
    const prefixOk = PREFIX_PATTERN.test(rawPrefix) ? rawPrefix : PREFIX_PATTERN.test(`${rawPrefix}-`) ? `${rawPrefix}-` : null;
    const taken = new Set(zones.map((x) => x.prefix));
    const fresh = nextZone(zones);
    const prefix = prefixOk && !taken.has(prefixOk) ? prefixOk : fresh.prefix;
    if (prefix !== rawPrefix) {
      issue('coerced', blobKey, legacyId, `Tiền tố "${rawPrefix}" của khu "${name}" (${where}) ${prefixOk && taken.has(prefixOk) ? 'bị trùng' : 'không hợp lệ'}; đổi thành ${prefix}.`);
    }
    const rawKey = str(z.id).replace(/^zone_/i, '').toUpperCase();
    const keys = new Set(zones.map((x) => x.key));
    const key = /^[A-Z0-9]{1,4}$/.test(rawKey) && !keys.has(rawKey) ? rawKey : !keys.has(prefix.slice(0, -1)) ? prefix.slice(0, -1) : fresh.key;
    const count = Number(z.seatCount);
    const seatCount = Number.isInteger(count) ? Math.min(Math.max(count, 1), MAX_SEATS_PER_ZONE) : 1;
    if (seatCount !== count) issue('coerced', blobKey, legacyId, `Số ghế "${str(z.seatCount)}" của khu "${name}" (${where}) ngoài khoảng 1 đến ${MAX_SEATS_PER_ZONE}; đặt ${seatCount}.`);
    const assignedGroup = oneOf(ZONE_GROUP_VALUES, z.assignedGroup) ?? 'all';
    zones.push({
      key,
      name: name || `Khu ${key}`,
      prefix,
      seatCount,
      color: oneOf(ZONE_COLOR_VALUES, z.colorScheme ?? z.color) ?? 'slate',
      assignedGroup,
      vipZone: z.badgeText === TENT_CARD || assignedGroup === 'VIP',
    });
  });
  if (zones.length === 0) issue('dropped_invalid', blobKey, legacyId, `${where} không có khu hợp lệ nào.`);
  return zones.length > 0 ? zones : null;
}

/** Repeated keys get '#2', '#3' so every row keeps its own deterministic id. */
function uniqueKeys() {
  const seen = new Map<string, number>();
  return (key: string) => {
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return n === 1 ? key : `${key}#${n}`;
  };
}

/** 'a-1', ' A1 ' -> 'A01'. Null when no row letters and number can be read. */
function normalizeBoothCode(raw: unknown): string | null {
  const m = /^([A-Z]{1,2})[\s-]*(\d{1,3})$/.exec(str(raw).toUpperCase());
  const code = m ? `${m[1]}${m[2]!.padStart(2, '0')}` : null;
  return code && BOOTH_CODE_PATTERN.test(code) ? code : null;
}

export const legacyImporter: LegacyImporter = {
  feature: 'venue',
  dependsOn: ['progress', 'guests'],
  plan(blob, ctx) {
    const issues: ImportIssue[] = [];
    const issue: Issue = (severity, blobKey, legacyId, message) => issues.push({ severity, blobKey, legacyId, message });
    const events = importedEvents(blob, ctx);

    // hallTemplates: the issued ones share their id with the seed migration, so an import overwrites the seed with the agency's edits.
    const templates: Obj[] = [];
    const templateKey = uniqueKeys();
    const zonesOfTemplate = new Map<string, HallZone[]>(DEFAULT_HALL_TEMPLATES.map((d) => [d.legacyId, [...d.zones]]));
    (Array.isArray(blob.hallTemplates) ? blob.hallTemplates : []).forEach((t: unknown, i: number) => {
      if (!isObj(t)) return issue('dropped_invalid', 'hallTemplates', null, `Hội trường mẫu thứ ${i + 1} không hợp lệ.`);
      const legacyId = templateKey(str(t.id) || `index-${i + 1}`);
      const name = str(t.name) || 'Hội trường';
      const zones = normalizeZones(t.zones, `hội trường mẫu "${name}"`, 'hallTemplates', legacyId, issue);
      if (!zones) return;
      zonesOfTemplate.set(legacyId, zones);
      templates.push({ id: ctx.ids.idFor('HallTemplate', legacyId), legacy_id: legacyId, name, location: str(t.location), description: str(t.description), zones });
    });

    const halls: Obj[] = [];
    const hallZones = new Map<string, HallZone[]>();
    for (const [legacyEventId, cfg] of entries(blob.eventHallConfig)) {
      if (!events.has(legacyEventId)) {
        issue('orphan', 'eventHallConfig', legacyEventId, `Dữ liệu eventHallConfig của sự kiện "${legacyEventId}" không được nhập vì sự kiện không được nhập.`);
        continue;
      }
      const hallId = isObj(cfg) ? str(cfg.hallId) : '';
      const template = zonesOfTemplate.get(hallId);
      if (!template) issue('coerced', 'eventHallConfig', legacyEventId, `Hội trường mẫu "${hallId}" không còn trong danh mục; sự kiện giữ sơ đồ riêng.`);
      const zones = (isObj(cfg) ? normalizeZones(cfg.zones, `sự kiện "${legacyEventId}"`, 'eventHallConfig', legacyEventId, issue) : null) ?? template ?? null;
      if (!zones) continue;
      hallZones.set(legacyEventId, zones);
      halls.push({ id: ctx.ids.idFor('EventHall', legacyEventId), event_id: ctx.ids.eventId(legacyEventId), template_id: template ? ctx.ids.idFor('HallTemplate', hallId) : null, zones });
    }

    // The legacy app showed the first template for an event that never saved a hall; keep that hall for its seats.
    const firstTemplate = templates[0] ? { legacyId: String(templates[0].legacy_id), zones: templates[0].zones as HallZone[] } : { legacyId: DEFAULT_HALL_TEMPLATES[0]!.legacyId, zones: [...DEFAULT_HALL_TEMPLATES[0]!.zones] };
    for (const [legacyEventId] of entries(blob.eventSeating)) {
      if (!events.has(legacyEventId) || hallZones.has(legacyEventId)) continue;
      issue('coerced', 'eventHallConfig', legacyEventId, `Sự kiện "${legacyEventId}" có xếp chỗ nhưng chưa lưu hội trường; dùng hội trường mẫu đầu tiên như ứng dụng cũ hiển thị.`);
      hallZones.set(legacyEventId, firstTemplate.zones);
      halls.push({ id: ctx.ids.idFor('EventHall', legacyEventId), event_id: ctx.ids.eventId(legacyEventId), template_id: ctx.ids.idFor('HallTemplate', firstTemplate.legacyId), zones: firstTemplate.zones });
    }

    const notImported = (blobKey: string, legacyEventId: string) =>
      issue('orphan', blobKey, legacyEventId, `Dữ liệu ${blobKey} của sự kiện "${legacyEventId}" không được nhập vì sự kiện không được nhập.`);

    const seats: Obj[] = [];
    for (const [legacyEventId, map] of entries(blob.eventSeating)) {
      if (!events.has(legacyEventId)) {
        notImported('eventSeating', legacyEventId);
        continue;
      }
      const guestList = isObj(blob.eventGuests) && Array.isArray(blob.eventGuests[legacyEventId]) ? (blob.eventGuests[legacyEventId] as unknown[]) : [];
      const guests = new Set(guestList.flatMap((g) => (isObj(g) && str(g.id) ? [str(g.id)] : [])));
      const hall = { zones: hallZones.get(legacyEventId) ?? [] };
      const seated = new Set<string>();
      for (const [rawCode, rawGuest] of entries(map)) {
        const guestId = str(rawGuest);
        const seatCode = parseSeatCode(rawCode);
        if (!seatCode) {
          issue('dropped_invalid', 'eventSeating', legacyEventId, `Mã ghế "${rawCode}" không hợp lệ; đã bỏ.`);
          continue;
        }
        if (!ctx.includeDemo && isDemoLegacyId(guestId)) {
          issue('skipped_demo', 'eventSeating', legacyEventId, `Ghế ${seatCode} của khách mẫu "${guestId}" không được nhập.`);
          continue;
        }
        if (!guests.has(guestId)) {
          issue('orphan', 'eventSeating', legacyEventId, `Ghế ${seatCode} trỏ tới khách "${guestId}" không có trong danh sách; đã bỏ.`);
          continue;
        }
        if (seated.has(guestId)) {
          issue('coerced', 'eventSeating', legacyEventId, `Khách "${guestId}" giữ nhiều ghế; chỉ giữ ghế đầu tiên, bỏ ghế ${seatCode}.`);
          continue;
        }
        seated.add(guestId);
        if (!zoneOfSeat(hall, seatCode)) issue('orphan', 'eventSeating', legacyEventId, `Ghế ${seatCode} không có trong sơ đồ hội trường của sự kiện; vẫn nhập để cán bộ giải phóng.`);
        seats.push({
          id: ctx.ids.idFor('SeatAssignment', seatCode, legacyEventId),
          event_id: ctx.ids.eventId(legacyEventId),
          seat_code: seatCode,
          guest_id: ctx.ids.idFor('Guest', guestId, legacyEventId),
        });
      }
    }

    const booths: Obj[] = [];
    for (const [legacyEventId, list] of entries(blob.eventBooths)) {
      if (!events.has(legacyEventId)) {
        notImported('eventBooths', legacyEventId);
        continue;
      }
      const boothKey = uniqueKeys();
      const codes = new Set<string>();
      const rows = Array.isArray(list) ? list : [];
      rows.forEach((b: unknown, i: number) => {
        if (!isObj(b)) return issue('dropped_invalid', 'eventBooths', legacyEventId, `Gian hàng thứ ${i + 1} không hợp lệ.`);
        const legacyId = boothKey(str(b.id) || `index-${i + 1}`);
        if (!ctx.includeDemo && isDemoLegacyId(str(b.id))) return issue('skipped_demo', 'eventBooths', legacyId, `Gian hàng mẫu ${str(b.code)} không được nhập.`);
        let code = normalizeBoothCode(b.code);
        if (!code) return issue('dropped_invalid', 'eventBooths', legacyId, `Mã gian "${str(b.code)}" không đọc được; đã bỏ.`);
        if (codes.has(code)) {
          const { row } = boothRow(code);
          const next = Math.max(...[...codes].filter((c) => boothRow(c).row === row).map((c) => boothRow(c).number)) + 1;
          const renamed = `${row}${String(next).padStart(2, '0')}`;
          issue('coerced', 'eventBooths', legacyId, `Mã gian ${code} bị trùng; gian "${str(b.company)}" nhận mã ${renamed}.`);
          code = renamed;
        }
        codes.add(code);
        const company = str(b.company);
        const known = oneOf(BOOTH_STATUS_VALUES, b.status);
        let status = known ?? (company ? 'reviewing' : 'available');
        if (status !== 'available' && !company) status = 'available';
        if (status !== b.status) issue('coerced', 'eventBooths', legacyId, `Trạng thái "${str(b.status)}" của gian ${code} đổi thành "${status}".`);
        const subsidy = oneOf(SUBSIDY_VALUES, Number(b.subsidyPercent)) ?? 50;
        if (subsidy !== Number(b.subsidyPercent)) issue('coerced', 'eventBooths', legacyId, `Mức hỗ trợ "${str(b.subsidyPercent)}" của gian ${code} không hợp lệ; đặt 50%.`);
        booths.push({
          id: ctx.ids.idFor('Booth', legacyId, legacyEventId),
          event_id: ctx.ids.eventId(legacyEventId),
          legacy_id: legacyId,
          code,
          size: str(b.size) || DEFAULT_BOOTH_SIZE,
          company,
          products: str(b.products),
          subsidy_percent: subsidy,
          status,
          contact: str(b.contact),
          staff: str(b.staff),
        });
      });
    }

    return {
      batches: [
        { table: 'sce_tcsk_hall_templates', rows: templates },
        { table: 'sce_tcsk_event_halls', rows: halls },
        { table: 'sce_tcsk_seat_assignments', rows: seats },
        { table: 'sce_tcsk_booths', rows: booths },
      ],
      issues,
    };
  },
};
