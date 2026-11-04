// CSV <-> contacts: the export columns (m4c §1.7) and the import that reads them
// back. An import first becomes a preview of per-row results; nothing is written
// until the admin commits it. Rows that cannot be saved say why, row by row.

import { newId, type ContactId } from '@/core/brand';
import { foldVi, type CsvColumn } from '@/core/text';
import { GUEST_GROUPS, type GuestGroup } from '@/core/vocab';
import { guestIdentityKey } from '@/features/guests';
import type { MasterContact } from '../contract';
import { parseCsv, unguardCell } from './csv';
import { GROUP_VALUES, MAX_BATCH, contactFields, defaultBanquet, type ContactDraft } from './schemas';

/** Export and import share these columns, so a file the app wrote can be imported again. */
export const CONTACT_CSV_COLUMNS: ReadonlyArray<CsvColumn<MasterContact>> = [
  { header: 'STT', value: (_c, i) => i + 1 },
  { header: 'Mã Định Danh', value: (c) => c.id },
  { header: 'Nhóm Đối Tượng', value: (c) => GUEST_GROUPS[c.group].label },
  { header: 'Họ Và Tên', value: (c) => c.name },
  { header: 'Chức Danh', value: (c) => c.title },
  { header: 'Cơ Quan / Doanh Nghiệp', value: (c) => c.organization },
  { header: 'Số Điện Thoại', value: (c) => c.phone },
  { header: 'Email', value: (c) => c.email ?? '' },
  { header: 'Địa Chỉ', value: (c) => c.address },
  { header: 'Mã Số Thuế / Ngành', value: (c) => c.taxCode },
  { header: 'Tiệc VIP', value: (c) => (c.hasBanquet ? 'Có' : 'Không') },
  { header: 'Ghi Chú Lễ Tân', value: (c) => c.notes },
];

type Field = keyof ContactDraft;
/** What the admin sees when a row names a column: the legacy form labels. */
const FIELD_LABEL: Record<Field, string> = {
  name: 'Họ và tên',
  group: 'Nhóm đối tượng',
  title: 'Chức danh',
  organization: 'Cơ quan / doanh nghiệp',
  phone: 'Số điện thoại',
  email: 'Email',
  address: 'Địa chỉ',
  taxCode: 'Mã số thuế / ngành',
  hasBanquet: 'Tiệc VIP',
  notes: 'Ghi chú lễ tân',
};

/**
 * A header is its folded words. It names a field exactly (its words are one of the field's names) or loosely (they start
 * with one); among a header's matches the exact one wins, then the first rule.
 */
const HEADER_RULES: ReadonlyArray<readonly [Field | 'ignore', ReadonlyArray<string>]> = [
  ['ignore', ['stt', 'ma dinh danh', 'id']],
  ['group', ['nhom']],
  ['name', ['ho va ten', 'ho ten', 'ten', 'name']],
  ['title', ['chuc danh', 'chuc vu', 'title']],
  ['organization', ['co quan', 'doanh nghiep', 'to chuc', 'don vi', 'organization']],
  ['phone', ['so dien thoai', 'dien thoai', 'sdt', 'phone']],
  ['email', ['email', 'hop thu']],
  ['address', ['dia chi', 'address']],
  ['taxCode', ['ma so thue', 'mst']],
  ['hasBanquet', ['tiec']],
  ['notes', ['ghi chu', 'notes']],
];

const headerWords = (h: string) => foldVi(h.replace(/[^\p{L}\p{N}]+/gu, ' '));

type Exactness = 'exact' | 'prefix';
function matchHeader(words: string): { field: Field | 'ignore'; exactness: Exactness } | null {
  for (const exactness of ['exact', 'prefix'] as const) {
    const rule = HEADER_RULES.find(([, names]) => names.some((p) => (exactness === 'exact' ? words === p : words.startsWith(`${p} `))));
    if (rule) return { field: rule[0], exactness };
  }
  return null;
}

export interface ColumnMap {
  /** Cell index per field: the one column that names it best. */
  fields: Partial<Record<Field, number>>;
  /** Headers no rule recognised, for the preview to mention. */
  unknown: string[];
  /** Columns that name a field a better column already gave, with the column that won. */
  unused: string[];
  /** Fields two or more columns name equally well; the file cannot be read until one goes. */
  conflicts: string[];
  /** Required columns the file lacks, as form labels. */
  missing: string[];
}

export function mapHeaders(header: ReadonlyArray<string>): ColumnMap {
  const unknown: string[] = [];
  const claims = new Map<Field, { index: number; raw: string; exactness: Exactness }[]>();
  header.forEach((raw, index) => {
    const words = headerWords(raw);
    if (!words) return;
    const match = matchHeader(words);
    if (!match) unknown.push(raw.trim());
    else if (match.field !== 'ignore') claims.set(match.field, [...(claims.get(match.field) ?? []), { index, raw: raw.trim(), exactness: match.exactness }]);
  });
  const fields: Partial<Record<Field, number>> = {};
  const unused: string[] = [];
  const conflicts: string[] = [];
  for (const [field, columns] of claims) {
    const exact = columns.filter((c) => c.exactness === 'exact');
    const best = exact.length > 0 ? exact : columns;
    if (best.length > 1) {
      conflicts.push(`${FIELD_LABEL[field]}: ${best.map((c) => `"${c.raw}"`).join(', ')}`);
      continue;
    }
    const winner = best[0]!;
    fields[field] = winner.index;
    for (const c of columns) if (c !== winner) unused.push(`"${c.raw}" (đã lấy cột "${winner.raw}" làm ${FIELD_LABEL[field]})`);
  }
  const missing = (['name', 'organization'] as const).filter((f) => fields[f] === undefined && !claims.has(f)).map((f) => FIELD_LABEL[f]);
  return { fields, unknown, unused, conflicts, missing };
}

/** Folded code, short label and long label of every group, plus the plain Vietnamese names people type. */
const GROUP_LOOKUP: ReadonlyMap<string, GuestGroup> = new Map([
  ...GROUP_VALUES.flatMap((g) => [[foldVi(g), g], [foldVi(GUEST_GROUPS[g].short), g], [foldVi(GUEST_GROUPS[g].label), g]] as const),
  ['so ban nganh', 'SoNganh'],
  ['quoc te', 'QuocTe'],
  ['ngoai giao', 'QuocTe'],
  ['bao chi', 'BaoChi'],
  ['truyen hinh', 'BaoChi'],
]);
export const parseGroupCell = (raw: string): GuestGroup | null => GROUP_LOOKUP.get(foldVi(raw)) ?? null;

const YES = new Set(['co', 'x', '1', 'true', 'yes', 'y', 'v', 'tiec vip']);
const NO = new Set(['khong', '0', 'false', 'no', 'n', '-']);
/** true/false for a definite answer, null for an empty cell (the group's default applies), undefined for text nobody can read. */
export function parseBanquetCell(raw: string): boolean | null | undefined {
  const v = foldVi(raw);
  if (!v) return null;
  return YES.has(v) ? true : NO.has(v) ? false : undefined;
}

export type RowStatus = 'new' | 'duplicate_existing' | 'duplicate_in_file' | 'invalid';
export interface ImportRow {
  /** Line in the file, counting the header as line 1. */
  line: number;
  status: RowStatus;
  /** The draft to save, for every row that is not invalid. */
  draft: ContactDraft | null;
  /** What is wrong, in the admin's words ("Dòng 7: Nhập cơ quan / doanh nghiệp"). Empty unless invalid. */
  errors: string[];
  /** The id the contact is created with, so a retry of the same commit converges. */
  id: ContactId;
}
export interface ImportPreview {
  rows: ImportRow[];
  counts: { total: number; created: number; duplicateExisting: number; duplicateInFile: number; invalid: number };
  /** The file itself cannot be imported: no header, a missing required column, two columns for one field, too many rows. */
  error: string | null;
  unknownColumns: string[];
  /** Columns left out because another column names the same field better (ColumnMap.unused). */
  unusedColumns: string[];
}

const EMPTY_COUNTS = { total: 0, created: 0, duplicateExisting: 0, duplicateInFile: 0, invalid: 0 };
const failed = (error: string, unknownColumns: string[] = []): ImportPreview => ({ rows: [], counts: EMPTY_COUNTS, error, unknownColumns, unusedColumns: [] });

export interface ImportOptions {
  /** Group of a row whose group cell is empty or the file has no group column. */
  defaultGroup: GuestGroup;
  /** Identity keys (guestIdentityKey) of the contacts already in the directory. */
  existingKeys: ReadonlySet<string>;
}

/**
 * Reads CSV text into a preview. A contact is a duplicate when its guest identity key (email, else phone, else name and
 * organization) equals an existing contact's or an earlier row's; the first of two equal rows wins. Linear in rows.
 */
export function previewContactImport(text: string, opts: ImportOptions): ImportPreview {
  const parsed = parseCsv(text);
  if (parsed.error) return failed(parsed.error);
  const [header, ...body] = parsed.rows;
  if (!header) return failed('Chưa có dữ liệu. Dòng đầu tiên phải là tiêu đề các cột, các dòng sau là đối tượng.');
  const map = mapHeaders(header);
  if (map.conflicts.length > 0) return failed(`Có nhiều cột cùng nghĩa: ${map.conflicts.join('; ')}. Đổi tên hoặc xóa bớt cột rồi dán lại.`, map.unknown);
  if (map.missing.length > 0) return failed(`Thiếu cột bắt buộc: ${map.missing.join(', ')}. Tiêu đề ở dòng đầu tiên, ví dụ "Họ Và Tên", "Cơ Quan / Doanh Nghiệp".`, map.unknown);
  if (body.length === 0) return failed('Tệp chỉ có dòng tiêu đề, chưa có đối tượng nào.', map.unknown);
  if (body.length > MAX_BATCH) return failed(`Tệp có ${body.length} dòng, tối đa ${MAX_BATCH} dòng mỗi lần nhập. Hãy tách thành nhiều tệp.`, map.unknown);

  const cell = (row: ReadonlyArray<string>, f: Field) => {
    const i = map.fields[f];
    return i === undefined ? '' : unguardCell((row[i] ?? '').trim());
  };
  const seen = new Set<string>();
  const counts = { ...EMPTY_COUNTS, total: body.length };
  // The header is line 1; blank lines were dropped by the parser, so a row's line is a close guide, not an exact one.
  const rows = body.map((cells, n): ImportRow => {
    const line = n + 2;
    const id = newId<'MasterContact'>();
    const errors: string[] = [];
    const rawGroup = cell(cells, 'group');
    const group = rawGroup ? parseGroupCell(rawGroup) : opts.defaultGroup;
    if (!group) errors.push(`${FIELD_LABEL.group}: "${rawGroup}" không có trong danh mục (VIP, Sở ngành, Doanh nghiệp, Quốc tế, Báo chí)`);
    const rawBanquet = cell(cells, 'hasBanquet');
    const banquet = parseBanquetCell(rawBanquet);
    if (banquet === undefined) errors.push(`${FIELD_LABEL.hasBanquet}: "${rawBanquet}" không đọc được (nhập Có hoặc Không)`);

    const result = contactFields.safeParse({
      name: cell(cells, 'name'),
      group: group ?? opts.defaultGroup,
      title: cell(cells, 'title'),
      organization: cell(cells, 'organization'),
      phone: cell(cells, 'phone'),
      email: cell(cells, 'email') || null,
      address: cell(cells, 'address'),
      taxCode: cell(cells, 'taxCode'),
      notes: cell(cells, 'notes'),
      hasBanquet: banquet ?? defaultBanquet(group ?? opts.defaultGroup),
    });
    if (!result.success) {
      for (const issue of result.error.issues) errors.push(`${FIELD_LABEL[issue.path[0] as Field] ?? 'Dòng'}: ${issue.message}`);
    }
    if (errors.length > 0 || !result.success) {
      counts.invalid += 1;
      return { line, status: 'invalid', draft: null, errors: errors.map((e) => `Dòng ${line}: ${e}`), id };
    }
    const key = guestIdentityKey(result.data);
    if (opts.existingKeys.has(key)) {
      counts.duplicateExisting += 1;
      return { line, status: 'duplicate_existing', draft: result.data, errors: [], id };
    }
    if (seen.has(key)) {
      counts.duplicateInFile += 1;
      return { line, status: 'duplicate_in_file', draft: result.data, errors: [], id };
    }
    seen.add(key);
    counts.created += 1;
    return { line, status: 'new', draft: result.data, errors: [], id };
  });
  return { rows, counts, error: null, unknownColumns: map.unknown, unusedColumns: map.unused };
}

export const ROW_STATUS_LABEL: Record<RowStatus, string> = {
  new: 'Sẽ thêm mới',
  duplicate_existing: 'Đã có trong CSDL, bỏ qua',
  duplicate_in_file: 'Trùng dòng trước, bỏ qua',
  invalid: 'Lỗi, không nhập',
};
