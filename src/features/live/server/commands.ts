// Every write of the live feature, and the scan lookup. Each mutation audits
// and, where a person can take it back, returns the inverse its undo runs; an
// inverse is re-checked like any other command (its payload comes back from
// the client).

import type { DutyStaffId, EventId, GuestId, IncidentId, Instant, Version } from '@/core/brand';
import { defineCommands, type CommandsOf, type Sig } from '@/core/commands';
import type { RsvpStatus } from '@/core/vocab';
import type { CheckIn, DutyStaff, Incident, IncidentStatus, ScanOutcome } from '../contract';
import type { DutyDraft, IncidentDraft, UndoTokenId } from '../domain/schemas';
import { checkInSubstitute, undoSubstitute, undoWalkIn, walkIn, type SubstituteInput, type WalkInInput, type WalkInResult } from './arrival-commands';
import { cancelCheckIn, checkIn, checkInDeclined, restoreCheckIn, scan, setGift, undoCheckIn } from './checkin-commands';
import { createDuty, deleteDuty, setDutyPresence, updateDuty } from './duty-commands';
import { createIncident, deleteIncident, setIncidentStatus, updateIncident } from './incident-commands';

declare module '@/core/commands' {
  interface CommandMap {
    'live.checkInDeclined': Sig<{ eventId: EventId; guestId: GuestId; desk: string | null }, { already: boolean; checkIn: CheckIn }>;
    'live.undoCheckIn': Sig<{ eventId: EventId; guestId: GuestId; checkedInAt: Instant }, null>;
    'live.restoreCheckIn': Sig<{ eventId: EventId; guestId: GuestId; tokenId: UndoTokenId }, CheckIn>;
    'live.setGift': Sig<{ eventId: EventId; guestId: GuestId; given: boolean }, CheckIn | null>;
    'live.scan': Sig<{ eventId: EventId; raw: string }, ScanOutcome>;
    'live.walkIn': Sig<WalkInInput, WalkInResult>;
    'live.undoWalkIn': Sig<{ eventId: EventId; guestId: GuestId; checkedInAt: Instant; guestVersion: Version }, null>;
    'live.checkInSubstitute': Sig<SubstituteInput, { checkIn: CheckIn }>;
    'live.undoSubstitute': Sig<{ eventId: EventId; guestId: GuestId; checkedInAt: Instant; guestVersion: Version; rsvpStatus: RsvpStatus; substituteName: string }, null>;
    'live.createDuty': Sig<{ eventId: EventId; id: DutyStaffId; draft: DutyDraft }, DutyStaff>;
    'live.updateDuty': Sig<{ eventId: EventId; id: DutyStaffId; version: Version; draft: DutyDraft }, DutyStaff>;
    'live.deleteDuty': Sig<{ eventId: EventId; id: DutyStaffId; version: Version }, null>;
    'live.setDutyPresence': Sig<{ eventId: EventId; id: DutyStaffId; version: Version; present: boolean }, DutyStaff>;
    'live.createIncident': Sig<{ eventId: EventId; id: IncidentId; draft: IncidentDraft }, Incident>;
    'live.updateIncident': Sig<{ eventId: EventId; id: IncidentId; version: Version; draft: IncidentDraft }, Incident>;
    'live.setIncidentStatus': Sig<{ eventId: EventId; id: IncidentId; version: Version; status: IncidentStatus; note: string }, Incident>;
    'live.deleteIncident': Sig<{ eventId: EventId; id: IncidentId; version: Version }, null>;
  }
}

export const commands: CommandsOf<'live'> = defineCommands('live', {
  checkIn, checkInDeclined, cancelCheckIn, undoCheckIn, restoreCheckIn, setGift, scan,
  walkIn, undoWalkIn, checkInSubstitute, undoSubstitute,
  createDuty, updateDuty, deleteDuty, setDutyPresence,
  createIncident, updateIncident, setIncidentStatus, deleteIncident,
});
