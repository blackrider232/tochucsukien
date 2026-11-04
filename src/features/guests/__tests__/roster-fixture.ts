// Roster rows for the pure tests: the defaults of a fresh guest plus what each test sets.

import type { Email, EventId, GuestId, Instant, SeatCode, Version } from '@/core/brand';
import type { CheckinCode } from '@/core/checkin-code';
import type { RosterEntry } from '../contract';
import { NEW_GUEST_DEFAULTS } from '../domain/schemas';

export const EVENT = 'e0000000-0000-4000-8000-000000000001' as EventId;
const at = '2026-11-01T00:00:00.000Z' as Instant;
let n = 0;

export function entry(overrides: Partial<Omit<RosterEntry, 'email' | 'seatCode'>> & { email?: string | null; seatCode?: string | null } = {}): RosterEntry {
  n += 1;
  const { email = null, seatCode = null, ...rest } = overrides;
  return {
    ...NEW_GUEST_DEFAULTS,
    name: `Đại biểu ${n}`,
    organization: 'Cơ quan',
    id: `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}` as GuestId,
    eventId: EVENT,
    checkinCode: `K${String(n).padStart(5, '0')}` as CheckinCode,
    rsvpAt: null,
    version: 1 as Version,
    createdAt: at,
    createdBy: null,
    updatedAt: at,
    checkedInAt: null,
    giftGivenAt: null,
    ...rest,
    email: email as Email | null,
    seatCode: seatCode as SeatCode | null,
  };
}
