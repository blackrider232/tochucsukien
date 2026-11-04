// Zod schemas shared by the live forms (useZodForm) and the commands (input
// parsing), so the reception desk and the server validate the same rules.

import { z } from 'zod';
import { parseUuid, type DutyStaffId, type EventId, type GuestId, type IncidentId, type Instant, type Uuid, type Version } from '@/core/brand';
import { parseInstant } from '@/core/dates';
import { normalizePhone } from '@/core/text';
import { DEPARTMENTS, type DepartmentName, type GuestGroup } from '@/core/vocab';
import type { DutyDesk, IncidentStatus, IncidentUrgency } from '../contract';

const uuidOf = <E extends string>() =>
  z.string().refine((v) => parseUuid(v) !== null, 'Mã không hợp lệ').transform((v) => parseUuid<E>(v) as Uuid<E>);
export const eventIdSchema = uuidOf<'Event'>() as z.ZodType<EventId, string>;
export const guestIdSchema = uuidOf<'Guest'>() as z.ZodType<GuestId, string>;
export const dutyIdSchema = uuidOf<'DutyStaff'>() as z.ZodType<DutyStaffId, string>;
export const incidentIdSchema = uuidOf<'Incident'>() as z.ZodType<IncidentId, string>;
export const versionSchema = z.number().int().positive().transform((v) => v as Version);
export const instantSchema = z.string().refine((v) => parseInstant(v) !== null, 'Thời điểm không hợp lệ').transform((v) => parseInstant(v) as Instant);
/** The reception desk a check-in was made at; free text, absent on most devices. */
export const deskSchema = z.string().trim().max(60).nullable();

const text = (max: number) => z.string().trim().max(max, `Tối đa ${max} ký tự`);
const required = (max: number, message: string) => z.string({ error: message }).trim().min(1, message).max(max, `Tối đa ${max} ký tự`);

export const GUEST_GROUP_VALUES = ['VIP', 'SoNganh', 'DoanhNghiep', 'QuocTe', 'BaoChi'] as const satisfies ReadonlyArray<GuestGroup>;
export const DESK_VALUES = [1, 2, 3, 4] as const satisfies ReadonlyArray<DutyDesk>;
export const URGENCY_VALUES = ['high', 'medium', 'low'] as const satisfies ReadonlyArray<IncidentUrgency>;
export const INCIDENT_STATUS_VALUES = ['open', 'in_progress', 'resolved'] as const satisfies ReadonlyArray<IncidentStatus>;
/** Ban Giám đốc is not a duty department in the legacy roster form. */
export const DUTY_DEPARTMENTS = DEPARTMENTS.filter((d) => d.canChairEvents).map((d) => d.name) as [DepartmentName, ...DepartmentName[]];

/** Same rule as a guest's phone: free text staff write ('0913.210.001'), 8 to 15 digits. */
const phoneSchema = text(40).refine((v) => {
  if (!v) return true;
  const digits = normalizePhone(v);
  return /^[\d\s.+()-]+$/.test(v) && digits.length >= 8 && digits.length <= 15;
}, 'Số điện thoại không hợp lệ (ví dụ 0912.345.678)');

/** "Khách mới" tab of the walk-in dialog. `zoneKey` '' means no seat; a VIP zone for a non-VIP guest needs `confirmVipZone`. */
export const walkInFields = z.object({
  name: required(200, 'Nhập họ tên đại biểu'),
  group: z.enum(GUEST_GROUP_VALUES, { error: 'Chọn nhóm khách mời' }),
  title: text(300),
  organization: required(300, 'Nhập cơ quan / đơn vị công tác'),
  phone: phoneSchema,
  hasBanquet: z.boolean(),
  giftGiven: z.boolean(),
  zoneKey: z.string().trim().max(10),
});
export type WalkInFields = z.output<typeof walkInFields>;

/** "Người đi thay" tab: the invited guest a substitute attends for (m5 BUG-15). */
export const substituteFields = z.object({
  guestId: z.string({ error: 'Chọn đại biểu được mời' }).min(1, 'Chọn đại biểu được mời'),
  substituteName: required(300, 'Nhập họ tên và chức vụ người đi thay'),
  giftGiven: z.boolean(),
});

export const dutyFields = z.object({
  name: required(200, 'Nhập họ tên cán bộ'),
  department: z.enum(DUTY_DEPARTMENTS, { error: 'Chọn phòng ban' }),
  // The form's Select gives '1'..'4', a command call gives 1..4.
  desk: z.coerce.number({ error: 'Chọn bàn trực' }).int().min(1, 'Chọn bàn trực').max(4, 'Chọn bàn trực').transform((v) => v as DutyDesk),
  roleLabel: text(200),
});
export type DutyDraft = z.output<typeof dutyFields>;

export const incidentFields = z.object({
  location: required(200, 'Chọn vị trí xảy ra sự cố'),
  urgency: z.enum(URGENCY_VALUES, { error: 'Chọn mức độ' }),
  description: required(2000, 'Nhập nội dung sự cố'),
  assignee: text(200),
});
export type IncidentDraft = z.output<typeof incidentFields>;

export const resolutionNoteSchema = text(1000);
