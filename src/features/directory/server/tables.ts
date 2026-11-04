// The one table directory owns (0002_domain_tables.sql). search_text is folded
// text kept in step with the fields by every write (searchTextOf).

import { z } from 'zod';
import type { ContactId, Email, Instant, UserId, Version } from '@/core/brand';
import { parseInstant } from '@/core/dates';
import { defineTable, type BaseRow } from '@/core/db';
import { parseEmail } from '@/core/text';
import type { MasterContact } from '../contract';
import { GROUP_VALUES } from '../domain/schemas';

const instant = z.string().transform((v) => (parseInstant(v) ?? v) as Instant);

/** `legacyId` is the importer's key (unique); it stays on the server. */
export type ContactRow = MasterContact & BaseRow & { id: ContactId; legacyId: string | null; searchText: string; createdAt: Instant; createdBy: UserId | null; updatedBy: UserId | null };

export const contactsTable = defineTable<ContactRow>({
  name: 'sce_tcsk_master_contacts',
  owner: 'directory',
  eventScoped: false,
  columns: { group: 'guest_group' },
  orderBy: [{ column: 'createdAt', ascending: true }, { column: 'name', ascending: true }],
  row: z.object({
    id: z.string().transform((v) => v as ContactId),
    legacyId: z.string().nullable(),
    name: z.string(),
    group: z.enum(GROUP_VALUES),
    title: z.string(),
    organization: z.string(),
    phone: z.string(),
    email: z.string().nullable().transform((v) => (v === null ? null : ((parseEmail(v) ?? v) as Email))),
    address: z.string(),
    taxCode: z.string(),
    notes: z.string(),
    hasBanquet: z.boolean(),
    searchText: z.string(),
    version: z.number().transform((v) => v as Version),
    createdAt: instant,
    createdBy: z.string().nullable().transform((v) => v as UserId | null),
    updatedAt: instant,
    updatedBy: z.string().nullable().transform((v) => v as UserId | null),
  }),
});
