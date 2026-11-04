// Stand-in for feature `guests` while it is being built: the tests insert guest
// rows straight into sce_tcsk_guests, and this readRoster reads them back the
// way the roster view will. `rosterReady(false)` restores the real stub's
// 'not implemented' so the "chưa sẵn sàng" path is tested too.

import { z } from 'zod';
import type { RequestContext } from '@/core/auth';
import type { EventId, GuestId, Instant, SeatCode, UserId, Version } from '@/core/brand';
import { defineTable, type EventScopedRow } from '@/core/db';
import type { GuestGroup, RsvpStatus } from '@/core/vocab';
import type { RosterEntry } from '@/features/guests';

export interface GuestFixtureRow extends EventScopedRow {
  id: GuestId;
  name: string;
  group: GuestGroup;
  organization: string;
  rsvpStatus: RsvpStatus;
  checkinCode: string;
}
export const guestFixtureTable = defineTable<GuestFixtureRow>({
  name: 'sce_tcsk_guests',
  owner: 'guests',
  eventScoped: true,
  columns: { group: 'guest_group' },
  orderBy: [{ column: 'name', ascending: true }],
  row: z.object({
    version: z.number().transform((v) => v as Version),
    createdAt: z.string().transform((v) => v as Instant),
    createdBy: z.string().nullable().transform((v) => v as UserId | null),
    updatedAt: z.string().transform((v) => v as Instant),
    updatedBy: z.string().nullable().transform((v) => v as UserId | null),
    id: z.string().transform((v) => v as GuestId),
    eventId: z.string().transform((v) => v as EventId),
    name: z.string(),
    group: z.enum(['VIP', 'SoNganh', 'DoanhNghiep', 'QuocTe', 'BaoChi']),
    organization: z.string(),
    rsvpStatus: z.enum(['pending', 'confirmed', 'substituted', 'declined']),
    checkinCode: z.string(),
  }),
});

let ready = true;
export const rosterReady = (value: boolean) => {
  ready = value;
};

export async function readRoster(ctx: RequestContext, eventId: EventId): Promise<ReadonlyArray<RosterEntry>> {
  if (!ready) throw new Error('not implemented');
  const rows = await ctx.db.table(guestFixtureTable).list({ eventId });
  return rows.map((g) => ({ ...g, seatCode: null as SeatCode | null, checkedInAt: null, giftGivenAt: null }) as unknown as RosterEntry);
}
