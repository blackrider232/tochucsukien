// What the venue screens need beyond the rows: the guests through the adapter,
// trimmed for the client, and per-event permissions (UI hiding only; the
// commands and RLS decide).

import type { RequestContext } from '@/core/auth';
import { todayVN } from '@/core/dates';
import { can } from '@/core/permissions';
import type { SceEvent } from '@/features/progress';
import type { BoothsScreenData, SeatingScreenData } from '../components/screen-types';
import { listHallTemplates, readBooths, readBoothShifts, readEventHall, readSeating } from './reads';
import { rosterOf } from './upstream';

const scopeOf = (event: SceEvent) => ({ departments: [event.department, ...event.supportingDepartments] });

export async function seatingScreen(ctx: RequestContext, event: SceEvent): Promise<SeatingScreenData> {
  const [hall, templates, seats, roster] = await Promise.all([readEventHall(ctx, event.id), listHallTemplates(ctx), readSeating(ctx, event.id), rosterOf(ctx, event.id)]);
  return {
    event: { id: event.id, name: event.name, eventDate: event.eventDate },
    hall,
    templates,
    seats,
    guests: roster.ready
      ? { ready: true, value: roster.value.map((g) => ({ id: g.id, name: g.name, title: g.title, organization: g.organization, group: g.group, rsvpStatus: g.rsvpStatus })) }
      : { ready: false },
    canWrite: can(ctx.actor, 'venue.seating.write', scopeOf(event)),
    canAdminHalls: can(ctx.actor, 'venue.halls.admin'),
    today: todayVN(ctx.now),
  };
}

export async function boothsScreen(ctx: RequestContext, event: SceEvent): Promise<BoothsScreenData> {
  const [booths, shifts] = await Promise.all([readBooths(ctx, event.id), readBoothShifts(ctx, event.id)]);
  return {
    event: { id: event.id, name: event.name, eventDate: event.eventDate },
    booths,
    shifts,
    canWrite: can(ctx.actor, 'venue.booths.write', scopeOf(event)),
    today: todayVN(ctx.now),
  };
}
