// Contract of feature `live` (M5). Check-ins are per-guest facts in their own
// table (unique event+guest) so several desks write independently; the guest
// row is never touched by a check-in (m5 BUG-05, separate-before-serializing).

import type { DutyStaffId, EventId, GuestId, IncidentId, Instant, UserId, Version } from '../core/brand';
import type { RequestContext } from '../core/auth';
import type { ScannedCode } from '../core/checkin-code';
import type { SystemSettings } from '../core/settings';
import type { DepartmentName } from '../core/vocab';
import type { Sig } from '../core/commands';
import type { RosterEntry } from './guests';
import type { SceEvent } from './progress';

export interface CheckIn {
  eventId: EventId;
  guestId: GuestId;
  /** null = gift recorded before arrival (legacy allowed it). */
  checkedInAt: Instant | null;
  checkedInBy: UserId | null;
  desk: string | null;
  giftGivenAt: Instant | null;
}

export type ScanOutcome =
  | { kind: 'ok'; guest: RosterEntry }
  | { kind: 'already'; guest: RosterEntry; at: Instant }
  | { kind: 'other_event'; eventName: string | null }
  | { kind: 'not_found' }
  | { kind: 'ambiguous'; candidates: ReadonlyArray<RosterEntry> };
/** Pure match of a parsed code against the roster; legacy ids resolved via legacyIds map. */
export function matchScan(code: ScannedCode, eventId: EventId, roster: ReadonlyArray<RosterEntry>, legacyIds: ReadonlyMap<string, GuestId>): ScanOutcome {
  throw new Error('not implemented');
}

export type DutyDesk = 1 | 2 | 3 | 4;
export interface DutyStaff {
  id: DutyStaffId;
  eventId: EventId;
  name: string;
  userId: UserId | null;
  department: DepartmentName;
  desk: DutyDesk;
  roleLabel: string;
  checkedInAt: Instant | null;
  version: Version;
}
/** combineVN(eventDate, eventTime) - fieldPresenceHours (m5 §3.3). */
export function dutyRequiredAt(event: SceEvent, s: SystemSettings): Instant {
  throw new Error('not implemented');
}
export function dutyStatus(staff: DutyStaff, requiredAt: Instant): { kind: 'pending' } | { kind: 'on_time' } | { kind: 'late'; minutes: number } {
  throw new Error('not implemented');
}

export type IncidentUrgency = 'high' | 'medium' | 'low';
export type IncidentStatus = 'open' | 'in_progress' | 'resolved';
export interface Incident {
  id: IncidentId;
  eventId: EventId;
  /** Per-event sequence assigned by the DB; code = 'SC-' + pad2(seq). */
  seq: number;
  location: string;
  description: string;
  urgency: IncidentUrgency;
  assignee: string;
  status: IncidentStatus;
  reportedAt: Instant;
  resolvedAt: Instant | null;
  resolutionNote: string;
  version: Version;
}

export function readCheckIns(ctx: RequestContext, eventId: EventId): Promise<ReadonlyArray<CheckIn>> {
  throw new Error('not implemented');
}

declare module '../core/commands' {
  interface CommandMap {
    /** Idempotent set: checking in twice keeps the first time and reports 'already'. */
    'live.checkIn': Sig<{ eventId: EventId; guestId: GuestId; desk: string | null }, { already: boolean; checkIn: CheckIn }>;
    'live.cancelCheckIn': Sig<{ eventId: EventId; guestId: GuestId }, null>;
  }
}
declare module '../core/permissions' {
  interface PermissionMap {
    'live.read': true;
    'live.checkin': true;
    'live.manage': true;
  }
}
