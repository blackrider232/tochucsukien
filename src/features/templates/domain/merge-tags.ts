// One registry of merge tags: label, where the value comes from, how it is
// formatted. Every value is HTML-escaped and a missing value becomes a visible
// dotted blank, never an invented default (m3 B01, B12, B13, B15, B37).

import type { SanitizedHtml } from '@/core/brand';
import { formatNd30Date, formatVNDate } from '@/core/dates';
import { badgeQuota, guestQuota, orgIdentity } from '@/core/settings';
import { escapeHtml, sanitizeRichHtml } from '@/core/text';
import type { DocumentTemplate, MergeContext } from '../contract';

export interface MergeTag {
  /** UPPER_SNAKE name without braces. */
  readonly tag: string;
  readonly label: string;
  /** `manual` tags have no source in the system: they are always left for the person to fill in. */
  readonly source: 'event' | 'settings' | 'today' | 'manual';
  /** null means "no value": the document shows a blank. */
  readonly resolve: (ctx: MergeContext) => string | null;
}

const text = (s: string) => (s.trim() === '' ? null : s);
const groupThousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const weekday = (ctx: MergeContext) => formatVNDate(ctx.event.eventDate, { weekday: true }).split(',')[0] ?? null;
const hasGuests = (ctx: MergeContext) => ctx.event.targetGuests > 0;

export const MERGE_TAGS: ReadonlyArray<MergeTag> = [
  { tag: 'TEN_SU_KIEN', label: 'Tên sự kiện', source: 'event', resolve: (c) => text(c.event.name) },
  { tag: 'NGAY_TO_CHUC', label: 'Ngày tổ chức', source: 'event', resolve: (c) => formatVNDate(c.event.eventDate) },
  { tag: 'THU_TO_CHUC', label: 'Thứ trong tuần của ngày tổ chức', source: 'event', resolve: weekday },
  { tag: 'GIO_KHAI_MAC', label: 'Giờ khai mạc', source: 'event', resolve: (c) => text(c.event.eventTime) },
  { tag: 'DIA_DIEM', label: 'Địa điểm tổ chức', source: 'event', resolve: (c) => text(c.event.location) },
  { tag: 'PHONG_BAN_CHU_TRI', label: 'Phòng chủ trì', source: 'event', resolve: (c) => text(c.event.department) },
  { tag: 'CAN_BO_PHU_TRACH', label: 'Cán bộ phụ trách', source: 'event', resolve: (c) => text(c.event.leadPerson) },
  { tag: 'SO_KHACH_DU_KIEN', label: 'Số khách dự kiến', source: 'event', resolve: (c) => (hasGuests(c) ? String(c.event.targetGuests) : null) },
  { tag: 'DINH_MUC_MOI', label: 'Định mức mời (theo tỷ lệ trong cài đặt)', source: 'event', resolve: (c) => (hasGuests(c) ? String(guestQuota(c.event.targetGuests, c.settings)) : null) },
  { tag: 'DINH_MUC_THE', label: 'Định mức thẻ (theo tỷ lệ trong cài đặt)', source: 'event', resolve: (c) => (hasGuests(c) ? String(badgeQuota(c.event.targetGuests, c.settings)) : null) },
  { tag: 'TY_LE_MOI', label: 'Tỷ lệ mời (%)', source: 'settings', resolve: (c) => String(c.settings.guestQuotaPercent) },
  { tag: 'TY_LE_THE', label: 'Tỷ lệ thẻ (%)', source: 'settings', resolve: (c) => String(c.settings.badgeQuotaPercent) },
  { tag: 'KINH_PHI_DU_TOAN', label: 'Kinh phí dự toán', source: 'event', resolve: (c) => (c.event.budget === null ? null : groupThousands(c.event.budget)) },
  { tag: 'KINH_PHI_THUC_TE', label: 'Kinh phí thực tế (điền tay)', source: 'manual', resolve: () => null },
  { tag: 'NGAY_HOM_NAY', label: 'Ngày hiện tại (ngày … tháng … năm …)', source: 'today', resolve: (c) => formatNd30Date(c.today) },
  { tag: 'CO_QUAN_CHU_QUAN', label: 'Cơ quan chủ quản', source: 'settings', resolve: (c) => text(orgIdentity(c.settings).parentAgency) },
  { tag: 'TEN_CO_QUAN', label: 'Tên cơ quan', source: 'settings', resolve: (c) => text(orgIdentity(c.settings).agencyName) },
  { tag: 'TEN_VIET_TAT', label: 'Tên viết tắt của cơ quan', source: 'settings', resolve: (c) => text(orgIdentity(c.settings).agencyShortName) },
];

/** Names used in saved documents before the rename (m3 B15). They resolve like their replacement. */
export const TAG_ALIASES: Readonly<Record<string, string>> = {
  DINH_MUC_MOI_130: 'DINH_MUC_MOI',
  DINH_MUC_THE_120: 'DINH_MUC_THE',
};

const BY_NAME: ReadonlyMap<string, MergeTag> = new Map(MERGE_TAGS.map((t) => [t.tag, t]));
const TOKEN = /\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g;

export const tagToken = (tag: string) => `{{${tag}}}`;
export const tagByName = (name: string): MergeTag | undefined => BY_NAME.get(TAG_ALIASES[name] ?? name);

/** What a missing value looks like in the document: dots, with a class the screen preview highlights. */
export const BLANK_HTML = '<span class="tpl-blank">……………</span>';

/** Every `{{TAG}}` in `content`, in order, once. */
export function tagNamesIn(content: string): string[] {
  return [...new Set([...content.matchAll(TOKEN)].map((m) => m[1]!))];
}
/** Tags the registry does not know. They stay literal in the output (m3 §3.1). */
export const unknownTags = (content: string) => tagNamesIn(content).filter((n) => !tagByName(n));

/** Event-sourced tags the document uses whose value the event does not have. */
export function missingTags(content: string, ctx: MergeContext): MergeTag[] {
  const found = tagNamesIn(content).flatMap((n) => tagByName(n) ?? []);
  return [...new Set(found)].filter((t) => t.source === 'event' && t.resolve(ctx) === null);
}

/** Pure. Single pass, so a value that itself looks like a tag is never expanded again. Output is sanitized again. */
export function renderTemplate(t: DocumentTemplate, ctx: MergeContext): SanitizedHtml {
  const cache = new Map<string, string>();
  const fill = (name: string): string | null => {
    const tag = tagByName(name);
    if (!tag) return null;
    const hit = cache.get(tag.tag);
    if (hit !== undefined) return hit;
    const value = tag.resolve(ctx);
    const html = value === null ? BLANK_HTML : escapeHtml(value);
    cache.set(tag.tag, html);
    return html;
  };
  return sanitizeRichHtml(t.content.replace(TOKEN, (token, name: string) => fill(name) ?? token));
}
