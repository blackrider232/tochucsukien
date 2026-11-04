// Table definitions for core tests, shaped like the real migrations.

import { z } from 'zod';
import type { EventId, GuestId, Instant, UserId, Version } from '@/core/brand';
import { defineTable, type BaseRow, type EventScopedRow } from '@/core/db';

const base = {
  version: z.number().transform((v) => v as Version),
  createdAt: z.string().transform((v) => v as Instant),
  createdBy: z.string().nullable().transform((v) => v as UserId | null),
  updatedAt: z.string().transform((v) => v as Instant),
  updatedBy: z.string().nullable().transform((v) => v as UserId | null),
};

export interface TestGuest extends EventScopedRow {
  id: GuestId;
  name: string;
  group: 'VIP' | 'SoNganh' | 'DoanhNghiep' | 'QuocTe' | 'BaoChi';
  organization: string;
  rsvpStatus: string;
  checkinCode: string;
}
export const guestsTable = defineTable<TestGuest>({
  name: 'sce_tcsk_guests',
  owner: 'guests',
  eventScoped: true,
  columns: { group: 'guest_group' },
  orderBy: [{ column: 'name', ascending: true }],
  row: z.object({
    ...base,
    id: z.string().transform((v) => v as GuestId),
    eventId: z.string().transform((v) => v as EventId),
    name: z.string(),
    group: z.enum(['VIP', 'SoNganh', 'DoanhNghiep', 'QuocTe', 'BaoChi']),
    organization: z.string(),
    rsvpStatus: z.string(),
    checkinCode: z.string(),
  }),
});

export interface TestCheckin extends EventScopedRow {
  guestId: GuestId;
  desk: string | null;
  checkedInAt: Instant | null;
}
export const checkinsTable = defineTable<TestCheckin>({
  name: 'sce_tcsk_checkins',
  owner: 'live',
  eventScoped: true,
  row: z.object({
    ...base,
    id: z.string(),
    eventId: z.string().transform((v) => v as EventId),
    guestId: z.string().transform((v) => v as GuestId),
    desk: z.string().nullable(),
    checkedInAt: z.string().nullable().transform((v) => v as Instant | null),
  }),
});

export interface TestContact extends BaseRow {
  name: string;
  group: string;
  organization: string;
}
export const contactsTable = defineTable<TestContact>({
  name: 'sce_tcsk_master_contacts',
  owner: 'directory',
  eventScoped: false,
  columns: { group: 'guest_group' },
  row: z.object({ ...base, id: z.string(), name: z.string(), group: z.string(), organization: z.string() }),
});

export interface TestEvent extends BaseRow {
  id: EventId;
  name: string;
  department: string;
  supportingDepartments: string[];
  deletedAt: string | null;
}
export const eventsTable = defineTable<TestEvent>({
  name: 'sce_tcsk_events',
  owner: 'progress',
  eventScoped: false,
  row: z.object({
    ...base,
    id: z.string().transform((v) => v as EventId),
    name: z.string(),
    department: z.string(),
    supportingDepartments: z.array(z.string()),
    deletedAt: z.string().nullable(),
  }),
});

export const E1 = '11111111-1111-4111-8111-111111111111' as EventId;
export const E2 = '22222222-2222-4222-8222-222222222222' as EventId;
export const E3 = '33333333-3333-4333-8333-333333333333' as EventId;

/** E1 led by XTĐT, E2 led by PTDN, E3 led by PTDN with XTĐT supporting. */
export function eventRows() {
  const ev = (id: EventId, name: string, department: string, supporting: string[] = []) => ({
    id, name, type: 'hoi_nghi', event_date: '2026-12-15', event_time: '08:30', location: '', department,
    supporting_departments: supporting, lead_person: '', budget_vnd: null, target_guests: 150, status: 'preparing', note: '',
    deleted_at: null, version: 1, created_at: '2026-11-01T00:00:00.000Z', created_by: null, updated_at: '2026-11-01T00:00:00.000Z', updated_by: null,
  });
  return [
    ev(E1, 'HN XTĐT', 'Phòng Xúc tiến đầu tư'),
    ev(E2, 'HC PTDN', 'Phòng Phát triển doanh nghiệp'),
    ev(E3, 'HN chung', 'Phòng Phát triển doanh nghiệp', ['Phòng Xúc tiến đầu tư']),
  ];
}
