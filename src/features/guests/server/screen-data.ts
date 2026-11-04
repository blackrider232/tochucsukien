// The guest screens' data: the event (progress), the roster, which seats are in
// a VIP zone (venue) and whether the actor may write (UI hiding only).

import type { RequestContext } from '@/core/auth';
import type { EventId, SeatCode } from '@/core/brand';
import { can } from '@/core/permissions';
import { readEvent } from '@/features/progress/server';
import { zoneOfSeat } from '@/features/venue';
import { readEventHall } from '@/features/venue/server';
import type { RosterEntry } from '../contract';
import type { GuestScreenData } from '../domain/screen';
import { readRoster } from './reads';

/** Until venue merges, its functions throw 'not implemented': then no zone is a VIP zone (features/README.md). */
async function vipSeatsOf(ctx: RequestContext, eventId: EventId, roster: ReadonlyArray<RosterEntry>): Promise<SeatCode[]> {
  const seated = roster.flatMap((g) => (g.seatCode ? [g.seatCode] : []));
  if (seated.length === 0) return [];
  try {
    const hall = await readEventHall(ctx, eventId);
    return hall ? seated.filter((code) => zoneOfSeat(hall, code)?.vipZone === true) : [];
  } catch (e) {
    if (e instanceof Error && e.message === 'not implemented') return [];
    throw e;
  }
}

export async function guestScreenData(ctx: RequestContext, eventId: EventId): Promise<GuestScreenData | null> {
  const event = await readEvent(ctx, eventId);
  if (!event) return null;
  const roster = await readRoster(ctx, eventId);
  return {
    event: {
      id: event.id, name: event.name, eventDate: event.eventDate, eventTime: event.eventTime, location: event.location,
      department: event.department, targetGuests: event.targetGuests,
    },
    roster,
    vipSeats: await vipSeatsOf(ctx, eventId, roster),
    canWrite: can(ctx.actor, 'guests.write', { departments: [event.department, ...event.supportingDepartments] }),
  };
}
