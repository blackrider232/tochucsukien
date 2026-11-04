// The live screens' data: the event (progress), the roster (guests), the hall
// and its seats (venue), and live's own duty staff and incidents.

import type { RequestContext } from '@/core/auth';
import { can } from '@/core/permissions';
import type { SceEvent } from '@/features/progress';
import { readRoster } from '@/features/guests/server';
import { readEventHall, readSeating } from '@/features/venue/server';
import { dutyRequiredAt } from '../domain/duty';
import type { LiveScreenData } from '../domain/screen';
import { readDutyStaff, readIncidents } from './reads';

export async function liveScreen(ctx: RequestContext, event: SceEvent): Promise<LiveScreenData> {
  const [roster, hall, seats, staff, incidents] = await Promise.all([
    readRoster(ctx, event.id), readEventHall(ctx, event.id), readSeating(ctx, event.id), readDutyStaff(ctx, event.id), readIncidents(ctx, event.id),
  ]);
  const scope = { departments: [event.department, ...event.supportingDepartments] };
  const checkIn = can(ctx.actor, 'live.checkin', scope);
  return {
    event: { id: event.id, name: event.name, eventDate: event.eventDate, eventTime: event.eventTime, location: event.location, targetGuests: event.targetGuests },
    roster, hall, seats, staff, incidents,
    requiredAt: dutyRequiredAt(event, ctx.settings),
    now: ctx.now,
    can: { checkIn, manage: can(ctx.actor, 'live.manage', scope), walkIn: checkIn && can(ctx.actor, 'guests.write', scope) && can(ctx.actor, 'venue.seating.write', scope) },
  };
}
