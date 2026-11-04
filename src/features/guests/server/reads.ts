// Server reads. RLS decides what the actor sees; these only merge the roster.

import type { RequestContext } from '@/core/auth';
import type { EventId, GuestId } from '@/core/brand';
import type * as C from '../contract';
import type { RosterEntry } from '../contract';
import { draftOf } from '../domain/schemas';
import { checkinsTable, guestsTable, seatsTable, type GuestRow } from './tables';

/** The Guest of the contract: the importer's legacy key stays on the server. */
export function toGuest(row: GuestRow): C.Guest {
  const { id, eventId, checkinCode, rsvpAt, version, createdAt, createdBy, updatedAt } = row;
  return { ...draftOf(row), id, eventId, checkinCode, rsvpAt, version, createdAt, createdBy, updatedAt };
}

/** Left join guest + seat + check-in, the rows sce_tcsk_guest_roster returns (see tables.ts), in insertion order. */
export const readRoster: typeof C.readRoster = async (ctx: RequestContext, eventId: EventId) => {
  const [guests, seats, checkins] = await Promise.all([
    ctx.db.table(guestsTable).list({ eventId }),
    ctx.db.table(seatsTable).list({ eventId }),
    ctx.db.table(checkinsTable).list({ eventId }),
  ]);
  const seatOf = new Map(seats.map((s) => [s.guestId, s.seatCode]));
  const checkinOf = new Map(checkins.map((c) => [c.guestId, c]));
  return guests.map((g): RosterEntry => {
    const c = checkinOf.get(g.id);
    return { ...toGuest(g), seatCode: seatOf.get(g.id) ?? null, checkedInAt: c?.checkedInAt ?? null, giftGivenAt: c?.giftGivenAt ?? null };
  });
};

/** One roster row, or null when it is absent, of another event, or not visible to the actor. */
export async function readRosterEntry(ctx: RequestContext, eventId: EventId, id: GuestId): Promise<RosterEntry | null> {
  const guest = await ctx.db.table(guestsTable).get(id);
  if (!guest || guest.eventId !== eventId) return null;
  const [seats, checkins] = await Promise.all([ctx.db.table(seatsTable).list({ eventId, guestId: id }), ctx.db.table(checkinsTable).list({ eventId, guestId: id })]);
  return { ...toGuest(guest), seatCode: seats[0]?.seatCode ?? null, checkedInAt: checkins[0]?.checkedInAt ?? null, giftGivenAt: checkins[0]?.giftGivenAt ?? null };
}

/**
 * Legacy guest id -> guest id of one event, for live's matchScan of badges printed before cutover. The key is the
 * importer's legacy_id; a guest whose legacy id collided carries '#2' (see legacy-importer.ts).
 */
export async function readLegacyGuestIds(ctx: RequestContext, eventId: EventId): Promise<ReadonlyMap<string, GuestId>> {
  const guests = await ctx.db.table(guestsTable).list({ eventId });
  return new Map(guests.flatMap((g) => (g.legacyId ? [[g.legacyId, g.id] as const] : [])));
}
