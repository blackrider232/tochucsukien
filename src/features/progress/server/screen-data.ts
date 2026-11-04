// What the plan screens need besides the plans: per-event permissions (UI
// hiding only; the commands and RLS decide) and the departments the actor
// may create events for.

import type { RequestContext } from '@/core/auth';
import { todayVN } from '@/core/dates';
import { can } from '@/core/permissions';
import type { EventPlan } from '../contract';
import type { PlanScreenData } from '../components/plan-context';
import { CHAIR_DEPARTMENTS } from '../domain/schemas';

export function screenData(ctx: RequestContext, plans: ReadonlyArray<EventPlan>): PlanScreenData {
  const { actor } = ctx;
  return {
    plans,
    today: todayVN(ctx.now),
    perms: Object.fromEntries(plans.map(({ event }) => {
      const lead = { departments: [event.department] };
      return [event.id, {
        write: can(actor, 'progress.write', { departments: [event.department, ...event.supportingDepartments] }),
        edit: can(actor, 'progress.write', lead),
        remove: can(actor, 'progress.delete', lead),
      }];
    })),
    createDepartments: CHAIR_DEPARTMENTS.filter((d) => can(actor, 'progress.create', { departments: [d] })),
  };
}
