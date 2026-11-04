// The one place venue reads the guest roster (feature `guests`). Until guests
// lands, readRoster throws 'not implemented'; that error, and only that one,
// becomes an explicit "not ready" state, never an empty list.

import type { RequestContext } from '@/core/auth';
import type { EventId } from '@/core/brand';
import { CommandError } from '@/core/commands';
import { readRoster, type RosterEntry } from '@/features/guests/server';
import type { Upstream } from '../components/screen-types';

export type { Upstream };

export const ROSTER_NOT_READY = 'Danh sách khách mời chưa sẵn sàng, nên chưa xếp chỗ được. Vui lòng thử lại sau khi phân hệ Khách mời hoạt động.';

export async function rosterOf(ctx: RequestContext, eventId: EventId): Promise<Upstream<ReadonlyArray<RosterEntry>>> {
  try {
    return { ready: true, value: await readRoster(ctx, eventId) };
  } catch (e) {
    if (e instanceof Error && e.message === 'not implemented') return { ready: false };
    throw e;
  }
}

/** For commands that need the guests: refuse with "chưa sẵn sàng" instead of acting on nothing. */
export async function requireRoster(ctx: RequestContext, eventId: EventId): Promise<ReadonlyArray<RosterEntry>> {
  const roster = await rosterOf(ctx, eventId);
  if (!roster.ready) throw new CommandError('conflict', ROSTER_NOT_READY);
  return roster.value;
}
