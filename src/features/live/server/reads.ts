// Server reads. RLS decides what the actor sees; these only shape the rows.

import type { RequestContext } from '@/core/auth';
import type { EventId } from '@/core/brand';
import type * as C from '../contract';
import type { CheckIn, DutyStaff, Incident } from '../contract';
import { checkinsTable, dutyStaffTable, incidentsTable, type CheckinRow, type DutyRow, type IncidentRow } from './tables';

export const toCheckIn = ({ eventId, guestId, checkedInAt, checkedInBy, desk, giftGivenAt }: CheckinRow): CheckIn => ({ eventId, guestId, checkedInAt, checkedInBy, desk, giftGivenAt });
export const toDuty = ({ id, eventId, name, userId, department, desk, roleLabel, checkedInAt, version }: DutyRow): DutyStaff => ({ id, eventId, name, userId, department, desk, roleLabel, checkedInAt, version });
export const toIncident = ({ id, eventId, seq, location, description, urgency, assignee, status, reportedAt, resolvedAt, resolutionNote, version }: IncidentRow): Incident =>
  ({ id, eventId, seq, location, description, urgency, assignee, status, reportedAt, resolvedAt, resolutionNote, version });

export const readCheckIns: typeof C.readCheckIns = async (ctx, eventId) => (await ctx.db.table(checkinsTable).list({ eventId })).map(toCheckIn);

export async function readDutyStaff(ctx: RequestContext, eventId: EventId): Promise<ReadonlyArray<DutyStaff>> {
  return (await ctx.db.table(dutyStaffTable).list({ eventId })).map(toDuty);
}

export async function readIncidents(ctx: RequestContext, eventId: EventId): Promise<ReadonlyArray<Incident>> {
  return (await ctx.db.table(incidentsTable).list({ eventId })).map(toIncident);
}
