// Zod schemas shared by the forms (useZodForm) and the commands (input
// parsing), so the browser and the server validate the same rules (m4b BUG-13).

import { z } from 'zod';
import { parseUuid, type BoothId, type BoothShiftId, type EventId, type GuestId, type HallTemplateId, type IsoDate, type SeatCode, type Uuid, type Version } from '@/core/brand';
import { parseIsoDate } from '@/core/dates';
import { DEPARTMENTS, type DepartmentName } from '@/core/vocab';
import type { HallZone } from '../contract';
import { BOOTH_CODE_PATTERN, BOOTH_STATUS_VALUES, DEFAULT_BOOTH_SIZE, SUBSIDY_VALUES } from './booths';
import { MAX_SEATS_PER_ZONE, MAX_ZONES, PREFIX_PATTERN, ZONE_COLOR_VALUES, ZONE_GROUP_VALUES, parseSeatCode } from './halls';

const uuidOf = <E extends string>() =>
  z.string().refine((v) => parseUuid(v) !== null, 'Mã không hợp lệ').transform((v) => parseUuid<E>(v) as Uuid<E>);
export const eventIdSchema = uuidOf<'Event'>() as z.ZodType<EventId, string>;
export const guestIdSchema = uuidOf<'Guest'>() as z.ZodType<GuestId, string>;
export const hallTemplateIdSchema = uuidOf<'HallTemplate'>() as z.ZodType<HallTemplateId, string>;
export const boothIdSchema = uuidOf<'Booth'>() as z.ZodType<BoothId, string>;
export const boothShiftIdSchema = uuidOf<'BoothShift'>() as z.ZodType<BoothShiftId, string>;
export const versionSchema = z.number().int().positive().transform((v) => v as Version);
export const seatCodeSchema = z
  .string()
  .refine((v) => parseSeatCode(v) !== null, 'Mã ghế không hợp lệ')
  .transform((v) => parseSeatCode(v) as SeatCode);

const text = (max: number) => z.string().trim().max(max, `Tối đa ${max} ký tự`);
const required = (max: number, message: string) => z.string({ error: message }).trim().min(1, message).max(max, `Tối đa ${max} ký tự`);

export const zoneSchema = z.object({
  key: z.string().regex(/^[A-Z0-9]{1,4}$/, 'Mã khu không hợp lệ'),
  name: required(160, 'Nhập tên khu'),
  prefix: z
    .string({ error: 'Nhập tiền tố mã ghế' })
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(PREFIX_PATTERN, 'Tiền tố gồm 1-4 chữ in hoa hoặc số, kết thúc bằng "-", ví dụ A-')),
  seatCount: z
    .number({ error: 'Nhập số ghế' })
    .int('Số ghế là số nguyên')
    .min(1, 'Ít nhất 1 ghế')
    .max(MAX_SEATS_PER_ZONE, `Tối đa ${MAX_SEATS_PER_ZONE} ghế mỗi khu`),
  color: z.enum(ZONE_COLOR_VALUES),
  assignedGroup: z.enum(ZONE_GROUP_VALUES),
  vipZone: z.boolean(),
}) satisfies z.ZodType<HallZone, unknown>;

/** At least one zone; prefixes and keys unique within the hall, case-insensitive (m4b BUG-04). */
export const zonesSchema = z
  .array(zoneSchema)
  .min(1, 'Hội trường phải có ít nhất 1 phân khu.')
  .max(MAX_ZONES, `Tối đa ${MAX_ZONES} phân khu`)
  .superRefine((zones, ctx) => {
    const seen = { prefix: new Set<string>(), key: new Set<string>() };
    zones.forEach((zone, i) => {
      if (seen.prefix.has(zone.prefix)) ctx.addIssue({ code: 'custom', path: [i, 'prefix'], message: 'Tiền tố bị trùng với khu khác' });
      if (seen.key.has(zone.key)) ctx.addIssue({ code: 'custom', path: [i, 'key'], message: 'Mã khu bị trùng' });
      seen.prefix.add(zone.prefix);
      seen.key.add(zone.key);
    });
  });

export const hallTemplateDraftSchema = z.object({
  name: required(200, 'Nhập tên hội trường mẫu'),
  location: text(300),
  description: text(2000),
  zones: zonesSchema,
});
export type HallTemplateDraft = z.output<typeof hallTemplateDraftSchema>;

export const ORPHAN_POLICIES = ['remap', 'release'] as const;
export type OrphanPolicy = (typeof ORPHAN_POLICIES)[number];

const departmentNames = DEPARTMENTS.map((d) => d.name) as [DepartmentName, ...DepartmentName[]];

export const boothDraftSchema = z
  .object({
    code: z
      .string({ error: 'Nhập mã gian hàng' })
      .trim()
      .transform((v) => v.toUpperCase())
      .pipe(z.string().min(1, 'Nhập mã gian hàng').regex(BOOTH_CODE_PATTERN, 'Mã gian gồm 1-2 chữ cái và 2-3 chữ số, ví dụ A01')),
    size: text(120).transform((v) => v || DEFAULT_BOOTH_SIZE),
    company: text(300),
    products: text(1000),
    /** A select posts '50'; the command gets 50. */
    subsidyPercent: z.preprocess((v) => (typeof v === 'string' ? Number(v) : v), z.literal(SUBSIDY_VALUES, { error: 'Chọn chính sách hỗ trợ' })),
    status: z.enum(BOOTH_STATUS_VALUES),
    contact: text(300),
    staff: text(200),
  })
  .superRefine((b, ctx) => {
    // A planned empty booth needs no company (m4b BUG-21); the DB check says the same.
    if (b.status !== 'available' && !b.company) ctx.addIssue({ code: 'custom', path: ['company'], message: 'Nhập tên doanh nghiệp, trừ khi gian còn trống' });
  });
export type BoothDraft = z.output<typeof boothDraftSchema>;

export const shiftDraftSchema = z.object({
  shiftDate: z
    .string({ error: 'Chọn ngày trực' })
    .refine((v) => parseIsoDate(v) !== null, 'Chọn ngày trực')
    .transform((v) => v as IsoDate),
  shiftLabel: required(60, 'Nhập khung giờ ca trực'),
  officerName: required(200, 'Nhập tên cán bộ phụ trách'),
  department: z.enum(departmentNames, { error: 'Chọn phòng ban' }),
  phone: text(40),
  zone: text(200),
});
export type ShiftDraft = z.output<typeof shiftDraftSchema>;
