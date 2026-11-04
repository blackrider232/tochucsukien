// Contact -> guest, the two ways a master contact reaches an event: the batch
// copy (a whole guest draft) and the guest form's suggest (the fields it fills).

import type { ContactId } from '@/core/brand';
import { guestIdentityKey, type GuestDraft } from '@/features/guests';
import type { MasterContact } from '../contract';

/**
 * What a copied contact becomes in an event. It has not been invited and has not answered (m4c B25), and the send method
 * follows the group: a VIP is handed the invitation, the rest get it by mail when they have an address (B32).
 */
export function contactToGuestDraft(c: MasterContact): GuestDraft {
  return {
    name: c.name,
    group: c.group,
    title: c.title,
    organization: c.organization,
    phone: c.phone,
    email: c.email,
    sendMethod: c.group === 'VIP' || !c.email ? 'direct' : 'email',
    inviteStatus: 'pending',
    rsvpStatus: 'pending',
    rsvpSource: 'import',
    substituteName: '',
    hasBanquet: c.hasBanquet,
    notes: c.notes,
    masterContactId: c.id,
  };
}

/**
 * The guest form fields a picked suggestion fills (m4c §1.3): name, group, title, organization, phone, email and the
 * banquet flag; notes only when the contact has some, so a note typed in the form is not wiped. The master link is
 * kept on the guest (B27), which the legacy form never did. Address and tax code are not guest fields.
 */
export function guestFieldsFromContact(c: MasterContact): Pick<GuestDraft, 'name' | 'group' | 'title' | 'organization' | 'phone' | 'email' | 'hasBanquet' | 'masterContactId'> & Partial<Pick<GuestDraft, 'notes'>> {
  return {
    name: c.name,
    group: c.group,
    title: c.title,
    organization: c.organization,
    phone: c.phone,
    email: c.email,
    hasBanquet: c.hasBanquet,
    masterContactId: c.id,
    ...(c.notes ? { notes: c.notes } : {}),
  };
}

export interface EventImportPlan {
  /** In selection order, one per distinct person: what upsertMany will be asked for. */
  items: { contact: MasterContact; draft: GuestDraft }[];
  /** Selected contacts the event has no guest for. */
  fresh: MasterContact[];
  /** Selected contacts that are already a guest of the event (same identity key). */
  existing: MasterContact[];
  /** Selected contacts that are the same person as an earlier one of the selection. */
  repeated: MasterContact[];
}

/**
 * What a copy into an event will do, by the rule guests.upsertMany applies: two records are the same person exactly when
 * their guestIdentityKey is equal. `existingIds` are the selected contacts the event already has a guest for
 * (existingContactIds), found once by the caller.
 */
export function planEventImport(selection: ReadonlyArray<MasterContact>, existingIds: ReadonlySet<ContactId>): EventImportPlan {
  const plan: EventImportPlan = { items: [], fresh: [], existing: [], repeated: [] };
  const seen = new Set<string>();
  for (const contact of selection) {
    const draft = contactToGuestDraft(contact);
    const key = guestIdentityKey(draft);
    if (seen.has(key)) {
      plan.repeated.push(contact);
      continue;
    }
    seen.add(key);
    plan.items.push({ contact, draft });
    (existingIds.has(contact.id) ? plan.existing : plan.fresh).push(contact);
  }
  return plan;
}

/** The contacts that are already a guest of the event: one fold per guest and per contact, then set lookups. */
export function existingContactIds(contacts: ReadonlyArray<MasterContact>, guests: ReadonlyArray<Pick<GuestDraft, 'name' | 'organization' | 'email' | 'phone'>>): Set<ContactId> {
  const rosterKeys = new Set(guests.map(guestIdentityKey));
  return new Set(contacts.filter((c) => rosterKeys.has(guestIdentityKey(c))).map((c) => c.id));
}
