// The one contact search (m4c B58, B59): the admin list, the live suggest, the
// picker and the batch import all rank through rankContacts. Text is folded
// once per contact (searchTextOf, kept in the search_text column), never per
// keystroke (B50).

import { foldVi, normalizePhone } from '@/core/text';
import type { GuestGroup } from '@/core/vocab';
import type { MasterContact } from '../contract';

/** The fields a search looks at, folded and joined: name, title, organization, phone (as typed and digits only), email. */
export function searchTextOf(c: Pick<MasterContact, 'name' | 'title' | 'organization' | 'phone' | 'email'>): string {
  const typed = foldVi(c.phone);
  const digits = normalizePhone(c.phone);
  const phone = typed === digits ? typed : `${typed} ${digits}`.trim();
  return [foldVi(c.name), foldVi(c.title), foldVi(c.organization), phone, c.email ? foldVi(c.email) : ''].filter(Boolean).join(' ');
}

/** A contact with the folded forms the ranking reads, computed once. */
export interface IndexedContact<C extends SearchableContact = MasterContact> {
  contact: C;
  searchText: string;
  nameFolded: string;
  /** name + title + organization, folded: where a rank-3 match must land. */
  headline: string;
}
export type SearchableContact = Pick<MasterContact, 'id' | 'name' | 'group' | 'title' | 'organization'>;

export function indexContact<C extends SearchableContact>(contact: C, searchText: string): IndexedContact<C> {
  const nameFolded = foldVi(contact.name);
  return { contact, searchText, nameFolded, headline: `${nameFolded} ${foldVi(contact.title)} ${foldVi(contact.organization)}` };
}

/** Folds every contact once. For rows that do not carry a stored search_text. */
export function buildIndex<C extends SearchableContact & Pick<MasterContact, 'phone' | 'email'>>(contacts: ReadonlyArray<C>): IndexedContact<C>[] {
  return contacts.map((c) => indexContact(c, searchTextOf(c)));
}

export interface SearchOptions {
  group?: GuestGroup | 'all';
  limit?: number;
  offset?: number;
}
export interface SearchResult<C extends SearchableContact> {
  items: C[];
  /** Every contact that matched, before limit and offset. */
  total: number;
}

const tokensOf = (q: string) => foldVi(q).split(' ').filter(Boolean);

/**
 * Rank of a match, lower is better (m4c §3.2): 0 the name starts with the query, 1 every token starts a word of the
 * name, 2 the name contains every token, 3 name, title and organization together do, 4 only phone or email did.
 */
export function matchRank<C extends SearchableContact>(ix: IndexedContact<C>, tokens: ReadonlyArray<string>): number {
  if (tokens.length === 0) return 0;
  const name = ix.nameFolded;
  if (name.startsWith(tokens.join(' '))) return 0;
  const words = name.split(' ');
  if (tokens.every((t) => words.some((w) => w.startsWith(t)))) return 1;
  if (tokens.every((t) => name.includes(t))) return 2;
  if (tokens.every((t) => ix.headline.includes(t))) return 3;
  return 4;
}

/**
 * Tone-insensitive, every token must match. Ranked by matchRank, then VIP first, then name, then id, so the order is
 * the same on every call. An empty query lists everything in that same VIP-then-alphabetical order.
 */
export function rankContacts<C extends SearchableContact>(index: ReadonlyArray<IndexedContact<C>>, q: string, opts: SearchOptions = {}): SearchResult<C> {
  const tokens = tokensOf(q);
  const group = opts.group && opts.group !== 'all' ? opts.group : null;
  const hits: { ix: IndexedContact<C>; rank: number }[] = [];
  for (const ix of index) {
    if (group && ix.contact.group !== group) continue;
    if (!tokens.every((t) => ix.searchText.includes(t))) continue;
    hits.push({ ix, rank: matchRank(ix, tokens) });
  }
  hits.sort(
    (a, b) =>
      a.rank - b.rank ||
      Number(a.ix.contact.group !== 'VIP') - Number(b.ix.contact.group !== 'VIP') ||
      (a.ix.nameFolded < b.ix.nameFolded ? -1 : a.ix.nameFolded > b.ix.nameFolded ? 1 : 0) ||
      (a.ix.contact.id < b.ix.contact.id ? -1 : a.ix.contact.id > b.ix.contact.id ? 1 : 0),
  );
  const offset = Math.max(0, opts.offset ?? 0);
  const end = opts.limit === undefined ? undefined : offset + Math.max(0, opts.limit);
  return { items: hits.slice(offset, end).map((h) => h.ix.contact), total: hits.length };
}

/** Contacts per group over the whole index, for the filter labels. */
export function groupCounts(contacts: ReadonlyArray<Pick<MasterContact, 'group'>>): Record<GuestGroup | 'all', number> {
  const counts: Record<GuestGroup | 'all', number> = { all: contacts.length, VIP: 0, SoNganh: 0, DoanhNghiep: 0, QuocTe: 0, BaoChi: 0 };
  for (const c of contacts) counts[c.group] += 1;
  return counts;
}
