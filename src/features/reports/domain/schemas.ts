// Zod schemas shared by the report forms (useZodForm) and the commands (input
// parsing), so the dialog and the server refuse the same values.

import { z } from 'zod';
import { parseUuid, type BiddingPackageId, type ClippingId, type DailyReportId, type EventId, type IsoDate, type PressReleaseId, type SafeUrl, type Uuid, type Vnd, type Version } from '@/core/brand';
import { parseIsoDate } from '@/core/dates';
import { parseSafeUrl } from '@/core/text';
import { DEPARTMENTS, type DepartmentName } from '@/core/vocab';
import type { BiddingStatus, MediaType, PressRelease } from '../contract';

const uuidOf = <E extends string>() =>
  z.string().refine((v) => parseUuid(v) !== null, 'Mã không hợp lệ').transform((v) => parseUuid<E>(v) as Uuid<E>);
export const eventIdSchema = uuidOf<'Event'>() as z.ZodType<EventId, string>;
export const clippingIdSchema = uuidOf<'MediaClipping'>() as z.ZodType<ClippingId, string>;
export const packageIdSchema = uuidOf<'BiddingPackage'>() as z.ZodType<BiddingPackageId, string>;
export const reportIdSchema = uuidOf<'DailyReport'>() as z.ZodType<DailyReportId, string>;
export const pressReleaseIdSchema = uuidOf<'PressRelease'>() as z.ZodType<PressReleaseId, string>;
export const versionSchema = z.number().int().positive().transform((v) => v as Version);

const text = (max: number) => z.string().trim().max(max, `Tối đa ${max} ký tự`);
const required = (max: number, message: string) => z.string({ error: message }).trim().min(1, message).max(max, `Tối đa ${max} ký tự`);

/** The four the form offers, then the legacy seed's combined type, kept so imported rows stay editable (BUG-30). */
export const MEDIA_TYPES = ['Báo điện tử', 'Truyền hình', 'Báo in', 'Cổng TTĐT', 'Báo in & Điện tử'] as const satisfies ReadonlyArray<MediaType>;
export const MEDIA_TYPE_LABEL: Readonly<Record<MediaType, string>> = {
  'Báo điện tử': 'Báo điện tử',
  'Truyền hình': 'Truyền hình (video)',
  'Báo in': 'Báo in',
  'Cổng TTĐT': 'Cổng thông tin điện tử',
  'Báo in & Điện tử': 'Báo in và điện tử',
};

export const BIDDING_STATUSES = ['Đang thẩm định hồ sơ', 'Đang thực hiện hợp đồng', 'Đang nghiệm thu thanh lý', 'Đã nghiệm thu thanh lý'] as const satisfies ReadonlyArray<BiddingStatus>;
export const BIDDING_DEPARTMENTS = DEPARTMENTS.filter((d) => d.canChairEvents).map((d) => d.name) as [DepartmentName, ...DepartmentName[]];

const isoDate = (message: string) => z.string({ error: message }).refine((v) => parseIsoDate(v) !== null, message).transform((v) => parseIsoDate(v) as IsoDate);

/** '' (a form) or null (an undo replaying a stored row) is "no link"; anything else must be http(s) (BUG-25). */
const urlSchema = z
  .string()
  .trim()
  .max(2000, 'Tối đa 2000 ký tự')
  .nullable()
  .refine((v) => !v || parseSafeUrl(v) !== null, 'Đường dẫn phải bắt đầu bằng http:// hoặc https://')
  .transform((v) => (v ? (parseSafeUrl(v) as SafeUrl) : null));

export const clippingFields = z.object({
  outlet: required(200, 'Nhập tên cơ quan báo chí hoặc kênh truyền hình'),
  title: required(300, 'Nhập tiêu đề bài viết hoặc phóng sự'),
  publishedOn: isoDate('Chọn ngày đăng hoặc phát sóng'),
  mediaType: z.enum(MEDIA_TYPES, { error: 'Chọn loại hình' }),
  url: urlSchema,
  author: text(120),
});
export type ClippingDraft = z.output<typeof clippingFields>;

const vnd = (message: string) => z.number({ error: message }).int(message).min(0, message).max(Number.MAX_SAFE_INTEGER, message).transform((v) => v as Vnd);

/** m6 §3.4: dự toán above zero, a winning price may come later; code unique per event (checked by the command). */
export const packageFields = z.object({
  code: required(40, 'Nhập mã gói thầu').transform((v) => v.toUpperCase()),
  name: required(300, 'Nhập tên gói thầu'),
  department: z.enum(BIDDING_DEPARTMENTS, { error: 'Chọn phòng phụ trách' }),
  budget: vnd('Nhập dự toán bằng số đồng').refine((v) => v > 0, 'Dự toán phải lớn hơn 0'),
  winningPrice: vnd('Giá trúng thầu là số đồng không âm').nullable().optional().transform((v) => v ?? null),
  contractor: text(300).nullable().transform((v) => (v ? v : null)),
  status: z.enum(BIDDING_STATUSES, { error: 'Chọn tiến độ hợp đồng' }),
});
export type PackageDraft = z.output<typeof packageFields>;

export const PRESS_TIMINGS = ['before', 'after'] as const satisfies ReadonlyArray<PressRelease['timing']>;
export const PRESS_TIMING_LABEL: Readonly<Record<PressRelease['timing'], string>> = {
  before: 'Trước sự kiện (lịch trình và mục đích)',
  after: 'Sau sự kiện (kết quả và thỏa thuận)',
};
export const pressReleaseFields = z.object({
  title: required(300, 'Nhập tiêu đề thông cáo báo chí'),
  timing: z.enum(PRESS_TIMINGS, { error: 'Chọn thời điểm phát hành' }),
  contact: text(300),
  content: required(20_000, 'Nhập nội dung thông cáo'),
});
export type PressReleaseDraft = z.output<typeof pressReleaseFields>;

/**
 * What a person writes into the daily report. The figures, the date and the
 * issuer are never part of it: the server computes and stamps those (BUG-07).
 */
export const issueFields = z.object({
  keyHighlight: required(4000, 'Nhập tình hình triển khai nổi bật trong ngày'),
  blockers: text(4000),
  signatory: required(120, 'Nhập họ tên người ký'),
  documentNumber: text(60).transform((v) => (v === '' ? null : v)),
});
export type IssueDraft = z.output<typeof issueFields>;
