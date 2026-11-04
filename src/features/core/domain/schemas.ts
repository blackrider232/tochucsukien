// Zod schemas shared by the forms (useZodForm) and the commands, so the
// browser and the server check the same rules with the same Vietnamese text.

import { z } from 'zod';
import { parseUuid, type BackupId, type Email, type EventId, type IsoDate, type UserId, type Version } from '@/core/brand';
import { parseIsoDate, type HolidayKind } from '@/core/dates';
import type { SettingsPatch } from '@/core/settings';
import { parseEmail } from '@/core/text';
import { DEPARTMENTS, type DepartmentName, type Role } from '@/core/vocab';

const required = (max: number, message: string) => z.string({ error: message }).trim().min(1, message).max(max, `Tối đa ${max} ký tự`);
const whole = (min: number, max: number, unit: string) =>
  z.number({ error: `Nhập một số từ ${min} đến ${max}` }).int('Nhập số nguyên').min(min, `Tối thiểu ${min} ${unit}`).max(max, `Tối đa ${max} ${unit}`);
const isoDate = (message: string) => z.string({ error: message }).refine((v) => parseIsoDate(v) !== null, message).transform((v) => v as IsoDate);

export const userIdSchema = z.string().refine((v) => parseUuid(v) !== null, 'Mã tài khoản không hợp lệ').transform((v) => parseUuid<'User'>(v) as UserId);
export const versionSchema = z.number().int().positive().transform((v) => v as Version);
export const emailSchema = z
  .string({ error: 'Nhập email' })
  .trim()
  .min(1, 'Nhập email')
  .transform((v, ctx) => parseEmail(v) ?? (ctx.addIssue({ code: 'custom', message: 'Email không hợp lệ' }), z.NEVER)) as z.ZodType<Email, string>;

export const ROLE_VALUES = ['admin', 'leader', 'dept_leader', 'user'] as const satisfies ReadonlyArray<Role>;
export const roleSchema = z.enum(ROLE_VALUES, { error: 'Chọn vai trò' });
const ALL_DEPARTMENTS = DEPARTMENTS.map((d) => d.name) as [DepartmentName, ...DepartmentName[]];
export const departmentSchema = z.enum(ALL_DEPARTMENTS, { error: 'Chọn phòng ban' });
/** Sign-up offers only these; Ban Giám đốc is assigned by an admin (sce_tcsk_departments.self_registerable). */
export const SELF_REGISTER_DEPARTMENTS = DEPARTMENTS.filter((d) => d.selfRegisterable).map((d) => d.name) as [DepartmentName, ...DepartmentName[]];

export const PASSWORD_MIN = 8;
export const passwordSchema = z.string({ error: 'Nhập mật khẩu' }).min(PASSWORD_MIN, `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự`).max(72, 'Mật khẩu tối đa 72 ký tự');
export const fullnameSchema = required(120, 'Nhập họ tên').transform((v) => v.replace(/\s+/g, ' '));

// ---------- auth screens (browser only; the server never sees a role) ----------
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: 'Nhập mật khẩu' }).min(1, 'Nhập mật khẩu'),
});
export const registerSchema = z.object({
  fullname: fullnameSchema,
  department: z.enum(SELF_REGISTER_DEPARTMENTS, { error: 'Chọn phòng chuyên môn' }),
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.output<typeof registerSchema>;
export const resetRequestSchema = z.object({ email: emailSchema });
export const newPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string({ error: 'Nhập lại mật khẩu' }) })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Hai mật khẩu chưa khớp' });
export const changePasswordSchema = z
  .object({ current: z.string({ error: 'Nhập mật khẩu hiện tại' }).min(1, 'Nhập mật khẩu hiện tại'), password: passwordSchema, confirm: z.string({ error: 'Nhập lại mật khẩu' }) })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Hai mật khẩu chưa khớp' })
  .refine((v) => v.password !== v.current, { path: ['password'], message: 'Mật khẩu mới phải khác mật khẩu hiện tại' });
export const totpCodeSchema = z.object({
  code: z.string({ error: 'Nhập mã 6 số' }).transform((v) => v.replace(/\s+/g, '')).pipe(z.string().regex(/^\d{6}$/, 'Mã xác thực gồm 6 chữ số')),
});

// ---------- settings (same ranges as settingsPatchSchema and the DB checks) ----------
export const SETTINGS_LIMITS = {
  dailyReportThresholdDays: [1, 30],
  fieldPresenceHours: [1, 5],
  guestQuotaPercent: [100, 200],
  badgeQuotaPercent: [100, 200],
} as const;

export const settingsFormSchema = z.object({
  parentAgency: required(300, 'Nhập đơn vị chủ quản'),
  agencyName: required(300, 'Nhập tên đơn vị tổ chức'),
  agencyShortName: required(40, 'Nhập tên viết tắt'),
  dailyReportThresholdDays: whole(...SETTINGS_LIMITS.dailyReportThresholdDays, 'ngày'),
  fieldPresenceHours: whole(...SETTINGS_LIMITS.fieldPresenceHours, 'tiếng'),
  guestQuotaPercent: whole(...SETTINGS_LIMITS.guestQuotaPercent, '%'),
  badgeQuotaPercent: whole(...SETTINGS_LIMITS.badgeQuotaPercent, '%'),
});
export const settingsUpdateSchema = z.object({
  version: versionSchema,
  patch: settingsFormSchema.partial().strict() as z.ZodType<SettingsPatch>,
});

// ---------- holidays ----------
export const HOLIDAY_KINDS = ['holiday', 'compensatory_workday'] as const satisfies ReadonlyArray<HolidayKind>;
export const HOLIDAY_KIND_LABELS: { readonly [K in HolidayKind]: string } = { holiday: 'Ngày nghỉ lễ', compensatory_workday: 'Ngày làm bù' };
export const holidayFields = z.object({
  date: isoDate('Chọn ngày'),
  name: required(120, 'Nhập tên ngày nghỉ'),
  kind: z.enum(HOLIDAY_KINDS),
});
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;
const holidayYear = z.object({
  year: z.number().int().min(MIN_YEAR).max(MAX_YEAR),
  holidays: z.array(holidayFields).max(60, 'Tối đa 60 ngày mỗi năm'),
});
function checkHolidayYear(v: z.output<typeof holidayYear>, ctx: z.RefinementCtx) {
  const seen = new Set<string>();
  v.holidays.forEach((h, i) => {
    if (!h.date.startsWith(`${v.year}-`)) ctx.addIssue({ code: 'custom', path: ['holidays', i, 'date'], message: `Ngày phải thuộc năm ${v.year}` });
    if (seen.has(h.date)) ctx.addIssue({ code: 'custom', path: ['holidays', i, 'date'], message: 'Ngày này đã có trong danh sách' });
    seen.add(h.date);
  });
}
export const holidaysReplaceSchema = holidayYear.superRefine(checkHolidayYear);
export const holidaysSaveSchema = holidayYear.extend({ expected: z.array(holidayFields).max(60) }).superRefine(checkHolidayYear);

// ---------- profile, users, backups, audit ----------
export const profileNameSchema = z.object({ fullname: fullnameSchema });
export const setRoleSchema = z.object({ id: userIdSchema, role: roleSchema });
export const setDepartmentSchema = z.object({ id: userIdSchema, department: departmentSchema });
export const setStatusSchema = z.object({
  ids: z.array(userIdSchema).min(1, 'Chọn ít nhất một tài khoản').max(200),
  status: z.enum(['active', 'locked']),
});
export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullname: fullnameSchema,
  department: departmentSchema,
  role: roleSchema,
});
export const backupIdSchema = z.number().int().positive().transform((v) => v as BackupId);
export const backupRefSchema = z.object({ id: backupIdSchema });
export const backupNoteSchema = z.object({ note: required(200, 'Nhập ghi chú bản sao lưu') });

export const AUDIT_PAGE = 50;
export const auditListSchema = z.object({
  before: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(200),
  action: z.string().trim().min(1).max(120).optional(),
  from: isoDate('Ngày không hợp lệ').optional(),
  to: isoDate('Ngày không hợp lệ').optional(),
});
export const eventIdParam = z.string().refine((v) => parseUuid(v) !== null).transform((v) => parseUuid<'Event'>(v) as EventId);
