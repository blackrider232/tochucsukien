// Response -> guest. The keys are guests' one identity rule, guestIdentityKey,
// asked for each tier on its own (email, phone, name + organisation), so a
// response that brings an email the guest lacks still meets the guest by
// phone. The index is built once per sync: lookups are map hits (linear in
// guests plus responses). Two candidates, or a name without the organisation,
// is 'ambiguous' for a person to settle, never a guess (m4a B19, m4c B24).

import type { Email, GuestId } from '@/core/brand';
import { foldVi } from '@/core/text';
import { guestIdentityKey } from '@/features/guests';

export interface MatchTarget {
  id: GuestId;
  name: string;
  organization: string;
  email: Email | null;
  phone: string;
}
export type MatchResult =
  | { kind: 'email' | 'phone' | 'name'; guestId: GuestId }
  | { kind: 'ambiguous'; candidates: ReadonlyArray<GuestId> }
  | { kind: 'none' };

export interface MatchIndex {
  email: ReadonlyMap<string, ReadonlyArray<GuestId>>;
  phone: ReadonlyMap<string, ReadonlyArray<GuestId>>;
  nameOrg: ReadonlyMap<string, ReadonlyArray<GuestId>>;
  name: ReadonlyMap<string, ReadonlyArray<GuestId>>;
}

const emailKey = (email: Email | null) => (email ? guestIdentityKey({ email, phone: '', name: '', organization: '' }) : null);
const phoneKey = (phone: string) => {
  const key = guestIdentityKey({ email: null, phone, name: '', organization: '' });
  return key.startsWith('phone:') ? key : null;
};
const nameOrgKey = (name: string, organization: string) => (foldVi(name) ? guestIdentityKey({ email: null, phone: '', name, organization }) : null);
const nameKey = (name: string) => foldVi(name) || null;

function push(map: Map<string, GuestId[]>, key: string | null, id: GuestId) {
  if (!key) return;
  const list = map.get(key);
  if (list) list.push(id);
  else map.set(key, [id]);
}

export function buildMatchIndex(guests: ReadonlyArray<MatchTarget>): MatchIndex {
  const email = new Map<string, GuestId[]>();
  const phone = new Map<string, GuestId[]>();
  const nameOrg = new Map<string, GuestId[]>();
  const name = new Map<string, GuestId[]>();
  for (const g of guests) {
    push(email, emailKey(g.email), g.id);
    push(phone, phoneKey(g.phone), g.id);
    push(nameOrg, nameOrgKey(g.name, g.organization), g.id);
    push(name, nameKey(g.name), g.id);
  }
  return { email, phone, nameOrg, name };
}

export function matchResponse(index: MatchIndex, r: Pick<MatchTarget, 'name' | 'organization' | 'email' | 'phone'>): MatchResult {
  const tiers = [
    ['email', index.email.get(emailKey(r.email) ?? '')],
    ['phone', index.phone.get(phoneKey(r.phone) ?? '')],
    ['name', index.nameOrg.get(nameOrgKey(r.name, r.organization) ?? '')],
  ] as const;
  for (const [kind, ids] of tiers) {
    if (!ids || ids.length === 0) continue;
    return ids.length === 1 ? { kind, guestId: ids[0]! } : { kind: 'ambiguous', candidates: ids };
  }
  // The same name at another organisation, or a namesake: a person decides.
  const namesakes = index.name.get(nameKey(r.name) ?? '');
  return namesakes && namesakes.length > 0 ? { kind: 'ambiguous', candidates: namesakes } : { kind: 'none' };
}
