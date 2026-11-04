// Mail merge (m4a §3.8, m4c §3.6). One registry of merge fields, each read
// from the real field (eventDate, eventTime, seatCode, targetGuests, the
// profile's fullname, the form link), never a hard-coded date or seat
// (m4a B24/B25, m4c B15-B18). The body template is sanitized, every value is
// HTML-escaped where it lands, and the result is sanitized again (m4a B03).

import type { HHmm, IsoDate, SafeUrl, SanitizedHtml, SeatCode } from '@/core/brand';
import { formatVNDate } from '@/core/dates';
import type { OrgIdentity } from '@/core/settings';
import { escapeHtml, foldVi, sanitizeRichHtml } from '@/core/text';
import type { GuestGroup } from '@/core/vocab';

export interface MergeData {
  event: { name: string; eventDate: IsoDate; eventTime: HHmm | null; location: string; targetGuests: number };
  recipient: { name: string; title: string; organization: string; group: GuestGroup | null; seatCode: SeatCode | null; checkinCode: string | null };
  sender: { displayName: string; email: string };
  /** The signed-in officer's profile name. */
  officerName: string;
  /** Typed on the compose form; nothing stores a contact phone (m4a Q9). */
  contactPhone: string;
  formUrl: SafeUrl | null;
  org: OrgIdentity;
}

const HONORIFIC_TITLES = ['chu tich', 'bi thu', 'truong', 'giam doc', 'thu truong', 'bo truong', 'chuyen vien', 'can bo', 'vien chuc'];

/** "Đồng chí" for VIP and Sở ngành or a public-office title, else "Quý Ông/Bà" (m4c §3.6). */
export function honorificOf(r: MergeData['recipient']): string {
  if (r.group === 'VIP' || r.group === 'SoNganh') return 'Đồng chí';
  const title = foldVi(r.title);
  return HONORIFIC_TITLES.some((t) => title.includes(t)) ? 'Đồng chí' : 'Quý Ông/Bà';
}

export interface MergeField {
  tag: string;
  label: string;
  /** null: no value exists, the tag renders empty and the compose screen warns. */
  value(d: MergeData): string | null;
}

const orBlank = (s: string) => (s.trim() ? s.trim() : null);

export const MERGE_FIELDS: ReadonlyArray<MergeField> = [
  { tag: 'danh_xung', label: 'Danh xưng', value: (d) => honorificOf(d.recipient) },
  { tag: 'ho_ten', label: 'Họ tên', value: (d) => d.recipient.name.trim() || 'Quý Đại biểu' },
  { tag: 'chuc_vu', label: 'Chức vụ', value: (d) => d.recipient.title.trim() || 'Đại biểu' },
  { tag: 'co_quan', label: 'Cơ quan', value: (d) => d.recipient.organization.trim() || 'Cơ quan/Đơn vị' },
  { tag: 'ten_su_kien', label: 'Tên sự kiện', value: (d) => d.event.name },
  { tag: 'thoi_gian', label: 'Thời gian', value: (d) => `${d.event.eventTime ? `${d.event.eventTime} ` : ''}ngày ${formatVNDate(d.event.eventDate)}` },
  { tag: 'dia_diem', label: 'Địa điểm', value: (d) => d.event.location.trim() || 'Theo thông báo của Ban Tổ chức' },
  { tag: 'so_ghe', label: 'Số ghế', value: (d) => d.recipient.seatCode ?? 'Ban Tổ chức sẽ thông báo' },
  { tag: 'so_dai_bieu', label: 'Số đại biểu dự kiến', value: (d) => (d.event.targetGuests > 0 ? String(d.event.targetGuests) : null) },
  { tag: 'ma_checkin', label: 'Mã check-in', value: (d) => d.recipient.checkinCode },
  { tag: 'can_bo_lien_he', label: 'Cán bộ liên hệ', value: (d) => orBlank(d.officerName) },
  { tag: 'sdt_lien_he', label: 'SĐT liên hệ', value: (d) => orBlank(d.contactPhone) },
  { tag: 'link_google_form', label: 'Link Google Form', value: (d) => d.formUrl },
  { tag: 'email_don_vi', label: 'Email đơn vị', value: (d) => d.sender.email },
  { tag: 'ten_don_vi_gui', label: 'Tên hòm thư gửi', value: (d) => d.sender.displayName },
  { tag: 'ten_don_vi', label: 'Tên đơn vị', value: (d) => d.org.agencyName },
  { tag: 'ten_viet_tat', label: 'Tên viết tắt', value: (d) => d.org.agencyShortName },
  { tag: 'co_quan_chu_quan', label: 'Cơ quan chủ quản', value: (d) => d.org.parentAgency },
];

const BY_TAG = new Map(MERGE_FIELDS.map((f) => [f.tag, f]));
const TAG = /\{([a-z_]+)\}/g;

export interface MergeCheck {
  /** Tags in the template that no field knows: they would go out as typed. */
  unknown: ReadonlyArray<string>;
  /** Known tags with no value for this recipient (no seat code, no form link, no contact phone). */
  missing: ReadonlyArray<string>;
}

export function checkTags(template: { subject: string; html: string }, d: MergeData): MergeCheck {
  const unknown = new Set<string>();
  const missing = new Set<string>();
  for (const [, tag] of `${template.subject}\n${template.html}`.matchAll(TAG)) {
    const field = BY_TAG.get(tag!);
    if (!field) unknown.add(tag!);
    else if (field.value(d) === null) missing.add(tag!);
  }
  return { unknown: [...unknown], missing: [...missing] };
}

function fill(text: string, d: MergeData, encode: (v: string) => string): string {
  return text.replace(TAG, (whole, tag: string) => {
    const field = BY_TAG.get(tag);
    return field ? encode(field.value(d) ?? '') : whole;
  });
}

export interface RenderedMail {
  /** Plain text; line breaks and tabs become spaces, so it can never break the Subject header. */
  subject: string;
  html: SanitizedHtml;
  text: string;
}

export function renderMail(template: { subject: string; html: string }, d: MergeData): RenderedMail {
  const subject = fill(template.subject, d, (v) => v).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const html = sanitizeRichHtml(fill(sanitizeRichHtml(template.html), d, escapeHtml));
  return { subject, html, text: htmlToText(html) };
}

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };

/** The text/plain alternative of a sanitized body: block ends become line breaks, tags go, entities decode once. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ENTITIES[e] ?? '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
