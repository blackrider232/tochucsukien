import { describe, expect, it } from 'vitest';
import type { EventId, GuestId, SeatCode } from '@/core/brand';
import type { GuestGroup } from '@/core/vocab';
import type { HallZone, SeatAssignment } from '../contract';
import { planAutoAssign, seededRandom, type SeatGuest } from '../domain/auto-assign';
import { zoneOfSeat } from '../domain/halls';

const E = 'e0000000-0000-4000-8000-000000000001' as EventId;
const zone = (key: string, seatCount: number, over: Partial<HallZone> = {}): HallZone => ({
  key, name: `Khu ${key}`, prefix: `${key}-`, seatCount, color: 'slate', assignedGroup: 'all', vipZone: false, ...over,
});
let n = 0;
const guests = (group: GuestGroup, count: number): SeatGuest[] =>
  Array.from({ length: count }, () => ({ id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` as GuestId, group }));

const vip = zone('A', 3, { assignedGroup: 'VIP', vipZone: true });
const so = zone('B', 3, { assignedGroup: 'SoNganh' });
const mixed = zone('C', 4);

describe('planAutoAssign', () => {
  it('keeps every seated guest where they are in fill-empty mode (m4b BUG-03)', () => {
    const [v1, v2] = guests('VIP', 2);
    const others = guests('DoanhNghiep', 2);
    const existing: SeatAssignment[] = [{ eventId: E, seatCode: 'A-03' as SeatCode, guestId: v1!.id }, { eventId: E, seatCode: 'C-01' as SeatCode, guestId: others[0]!.id }];
    const r = planAutoAssign([vip, so, mixed], [v1!, v2!, ...others], existing, 'fill-empty', seededRandom(7));
    expect(r.placed.map((p) => p.guestId).sort()).toEqual([v2!.id, others[1]!.id].sort());
    expect(r.placed.some((p) => p.seatCode === 'A-03' || p.seatCode === 'C-01')).toBe(false);
    expect(r.unplaced).toEqual([]);
  });

  it('fills group zones before an "all" zone listed first, so VIPs land in the VIP zone (m4b BUG-10)', () => {
    const vips = guests('VIP', 3);
    const r = planAutoAssign([mixed, vip], vips, [], 'fill-empty', seededRandom(1));
    expect(r.placed.map((p) => zoneOfSeat({ zones: [mixed, vip] }, p.seatCode)?.key)).toEqual(['A', 'A', 'A']);
  });

  it('overflows into free seats but never a non-VIP guest into the VIP zone', () => {
    const many = guests('DoanhNghiep', 9);
    const r = planAutoAssign([vip, so, mixed], many, [], 'fill-empty', seededRandom(3));
    const zones = r.placed.map((p) => zoneOfSeat({ zones: [vip, so, mixed] }, p.seatCode)!.key);
    expect(zones.filter((k) => k === 'A')).toEqual([]);
    expect(r.placed).toHaveLength(7);
    expect(r.unplaced).toHaveLength(2);
    expect(r.perZone.map((z) => [z.zone.key, z.assigned, z.seats])).toEqual([['A', 0, 3], ['B', 3, 3], ['C', 4, 4]]);
  });

  it('lets a VIP overflow into other zones when the VIP zone is full', () => {
    const vips = guests('VIP', 5);
    const r = planAutoAssign([vip, mixed], vips, [], 'fill-empty', seededRandom(5));
    expect(r.placed).toHaveLength(5);
    expect(r.perZone.map((z) => z.assigned)).toEqual([3, 2]);
  });

  it('reassign-all ignores existing seats; one seed gives one plan, and no seat or guest is used twice', () => {
    const all = [...guests('VIP', 2), ...guests('SoNganh', 4), ...guests('BaoChi', 3)];
    const existing: SeatAssignment[] = [{ eventId: E, seatCode: 'A-01' as SeatCode, guestId: all[5]!.id }];
    const a = planAutoAssign([vip, so, mixed], all, existing, 'reassign-all', seededRandom(42));
    const b = planAutoAssign([vip, so, mixed], all, existing, 'reassign-all', seededRandom(42));
    expect(a).toEqual(b);
    expect(new Set(a.placed.map((p) => p.seatCode)).size).toBe(a.placed.length);
    expect(new Set(a.placed.map((p) => p.guestId)).size).toBe(a.placed.length);
    expect(a.placed.find((p) => p.guestId === all[5]!.id)?.seatCode).not.toBe('A-01');
    expect(a.placed.length + a.unplaced.length).toBe(all.length);
  });
});
