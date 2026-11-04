// The one place reports reads the features it summarises: the plan
// (progress), the roster (guests) and the booths (venue). Until an owner
// lands, its read throws 'not implemented'; that error, and only that one,
// becomes an explicit "not ready" state, never zero counts.

import type { RequestContext } from '@/core/auth';
import type { EventId } from '@/core/brand';
import { CommandError } from '@/core/commands';
import { readRoster, type RosterEntry } from '@/features/guests/server';
import { readEventPlan, type EventPlan } from '@/features/progress/server';
import { readBooths, type Booth } from '@/features/venue/server';

export type Upstream<T> = { ready: true; value: T } | { ready: false };

async function guarded<T>(read: () => Promise<T>): Promise<Upstream<T>> {
  try {
    return { ready: true, value: await read() };
  } catch (e) {
    if (e instanceof Error && e.message === 'not implemented') return { ready: false };
    throw e;
  }
}

export interface Sources {
  plan: Upstream<EventPlan | null>;
  roster: Upstream<ReadonlyArray<RosterEntry>>;
  booths: Upstream<ReadonlyArray<Booth>>;
}

export async function sourcesOf(ctx: RequestContext, eventId: EventId): Promise<Sources> {
  const [plan, roster, booths] = await Promise.all([
    guarded(() => readEventPlan(ctx, eventId)),
    guarded(() => readRoster(ctx, eventId)),
    guarded(() => readBooths(ctx, eventId)),
  ]);
  return { plan, roster, booths };
}

/** The Vietnamese names of the modules whose data is not available yet, in report order. */
export function missingSources(s: Sources): ReadonlyArray<string> {
  return [
    s.plan.ready ? null : 'Tiến độ sự kiện',
    s.roster.ready ? null : 'Khách mời',
    s.booths.ready ? null : 'Gian hàng',
  ].filter((x): x is string => x !== null);
}

export const notReadyMessage = (missing: ReadonlyArray<string>) =>
  `Chức năng phát hành báo cáo chưa sẵn sàng: chưa đọc được số liệu ${missing.join(', ')}. Vui lòng thử lại sau.`;

/** For the issue command: every source, or a "chưa sẵn sàng" refusal before anything is written. */
export async function requireSources(ctx: RequestContext, eventId: EventId): Promise<{ plan: EventPlan; roster: ReadonlyArray<RosterEntry>; booths: ReadonlyArray<Booth> }> {
  const s = await sourcesOf(ctx, eventId);
  if (!s.plan.ready || !s.roster.ready || !s.booths.ready) throw new CommandError('conflict', notReadyMessage(missingSources(s)));
  if (s.plan.value === null) throw new CommandError('not_found', 'Không tìm thấy sự kiện.');
  return { plan: s.plan.value, roster: s.roster.value, booths: s.booths.value };
}
