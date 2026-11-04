// Which sheet column holds which answer. Every header is scored against every
// field, exclusions first, and the best pairs are assigned one to one, so
// "Tên cơ quan" is the organisation and "Anh/chị có dự tiệc?" is banquet,
// whatever the column order (m4a B16, m4c B22). Staff can correct the guess;
// the saved map wins.

import { foldVi } from '@/core/text';

export const FORM_FIELDS = ['timestamp', 'name', 'email', 'phone', 'organization', 'title', 'rsvp', 'banquet', 'substitute', 'notes'] as const;
export type FormField = (typeof FORM_FIELDS)[number];
/** Field -> 0-based column index. A field without a column is absent, never guessed at read time. */
export type ColumnMap = Partial<Record<FormField, number>>;

export const FORM_FIELD_LABELS: { readonly [F in FormField]: string } = {
  timestamp: 'Thời gian phản hồi',
  name: 'Họ và tên',
  email: 'Email',
  phone: 'Số điện thoại',
  organization: 'Cơ quan / Đơn vị',
  title: 'Chức vụ',
  rsvp: 'Xác nhận tham dự',
  banquet: 'Dự tiệc',
  substitute: 'Người đi thay',
  notes: 'Ghi chú',
};

interface Rule {
  keywords: ReadonlyArray<readonly [phrase: string, weight: number]>;
  /** A header with any of these is never this field. */
  exclude?: ReadonlyArray<string>;
}

const RULES: { readonly [F in FormField]: Rule } = {
  timestamp: { keywords: [['dau thoi gian', 10], ['timestamp', 10], ['thoi gian', 5]] },
  name: {
    keywords: [['ho va ten', 10], ['ho ten', 10], ['full name', 10], ['ten dai bieu', 9], ['ten khach', 8], ['name', 5], ['ten', 2]],
    exclude: ['thay', 'dai dien', 'co quan', 'don vi', 'cong ty', 'doanh nghiep', 'to chuc', 'su kien', 'company', 'organization'],
  },
  email: { keywords: [['email', 9], ['e mail', 9], ['thu dien tu', 8], ['gmail', 7]] },
  phone: { keywords: [['so dien thoai', 9], ['dien thoai', 8], ['sdt', 9], ['phone', 8], ['mobile', 7], ['zalo', 5]] },
  organization: { keywords: [['co quan', 7], ['don vi', 7], ['doanh nghiep', 6], ['to chuc', 6], ['cong ty', 6], ['organization', 7], ['company', 7]] },
  title: { keywords: [['chuc vu', 8], ['chuc danh', 8], ['vi tri', 5], ['title', 6], ['position', 6]] },
  rsvp: { keywords: [['rsvp', 8], ['xac nhan', 6], ['attend', 6], ['tham du', 5], ['tham gia', 4]], exclude: ['tiec', 'chieu dai', 'banquet', 'thay'] },
  banquet: { keywords: [['tiec', 8], ['chieu dai', 8], ['banquet', 8], ['dinner', 7]] },
  substitute: { keywords: [['nguoi di thay', 9], ['di thay', 8], ['nguoi thay', 8], ['substitute', 8], ['thay the', 7], ['dai dien', 4]] },
  notes: { keywords: [['ghi chu', 8], ['y kien', 6], ['gop y', 5], ['note', 6]] },
};

/** Folded, punctuation to spaces, padded, so a phrase matches whole words only ("no" never matches "notes"). */
export const words = (s: string) => ` ${foldVi(s).replace(/[^a-z0-9]+/g, ' ').trim()} `;
export const hasPhrase = (padded: string, phrase: string) => padded.includes(` ${phrase} `);

export function scoreHeader(header: string, field: FormField): number {
  const w = words(header);
  const rule = RULES[field];
  if (rule.exclude?.some((x) => hasPhrase(w, x))) return 0;
  return Math.max(0, ...rule.keywords.filter(([p]) => hasPhrase(w, p)).map(([, weight]) => weight));
}

export function detectColumns(headers: ReadonlyArray<string>): ColumnMap {
  const pairs = FORM_FIELDS.flatMap((field) => headers.map((h, column) => ({ field, column, score: scoreHeader(h, field) })))
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score || a.column - b.column);
  const map: ColumnMap = {};
  const used = new Set<number>();
  for (const p of pairs) {
    if (map[p.field] !== undefined || used.has(p.column)) continue;
    map[p.field] = p.column;
    used.add(p.column);
  }
  return map;
}

/** A map is usable when it can identify a person. */
export const canIdentify = (map: ColumnMap) => map.name !== undefined || map.email !== undefined || map.phone !== undefined;
