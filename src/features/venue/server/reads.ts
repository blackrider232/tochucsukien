// Server reads. RLS decides what the actor sees; these only shape the rows.
// Nothing here creates or seeds anything (m4b BUG-02, BUG-34).

import type { RequestContext } from '@/core/auth';
import type { EventId, HallTemplateId } from '@/core/brand';
import type * as C from '../contract';
import type { BoothShift, EventHall, HallTemplate, SeatAssignment } from '../contract';
import { boothShiftsTable, boothsTable, eventHallsTable, hallTemplatesTable, seatsTable, type EventHallRow, type HallTemplateRow, type SeatRow } from './tables';

const toTemplate = ({ id, name, location, description, zones, version }: HallTemplateRow): HallTemplate => ({ id, name, location, description, zones, version });
const toHall = ({ eventId, templateId, zones, version }: EventHallRow): EventHall => ({ eventId, templateId, zones, version });
const toSeat = ({ eventId, seatCode, guestId }: SeatRow): SeatAssignment => ({ eventId, seatCode, guestId });

export async function listHallTemplates(ctx: RequestContext): Promise<ReadonlyArray<HallTemplate>> {
  return (await ctx.db.table(hallTemplatesTable).list()).map(toTemplate);
}

/** How many event halls the actor can see were copied from each template (delete warning, m4b BUG-12). */
export async function hallTemplateUsage(ctx: RequestContext): Promise<ReadonlyMap<HallTemplateId, number>> {
  const halls = await ctx.db.table(eventHallsTable).list();
  const usage = new Map<HallTemplateId, number>();
  for (const h of halls) if (h.templateId) usage.set(h.templateId, (usage.get(h.templateId) ?? 0) + 1);
  return usage;
}

export const readEventHall: typeof C.readEventHall = async (ctx, eventId) => {
  const [row] = await ctx.db.table(eventHallsTable).list({ eventId });
  return row ? toHall(row) : null;
};

export const readSeating: typeof C.readSeating = async (ctx, eventId) => (await ctx.db.table(seatsTable).list({ eventId })).map(toSeat);

export const readBooths: typeof C.readBooths = (ctx, eventId) => ctx.db.table(boothsTable).list({ eventId });

export async function readBoothShifts(ctx: RequestContext, eventId: EventId): Promise<ReadonlyArray<BoothShift>> {
  return ctx.db.table(boothShiftsTable).list({ eventId });
}
