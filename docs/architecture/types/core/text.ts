// Text, HTML, money and file-safety helpers. React escapes by default; these
// exist only for the few places where a string leaves React: Word/print HTML,
// email bodies, CSV cells, rich-text templates.

import type { Email, SafeUrl, SanitizedHtml, Vnd } from './brand';

/** Vietnamese tone folding + lowercase + whitespace collapse. The one search normalizer. */
export function foldVi(s: string): string {
  throw new Error('not implemented');
}
/** Every token of the folded query appears in the folded haystack. */
export function matchesQuery(query: string, ...haystack: ReadonlyArray<string | null | undefined>): boolean {
  throw new Error('not implemented');
}

/** Escapes & < > " ' . null/undefined -> ''. 0 and false render as '0' / 'false' (core B28). */
export function escapeHtml(value: unknown): string {
  throw new Error('not implemented');
}
/** Tagged template for export HTML: interpolations are escaped unless already SanitizedHtml. */
export function html(strings: TemplateStringsArray, ...values: ReadonlyArray<unknown>): SanitizedHtml {
  throw new Error('not implemented');
}
/**
 * DOMPurify with an allowlist sized for NĐ30 documents and email bodies:
 * tables, inline text styles, alignment, no scripts, no event handlers, no
 * javascript:/data: URLs (m3 B02, m4a B03). Runs on save AND on render.
 */
export function sanitizeRichHtml(input: string): SanitizedHtml {
  throw new Error('not implemented');
}

export function parseEmail(raw: unknown): Email | null {
  throw new Error('not implemented');
}
export function parseSafeUrl(raw: unknown): SafeUrl | null {
  throw new Error('not implemented');
}
/** Digits only, VN mobile/landline lengths; keeps the display form separately. */
export function normalizePhone(raw: string): string {
  throw new Error('not implemented');
}

/** '1.500.000' -> 1500000; '1.500.000,50' -> null (no fractional dong); 'abc' -> null (m6 BUG-34). */
export function parseVnd(raw: string): Vnd | null {
  throw new Error('not implemented');
}
/** 1500000 -> '1.500.000 đ'; compact: '1,5 tr'. */
export function formatVnd(v: Vnd, opts?: { compact?: boolean }): string {
  throw new Error('not implemented');
}

/** Prefixes ' to strings starting with = + - @ TAB CR (m2 BUG-41, m4c B6). */
export function safeSpreadsheetText(value: string): string {
  throw new Error('not implemented');
}
/** RFC 4180 quoting + safeSpreadsheetText + UTF-8 BOM + CRLF. */
export function toCsv<Row>(rows: ReadonlyArray<Row>, columns: ReadonlyArray<CsvColumn<Row>>): Blob {
  throw new Error('not implemented');
}
export interface CsvColumn<Row> {
  header: string;
  value: (row: Row, index: number) => string | number | boolean | null;
}
/** ASCII-safe file name stem, Vietnamese folded, max length. */
export function fileNameStem(s: string, max?: number): string {
  throw new Error('not implemented');
}
