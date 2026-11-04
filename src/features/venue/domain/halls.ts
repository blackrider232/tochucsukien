// The one hall/zone/seat model (decision 19). Zones define the seat codes; a
// seat exists only as a code of a zone of the event's hall. Pure, shared by the
// seating screen, the commands, live check-in and name cards.

import type { GuestId, SeatCode } from '@/core/brand';
import type { GuestGroup, Tone } from '@/core/vocab';
import type { IconName } from '@/components/ui';
import type { EventHall, HallZone, SeatAssignment, ZoneColor, ZoneOccupancy, ZoneProblem } from '../contract';

export const MAX_SEATS_PER_ZONE = 500;
export const MAX_ZONES = 26;
/** Prefix of a seat code, ending in '-' (the seat_code check in 0002 needs the dash). */
export const PREFIX_PATTERN = /^[A-Z0-9]{1,4}-$/;
export const SEAT_CODE_PATTERN = /^[A-Z0-9]{1,4}-[0-9]{2,3}$/;

export type ZoneGroup = GuestGroup | 'all';

/** One seat's change, as the client saw it: the command refuses it when the seat no longer holds `from`. */
export interface SeatChange {
  seatCode: SeatCode;
  from: GuestId | null;
  to: GuestId | null;
}


/** One colour registry for dots, legend chips and seat tiles (m4b BUG-14). Each colour is a kit Tone. */
export const ZONE_COLORS: { readonly [C in ZoneColor]: { label: string; tone: Tone } } = {
  red: { label: 'Đỏ (VIP)', tone: 'red' },
  blue: { label: 'Xanh dương', tone: 'blue' },
  emerald: { label: 'Xanh lục', tone: 'emerald' },
  purple: { label: 'Tím', tone: 'purple' },
  slate: { label: 'Xám đá', tone: 'slate' },
};
export const ZONE_COLOR_VALUES = Object.keys(ZONE_COLORS) as [ZoneColor, ...ZoneColor[]];

/** One label set for a zone's target group, replacing the four legacy maps (m4b BUG-01, BUG-31, §3.5). */
export const ZONE_GROUPS: { readonly [G in ZoneGroup]: { short: string; long: string; icon: IconName } } = {
  VIP: { short: 'Đại biểu VIP', long: 'Đại biểu VIP (Biển tên chữ A để bàn)', icon: 'star' },
  SoNganh: { short: 'Khối Sở ban ngành', long: 'Khối Sở, Ban, Ngành & Quận/Huyện', icon: 'landmark' },
  QuocTe: { short: 'Ngoại giao & Quốc tế', long: 'Ngoại giao, Đại sứ quán & Quốc tế', icon: 'globe' },
  DoanhNghiep: { short: 'Doanh nghiệp & Nhà đầu tư', long: 'Doanh nghiệp, Hiệp hội & Nhà đầu tư', icon: 'briefcase' },
  BaoChi: { short: 'Báo chí & Truyền thông', long: 'Phóng viên Báo chí & Truyền hình', icon: 'newspaper' },
  all: { short: 'Chung / Tất cả nhóm', long: 'Hỗn hợp / Không giới hạn nhóm', icon: 'users' },
};
export const ZONE_GROUP_VALUES = Object.keys(ZONE_GROUPS) as [ZoneGroup, ...ZoneGroup[]];

const pad2 = (n: number) => String(n).padStart(2, '0');
const prefixKey = (p: string) => p.trim().toUpperCase();

export function validateZones(zones: ReadonlyArray<HallZone>): ReadonlyArray<ZoneProblem> {
  if (zones.length === 0) return [{ kind: 'empty' }];
  const problems: ZoneProblem[] = [];
  const seen = new Set<string>();
  for (const z of zones) {
    const key = prefixKey(z.prefix);
    if (seen.has(key)) problems.push({ kind: 'duplicate_prefix', prefix: z.prefix });
    seen.add(key);
    if (!Number.isInteger(z.seatCount) || z.seatCount < 1 || z.seatCount > MAX_SEATS_PER_ZONE) problems.push({ kind: 'seat_count', key: z.key });
  }
  return problems;
}

/** Σ seatCount. Capacity is never stored (m4b BUG-11). */
export function hallCapacity(zones: ReadonlyArray<HallZone>): number {
  return zones.reduce((sum, z) => sum + z.seatCount, 0);
}

export function seatCodes(zone: Pick<HallZone, 'prefix' | 'seatCount'>): ReadonlyArray<SeatCode> {
  return Array.from({ length: zone.seatCount }, (_, i) => `${zone.prefix}${pad2(i + 1)}` as SeatCode);
}

/** The seat number within its zone, or null when the code is not one of this zone's codes. */
function seatNumber(zone: Pick<HallZone, 'prefix' | 'seatCount'>, code: string): number | null {
  if (!code.startsWith(zone.prefix)) return null;
  const rest = code.slice(zone.prefix.length);
  if (!/^\d{2,3}$/.test(rest)) return null;
  const n = Number(rest);
  return n >= 1 && n <= zone.seatCount && pad2(n) === rest ? n : null;
}

/** The zone a seat belongs to (m4b §3.6 seatZone). Null for a code the hall does not have: an orphan. */
export function zoneOfSeat(hall: Pick<EventHall, 'zones'>, code: SeatCode): HallZone | null {
  return hall.zones.find((z) => seatNumber(z, code) !== null) ?? null;
}

/** VIP seats are the seats of zones flagged vipZone, never a prefix convention (m4b BUG-32). */
export function isVipSeat(hall: Pick<EventHall, 'zones'>, code: SeatCode): boolean {
  return zoneOfSeat(hall, code)?.vipZone ?? false;
}

export function parseSeatCode(raw: unknown): SeatCode | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return SEAT_CODE_PATTERN.test(code) ? (code as SeatCode) : null;
}

/** A VIP zone's seats go to VIP guests only, by any automatic path (m4b BUG-10, product question 7.3 default). */
export function vipEligible(zone: HallZone, group: GuestGroup): boolean {
  return !zone.vipZone || group === 'VIP';
}

/**
 * The first free seat for a guest of `group` (m4b §3.4, m5 walk-in, decision 10): zones targeting the group, then
 * zones for everyone, then any zone; each tier in hall order, and a VIP zone only for a VIP guest.
 */
export function findFreeSeat(hall: Pick<EventHall, 'zones'>, taken: ReadonlySet<SeatCode>, group: GuestGroup): SeatCode | null {
  const allowed = hall.zones.filter((z) => vipEligible(z, group));
  const tiers = [allowed.filter((z) => z.assignedGroup === group), allowed.filter((z) => z.assignedGroup === 'all'), allowed];
  for (const zones of tiers) {
    for (const zone of zones) {
      const free = seatCodes(zone).find((c) => !taken.has(c));
      if (free) return free;
    }
  }
  return null;
}

/** Assignments whose seat the hall does not have (after a shrink, a hall change, or a legacy import). */
export function orphanSeats(hall: Pick<EventHall, 'zones'>, seats: ReadonlyArray<SeatAssignment>): ReadonlyArray<SeatAssignment> {
  return seats.filter((s) => zoneOfSeat(hall, s.seatCode) === null);
}

/** Per zone: seats, assignments in it, and how many of those guests have arrived. Orphans count nowhere (m4b §3.1). */
export function zoneOccupancy(hall: Pick<EventHall, 'zones'>, seats: ReadonlyArray<SeatAssignment>, arrived: ReadonlySet<GuestId>): ReadonlyArray<ZoneOccupancy> {
  const byZone = new Map<string, SeatAssignment[]>();
  for (const s of seats) {
    const zone = zoneOfSeat(hall, s.seatCode);
    if (zone) byZone.set(zone.key, [...(byZone.get(zone.key) ?? []), s]);
  }
  return hall.zones.map((zone) => {
    const inZone = byZone.get(zone.key) ?? [];
    return { zone, seats: zone.seatCount, assigned: inZone.length, arrived: inZone.filter((s) => arrived.has(s.guestId)).length };
  });
}

/**
 * Where each seat goes when the zones change: the same seat number in the zone at the same position, if that zone
 * still has it; otherwise the seat is released (m4b BUG-05, "remap by zone order and index").
 */
export function remapSeats(
  from: ReadonlyArray<HallZone>,
  to: ReadonlyArray<HallZone>,
  seats: ReadonlyArray<SeatAssignment>,
): { kept: ReadonlyArray<SeatAssignment>; released: ReadonlyArray<SeatAssignment> } {
  const kept: SeatAssignment[] = [];
  const released: SeatAssignment[] = [];
  for (const s of seats) {
    const index = from.findIndex((z) => seatNumber(z, s.seatCode) !== null);
    const n = index >= 0 ? seatNumber(from[index]!, s.seatCode) : null;
    const target = index >= 0 ? to[index] : undefined;
    if (n !== null && target && n <= target.seatCount) kept.push({ ...s, seatCode: `${target.prefix}${pad2(n)}` as SeatCode });
    else released.push(s);
  }
  return { kept, released };
}

/** The next zone a hall editor adds: the first letter no zone uses as key or prefix (m4b BUG-04). */
export function nextZone(zones: ReadonlyArray<Pick<HallZone, 'key' | 'prefix'>>): HallZone {
  const used = new Set(zones.flatMap((z) => [z.key.toUpperCase(), prefixKey(z.prefix).replace(/-$/, '')]));
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  let key = letters.find((l) => !used.has(l));
  for (let n = zones.length + 1; !key; n++) if (!used.has(`K${n}`)) key = `K${n}`;
  return { key, name: `Khu ${key}: Đại biểu`, prefix: `${key}-`, seatCount: 18, color: 'slate', assignedGroup: 'all', vipZone: false };
}

const numberFormat = new Intl.NumberFormat('vi-VN');
/** Thousands with '.' (m4b BUG-15: toLocaleString without a locale). */
export const formatCount = (n: number) => numberFormat.format(n);
