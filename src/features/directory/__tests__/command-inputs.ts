// One valid input for every directory command, to run each verb through the same checks.

import { newId, type ContactId, type EventId } from '@/core/brand';
import type { CommandId, InputOf } from '@/core/commands';
import type { MasterContact } from '../contract';
import { RESET_PHRASE } from '../domain/schemas';
import { draft } from './harness';

export const inputs = (eventId: EventId, contact: MasterContact) =>
  ({
    search: { q: 'nguyen' },
    create: { id: newId<'MasterContact'>() as ContactId, draft: draft({ name: 'X', organization: 'Khác' }) },
    update: { id: contact.id, version: contact.version, patch: { notes: 'x' } },
    delete: { id: contact.id, version: contact.version },
    deleteMany: { items: [{ id: contact.id, version: contact.version }] },
    restore: { contacts: [{ id: newId<'MasterContact'>() as ContactId, draft: draft({ name: 'Y', organization: 'Khác' }) }] },
    importCsv: { items: [{ id: newId<'MasterContact'>() as ContactId, draft: draft({ name: 'Z', organization: 'Khác' }) }] },
    loadSample: {},
    resetAll: { phrase: RESET_PHRASE },
    eventMatches: { eventId },
    importToEvent: { eventId, ids: [contact.id], onExisting: 'skip' },
  }) satisfies { [K in CommandId as K extends `directory.${infer V}` ? V : never]: InputOf<K> };

/** The verbs only directory.admin may run: everything that changes the shared list. */
export const ADMIN_VERBS = ['create', 'update', 'delete', 'deleteMany', 'restore', 'importCsv', 'loadSample', 'resetAll'] as const;
export const READ_VERBS = ['search'] as const;
export const EVENT_VERBS = ['eventMatches', 'importToEvent'] as const;
