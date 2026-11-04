// "Tự động xếp chỗ" as a pure function (m4b §3.3 intended). Deterministic for a
// given random source, so tests seed it.

import type { GuestId, SeatCode } from '@/core/brand';
import type { GuestGroup } from '@/core/vocab';
import type { HallZone, SeatAssignment } from '../contract';
import { seatCodes, vipEligible, zoneOfSeat } from './halls';

/** 'fill-empty' keeps every existing seat (the default, m4b BUG-03); 'reassign-all' clears them first. */
export type AutoAssignMode = 'fill-empty' | 'reassign-all';
export const AUTO_ASSIGN_MODES = ['fill-empty', 'reassign-all'] as const satisfies ReadonlyArray<AutoAssignMode>;

export interface SeatGuest {
  id: GuestId;
  group: GuestGroup;
}

export interface AutoAssignResult {
  /** New placements only. */
  placed: ReadonlyArray<{ seatCode: SeatCode; guestId: GuestId }>;
  unplaced: ReadonlyArray<GuestId>;
  /** Final counts per zone, kept seats and overflow included (m4b BUG-10). */
  perZone: ReadonlyArray<{ zone: HallZone; assigned: number; seats: number }>;
}

/** What the command reports back for the result dialog. */
export interface AutoAssignSummary {
  attending: number;
  placed: number;
  unplaced: number;
  perZone: ReadonlyArray<{ key: string; name: string; assigned: number; seats: number }>;
}

/** mulberry32: a small seeded generator in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: ReadonlyArray<T>, random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Seats `guests` (the attending ones) into the free seats of `zones`. Zones that target a group fill first, then zones
 * for everyone, so an 'all' zone listed first cannot absorb the VIPs. Leftover guests overflow into any free seat they
 * are eligible for; a VIP zone takes VIP guests only. In 'fill-empty' mode a seated guest is never moved.
 */
export function planAutoAssign(
  zones: ReadonlyArray<HallZone>,
  guests: ReadonlyArray<SeatGuest>,
  existing: ReadonlyArray<SeatAssignment>,
  mode: AutoAssignMode,
  random: () => number,
): AutoAssignResult {
  const kept = mode === 'fill-empty' ? existing : [];
  const taken = new Set(kept.map((s) => s.seatCode));
  const seated = new Set(kept.map((s) => s.guestId));
  let pool = shuffle(guests.filter((g) => !seated.has(g.id)), random);
  const placed: Array<{ seatCode: SeatCode; guestId: GuestId; zone: HallZone }> = [];
  const freeOf = new Map(zones.map((z) => [z.key, shuffle(seatCodes(z).filter((c) => !taken.has(c)), random)]));

  const take = (zone: HallZone, fits: (g: SeatGuest) => boolean) => {
    const free = freeOf.get(zone.key)!;
    while (free.length > 0) {
      const i = pool.findIndex(fits);
      if (i < 0) return;
      placed.push({ seatCode: free.pop()!, guestId: pool[i]!.id, zone });
      pool = pool.filter((_, j) => j !== i);
    }
  };
  const ordered = [...zones.filter((z) => z.assignedGroup !== 'all'), ...zones.filter((z) => z.assignedGroup === 'all')];
  for (const zone of ordered) take(zone, (g) => (zone.assignedGroup === 'all' || zone.assignedGroup === g.group) && vipEligible(zone, g.group));
  for (const zone of shuffle(zones, random)) take(zone, (g) => vipEligible(zone, g.group));

  const hall = { zones };
  const perZone = zones.map((zone) => ({
    zone,
    seats: zone.seatCount,
    assigned: kept.filter((s) => zoneOfSeat(hall, s.seatCode)?.key === zone.key).length + placed.filter((p) => p.zone.key === zone.key).length,
  }));
  return { placed: placed.map(({ seatCode, guestId }) => ({ seatCode, guestId })), unplaced: pool.map((g) => g.id), perZone };
}
