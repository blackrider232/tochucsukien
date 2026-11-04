import { describe, expect, it } from 'vitest';
import type { EventId, GuestId, SeatCode } from '@/core/brand';
import type { EventHall, HallZone, SeatAssignment } from '../contract';
import { DEFAULT_HALL_TEMPLATES } from '../domain/default-halls';
import {
  findFreeSeat, hallCapacity, isVipSeat, nextZone, orphanSeats, parseSeatCode, remapSeats, seatCodes, validateZones, zoneOccupancy, zoneOfSeat,
} from '../domain/halls';
import { zonesSchema } from '../domain/schemas';

const E = 'e0000000-0000-4000-8000-000000000001' as EventId;
const g = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}` as GuestId;
const code = (c: string) => c as SeatCode;
const zone = (key: string, seatCount: number, over: Partial<HallZone> = {}): HallZone => ({
  key, name: `Khu ${key}`, prefix: `${key}-`, seatCount, color: 'slate', assignedGroup: 'all', vipZone: false, ...over,
});
const hallOf = (...zones: HallZone[]): EventHall => ({ eventId: E, templateId: null, zones, version: 1 as EventHall['version'] });
const seat = (seatCode: string, guest: number): SeatAssignment => ({ eventId: E, seatCode: code(seatCode), guestId: g(guest) });

const ubnd = hallOf(...DEFAULT_HALL_TEMPLATES.find((t) => t.legacyId === 'hall_ubnd_tang3')!.zones);
const ncc = hallOf(...DEFAULT_HALL_TEMPLATES.find((t) => t.legacyId === 'hall_ncc')!.zones);

describe('capacity and seat codes', () => {
  it('sums the zones of the hall, never a stored total (m4b BUG-11)', () => {
    expect(hallCapacity(ncc.zones)).toBe(114);
    expect(hallCapacity(ubnd.zones)).toBe(54);
    expect(DEFAULT_HALL_TEMPLATES.map((t) => hallCapacity(t.zones))).toEqual([114, 54, 42]);
  });

  it('numbers seats prefix + two digits, three past 99', () => {
    expect(seatCodes(zone('A', 3))).toEqual(['A-01', 'A-02', 'A-03']);
    expect(seatCodes(zone('B', 101)).slice(98)).toEqual(['B-99', 'B-100', 'B-101']);
  });

  it('parses seat codes at the boundary and rejects anything else', () => {
    expect(parseSeatCode(' a-07 ')).toBe('A-07');
    for (const bad of ['A07', 'A-7', 'A-1234', 'ABCDE-01', "A-01');alert(1);//", '', 7]) expect(parseSeatCode(bad)).toBeNull();
  });
});

describe('zone validation (m4b BUG-04, BUG-13)', () => {
  it('reports an empty hall, a duplicate prefix in any case and a bad seat count', () => {
    expect(validateZones([])).toEqual([{ kind: 'empty' }]);
    expect(validateZones([zone('A', 10), zone('B', 10, { prefix: 'a-' })])).toEqual([{ kind: 'duplicate_prefix', prefix: 'a-' }]);
    expect(validateZones([zone('A', 0), zone('B', 501), zone('C', 2.5), zone('D', 500)])).toEqual([
      { kind: 'seat_count', key: 'A' }, { kind: 'seat_count', key: 'B' }, { kind: 'seat_count', key: 'C' },
    ]);
  });

  it('the shared schema refuses the same and points at the field', () => {
    const r = zonesSchema.safeParse([zone('A', 12), { ...zone('B', 100000), prefix: 'a-' }, { ...zone('C', -3), name: ' ' }]);
    expect(r.success).toBe(false);
    const issues = r.error!.issues.map((i) => [i.path.join('.'), i.message]);
    expect(issues).toContainEqual(['1.prefix', 'Tiền tố bị trùng với khu khác']);
    expect(issues).toContainEqual(['1.seatCount', 'Tối đa 500 ghế mỗi khu']);
    expect(issues).toContainEqual(['2.seatCount', 'Ít nhất 1 ghế']);
    expect(issues).toContainEqual(['2.name', 'Nhập tên khu']);
    expect(zonesSchema.safeParse([{ ...zone('A', 5), prefix: '<b>-' }]).success).toBe(false);
  });

  it('the next zone takes the first letter no zone uses, so remove-then-add cannot duplicate (m4b BUG-04)', () => {
    const afterRemovingA = [zone('B', 5), zone('C', 5)];
    expect(nextZone(afterRemovingA)).toMatchObject({ key: 'A', prefix: 'A-' });
    expect(nextZone([zone('A', 5), zone('C', 5)])).toMatchObject({ key: 'B', prefix: 'B-' });
    const all = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((k) => zone(k, 1));
    expect(nextZone(all)).toMatchObject({ key: 'K27', prefix: 'K27-' });
  });
});

describe('zoneOfSeat, isVipSeat, orphanSeats', () => {
  it('finds the zone of a code that exists and nothing for one that does not', () => {
    expect(zoneOfSeat(ubnd, code('B-18'))?.key).toBe('B');
    expect(zoneOfSeat(ubnd, code('B-19'))).toBeNull();
    expect(zoneOfSeat(ubnd, code('B-00'))).toBeNull();
    expect(zoneOfSeat(ubnd, code('D-01'))).toBeNull();
    expect(zoneOfSeat(hallOf(zone('A', 120)), code('A-100'))?.key).toBe('A');
    expect(zoneOfSeat(hallOf(zone('A', 120)), code('A-001'))).toBeNull();
  });

  it('a seat is VIP because its zone is flagged, not because of its prefix (m4b BUG-32)', () => {
    const hall = hallOf(zone('A', 10), zone('V', 4, { vipZone: true }));
    expect(isVipSeat(hall, code('A-07'))).toBe(false);
    expect(isVipSeat(hall, code('V-02'))).toBe(true);
    expect(isVipSeat(ncc, code('A-18'))).toBe(true);
  });

  it('lists the assignments a smaller or different hall no longer has', () => {
    const seats = [seat('A-12', 1), seat('A-18', 2), seat('D-30', 3)];
    expect(orphanSeats(ncc, seats)).toEqual([]);
    expect(orphanSeats(ubnd, seats).map((s) => s.seatCode)).toEqual(['A-18', 'D-30']);
  });
});

describe('findFreeSeat (consumed by live walk-in, decision 10)', () => {
  it('takes the group zone first, then a zone for everyone, then any zone, in hall order', () => {
    const hall = hallOf(zone('A', 2, { assignedGroup: 'VIP', vipZone: true }), zone('B', 2, { assignedGroup: 'SoNganh' }), zone('C', 2), zone('D', 2, { assignedGroup: 'BaoChi' }));
    expect(findFreeSeat(hall, new Set(), 'SoNganh')).toBe('B-01');
    expect(findFreeSeat(hall, new Set([code('B-01'), code('B-02')]), 'SoNganh')).toBe('C-01');
    expect(findFreeSeat(hall, new Set([code('B-01'), code('B-02'), code('C-01'), code('C-02')]), 'SoNganh')).toBe('D-01');
    expect(findFreeSeat(hall, new Set(), 'QuocTe')).toBe('C-01');
    expect(findFreeSeat(hall, new Set(), 'VIP')).toBe('A-01');
  });

  it('never puts a non-VIP guest in a VIP zone, and answers null when nothing fits', () => {
    const hall = hallOf(zone('A', 2, { assignedGroup: 'VIP', vipZone: true }), zone('B', 1));
    expect(findFreeSeat(hall, new Set([code('B-01')]), 'DoanhNghiep')).toBeNull();
    expect(findFreeSeat(hall, new Set([code('A-01'), code('A-02')]), 'VIP')).toBe('B-01');
    expect(findFreeSeat(hall, new Set([code('A-01'), code('A-02'), code('B-01')]), 'VIP')).toBeNull();
  });

  it('reads the real event zones, not a hard-coded A12/B18/C24 layout (m5 BUG-19)', () => {
    const taken = new Set(seatCodes(ncc.zones[0]!).slice(0, 12));
    expect(findFreeSeat(ncc, taken, 'VIP')).toBe('A-13');
    expect(findFreeSeat(ncc, new Set(), 'DoanhNghiep')).toBe('D-01');
  });
});

describe('zoneOccupancy (consumed by the live hall monitor)', () => {
  it('counts seats, assignments and arrivals per zone, and orphans nowhere', () => {
    const seats = [seat('A-01', 1), seat('A-02', 2), seat('B-05', 3), seat('Z-01', 4)];
    const occ = zoneOccupancy(ubnd, seats, new Set([g(2), g(3), g(4)]));
    expect(occ.map((o) => [o.zone.key, o.seats, o.assigned, o.arrived])).toEqual([['A', 12, 2, 1], ['B', 18, 1, 1], ['C', 24, 0, 0]]);
  });
});

describe('remapSeats on a hall or zone change (m4b BUG-05)', () => {
  it('keeps the seat number in the zone at the same position and releases what does not fit', () => {
    const { kept, released } = remapSeats(ncc.zones, ubnd.zones, [seat('A-15', 1), seat('A-03', 2), seat('B-10', 3), seat('D-01', 4), seat('X-01', 5)]);
    expect(kept.map((s) => [s.guestId, s.seatCode])).toEqual([[g(2), 'A-03'], [g(3), 'B-10']]);
    expect(released.map((s) => s.guestId)).toEqual([g(1), g(4), g(5)]);
  });
});
