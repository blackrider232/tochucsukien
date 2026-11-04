// One valid input for every guests command, to run each verb through the same checks.

import { newId, type EventId, type Instant } from '@/core/brand';
import type { CheckinCode } from '@/core/checkin-code';
import type { CommandId, InputOf } from '@/core/commands';
import type { Guest } from '../contract';
import { draft } from './harness';

export const inputs = (eventId: EventId, guest: Guest) =>
  ({
    create: { eventId, id: newId<'Guest'>(), draft: draft({ name: 'X' }) },
    update: { eventId, id: guest.id, version: guest.version, patch: { notes: 'x' } },
    undoRsvp: { eventId, id: guest.id, version: guest.version, patch: { rsvpStatus: 'confirmed' }, seatCode: null },
    delete: { eventId, id: guest.id, version: guest.version },
    restore: { eventId, guest: { id: newId<'Guest'>(), draft: draft({ name: 'Y' }), checkinCode: 'ABCDEF' as CheckinCode, rsvpAt: null, seatCode: null } },
    applyRsvp: { eventId, id: guest.id, status: 'declined', source: 'google_form', respondedAt: '2026-11-05T00:00:00.000Z' as Instant },
    upsertMany: { eventId, items: [{ id: newId<'Guest'>(), draft: draft({ name: 'Z', organization: 'Khác' }) }], onExisting: 'fill_blanks' },
    markInvited: { eventId, ids: [guest.id], method: 'email' },
  }) satisfies { [K in CommandId as K extends `guests.${infer V}` ? V : never]: InputOf<K> };
