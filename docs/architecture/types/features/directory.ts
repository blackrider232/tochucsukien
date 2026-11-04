// Contract of feature `directory` (M4c): the shared master contact directory.
// Copying a contact into an event goes through guests.upsertMany (ask the owner).

import type { ContactId, Email, Instant, Version } from '../core/brand';
import type { GuestGroup } from '../core/vocab';
import type { Sig } from '../core/commands';

export interface MasterContact {
  id: ContactId;
  name: string;
  group: GuestGroup;
  title: string;
  organization: string;
  phone: string;
  email: Email | null;
  address: string;
  taxCode: string;
  notes: string;
  hasBanquet: boolean;
  updatedAt: Instant;
  version: Version;
}

declare module '../core/commands' {
  interface CommandMap {
    /** Client query for the guest form combobox and the picker. Tone-insensitive, ranked. */
    'directory.search': Sig<{ q: string; group?: GuestGroup; limit?: number }, ReadonlyArray<MasterContact>>;
  }
}
declare module '../core/permissions' {
  interface PermissionMap {
    'directory.read': true;
    'directory.admin': true;
  }
}
