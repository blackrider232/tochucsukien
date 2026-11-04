// Server reads. RLS decides what the actor sees (directory.read, everyone); the
// search runs here over the stored search_text, folded once at write time.

import type { RequestContext } from '@/core/auth';
import type { ContactId } from '@/core/brand';
import type { GuestGroup } from '@/core/vocab';
import type { MasterContact } from '../contract';
import { indexContact, rankContacts, type SearchResult } from '../domain/search';
import { contactsTable, type ContactRow } from './tables';

/** The contract's MasterContact: the importer's key and the folded search text stay on the server. */
export function toContact(row: ContactRow): MasterContact {
  const { id, name, group, title, organization, phone, email, address, taxCode, notes, hasBanquet, updatedAt, version } = row;
  return { id, name, group, title, organization, phone, email, address, taxCode, notes, hasBanquet, updatedAt, version };
}

/** Ids per request URL; PostgREST has a request-line limit, so a long list is read in slices. */
const ID_SLICE = 100;

export async function contactsByIds(ctx: RequestContext, ids: ReadonlyArray<ContactId>): Promise<ContactRow[]> {
  const rows: ContactRow[] = [];
  for (let i = 0; i < ids.length; i += ID_SLICE) rows.push(...(await ctx.db.table(contactsTable).list({ id: ids.slice(i, i + ID_SLICE) })));
  return rows;
}

/** Every contact, in creation order, for the admin screen, the export and the batch copy. */
export async function listContacts(ctx: RequestContext): Promise<ReadonlyArray<MasterContact>> {
  return (await ctx.db.table(contactsTable).list()).map(toContact);
}

export interface ContactQuery {
  q: string;
  group?: GuestGroup;
  limit?: number;
  offset?: number;
}

/** Ranked search (m4c §3.2): the same rankContacts the screens use, over the stored search_text. */
export async function searchContacts(ctx: RequestContext, query: ContactQuery): Promise<SearchResult<MasterContact>> {
  const rows = await ctx.db.table(contactsTable).list();
  const found = rankContacts(
    rows.map((r) => indexContact(r, r.searchText)),
    query.q,
    { group: query.group ?? 'all', ...(query.limit === undefined ? {} : { limit: query.limit }), ...(query.offset === undefined ? {} : { offset: query.offset }) },
  );
  return { items: found.items.map(toContact), total: found.total };
}
