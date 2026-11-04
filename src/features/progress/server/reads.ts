// Server reads. RLS decides what the actor sees; these only assemble the plan.

import type { RequestContext } from '@/core/auth';
import type { EventId } from '@/core/brand';
import type * as C from '../contract';
import type { EventPlan, SceEvent, Step } from '../contract';
import { isPlanComplete } from '../domain/schedule';
import { eventsTable, groupsTable, stepsTable, type EventRow, type GroupRow, type StepRow } from './tables';

const withStatus = (event: EventRow, steps: ReadonlyArray<Step>): SceEvent => ({
  ...event,
  status: isPlanComplete({ groups: [{ steps }] }) ? 'completed' : 'preparing',
});

function assemble(events: ReadonlyArray<EventRow>, groups: ReadonlyArray<GroupRow>, steps: ReadonlyArray<StepRow>): EventPlan[] {
  const stepsOf = Map.groupBy(steps, (s) => s.groupId);
  const groupsOf = Map.groupBy(groups, (g) => g.eventId);
  return events.map((event) => {
    const planGroups = (groupsOf.get(event.id) ?? []).map((g) => ({ ...g, steps: stepsOf.get(g.id) ?? [] }));
    return { event: withStatus(event, planGroups.flatMap((g) => g.steps)), groups: planGroups };
  });
}

const visibleEvents = (ctx: RequestContext, includeDeleted?: boolean) =>
  ctx.db.table(eventsTable).list(includeDeleted ? undefined : { deletedAt: null });

/** Every visible event with its groups and steps, in T0 order. */
export async function listEventPlans(ctx: RequestContext): Promise<EventPlan[]> {
  const [events, groups, steps] = await Promise.all([visibleEvents(ctx), ctx.db.table(groupsTable).list(), ctx.db.table(stepsTable).list()]);
  return assemble(events, groups, steps);
}

export const listEvents: typeof C.listEvents = async (ctx, f) => {
  const [events, steps] = await Promise.all([visibleEvents(ctx, f?.includeDeleted), ctx.db.table(stepsTable).list()]);
  const stepsOf = Map.groupBy(steps, (s) => s.eventId);
  return events.map((e) => withStatus(e, stepsOf.get(e.id) ?? []));
};

export const readEventPlan: typeof C.readEventPlan = async (ctx, id: EventId) => {
  const event = await ctx.db.table(eventsTable).get(id);
  if (!event || event.deletedAt) return null;
  const [groups, steps] = await Promise.all([ctx.db.table(groupsTable).list({ eventId: id }), ctx.db.table(stepsTable).list({ eventId: id })]);
  return assemble([event], groups, steps)[0] ?? null;
};

export const readEvent: typeof C.readEvent = async (ctx, id) => (await readEventPlan(ctx, id))?.event ?? null;
