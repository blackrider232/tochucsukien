// The five tables venue owns, described once (0002_domain_tables.sql).

import { z } from 'zod';
import type { BoothId, BoothShiftId, EventId, GuestId, HallTemplateId, Instant, IsoDate, SeatCode, UserId, Version } from '@/core/brand';
import { defineTable, type BaseRow } from '@/core/db';
import { isDepartmentName, type DepartmentName } from '@/core/vocab';
import type { Booth, BoothShift, EventHall, HallTemplate, SeatAssignment } from '../contract';
import { BOOTH_STATUS_VALUES, SUBSIDY_VALUES } from '../domain/booths';
import { zonesSchema } from '../domain/schemas';

const managed = {
  version: z.number().transform((v) => v as Version),
  createdAt: z.string().transform((v) => v as Instant),
  createdBy: z.string().nullable().transform((v) => v as UserId | null),
  updatedAt: z.string().transform((v) => v as Instant),
  updatedBy: z.string().nullable().transform((v) => v as UserId | null),
};
const eventId = z.string().transform((v) => v as EventId);

export type HallTemplateRow = HallTemplate & BaseRow & { legacyId: string | null };
export const hallTemplatesTable = defineTable<HallTemplateRow>({
  name: 'sce_tcsk_hall_templates',
  owner: 'venue',
  eventScoped: false,
  orderBy: [{ column: 'createdAt', ascending: true }],
  row: z.object({
    ...managed,
    id: z.string().transform((v) => v as HallTemplateId),
    legacyId: z.string().nullable(),
    name: z.string(),
    location: z.string(),
    description: z.string(),
    zones: zonesSchema,
  }),
});

export type EventHallRow = EventHall & BaseRow & { id: string };
export const eventHallsTable = defineTable<EventHallRow>({
  name: 'sce_tcsk_event_halls',
  owner: 'venue',
  eventScoped: true,
  row: z.object({
    ...managed,
    id: z.string(),
    eventId,
    templateId: z.string().nullable().transform((v) => v as HallTemplateId | null),
    zones: zonesSchema,
  }),
});

export type SeatRow = SeatAssignment & BaseRow & { id: string };
export const seatsTable = defineTable<SeatRow>({
  name: 'sce_tcsk_seat_assignments',
  owner: 'venue',
  eventScoped: true,
  orderBy: [{ column: 'seatCode', ascending: true }],
  row: z.object({
    ...managed,
    id: z.string(),
    eventId,
    seatCode: z.string().transform((v) => v as SeatCode),
    guestId: z.string().transform((v) => v as GuestId),
  }),
});

export type BoothRow = Booth & BaseRow;
export const boothsTable = defineTable<BoothRow>({
  name: 'sce_tcsk_booths',
  owner: 'venue',
  eventScoped: true,
  orderBy: [{ column: 'code', ascending: true }],
  row: z.object({
    ...managed,
    id: z.string().transform((v) => v as BoothId),
    eventId,
    code: z.string(),
    size: z.string(),
    company: z.string(),
    products: z.string(),
    subsidyPercent: z.literal(SUBSIDY_VALUES),
    status: z.enum(BOOTH_STATUS_VALUES),
    contact: z.string(),
    staff: z.string(),
  }),
});

export type BoothShiftRow = BoothShift & BaseRow;
export const boothShiftsTable = defineTable<BoothShiftRow>({
  name: 'sce_tcsk_booth_shifts',
  owner: 'venue',
  eventScoped: true,
  orderBy: [{ column: 'shiftDate', ascending: true }],
  row: z.object({
    ...managed,
    id: z.string().transform((v) => v as BoothShiftId),
    eventId,
    shiftDate: z.string().transform((v) => v as IsoDate),
    shiftLabel: z.string(),
    officerName: z.string(),
    officerUserId: z.string().nullable().transform((v) => v as UserId | null),
    department: z.string().refine(isDepartmentName).transform((v) => v as DepartmentName),
    phone: z.string(),
    zone: z.string(),
  }),
});
