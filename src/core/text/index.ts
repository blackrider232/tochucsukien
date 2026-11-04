// Text, HTML, money and file-safety helpers. React escapes by default; these
// exist only for the few places where a string leaves React: Word/print HTML,
// email bodies, CSV cells, rich-text templates.

import DOMPurify from 'isomorphic-dompurify';
import type { Email, SafeUrl, SanitizedHtml, Vnd } from '@/core/brand';

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

/** Vietnamese tone folding + lowercase + whitespace collapse. The one search normalizer. */
export function foldVi(s: string): string {
  return stripDiacritics(s).toLowerCase().replace(/\s+/g, ' ').trim();
}
/** Every token of the folded query appears in the folded haystack. */
export function matchesQuery(query: string, ...haystack: ReadonlyArray<string | null | undefined>): boolean {
  const tokens = foldVi(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = foldVi(haystack.filter((h): h is string => typeof h === 'string').join(' '));
  return tokens.every((t) => hay.includes(t));
}

const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes & < > " ' . null/undefined -> ''. 0 and false render as '0' / 'false' (core B28). */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

// A SanitizedHtml brand vanishes at runtime, so html`` remembers which strings
// it or sanitizeRichHtml produced. A string equal to one of them is safe by
// construction; the cap bounds memory in long sessions.
const trusted = new Set<string>();
const TRUSTED_CAP = 5000;
function trust(s: string): SanitizedHtml {
  if (trusted.size >= TRUSTED_CAP) trusted.delete(trusted.values().next().value as string);
  trusted.add(s);
  return s as SanitizedHtml;
}
function interpolate(value: unknown): string {
  if (Array.isArray(value)) return value.map(interpolate).join('');
  if (typeof value === 'string' && trusted.has(value)) return value;
  return escapeHtml(value);
}

/** Tagged template for export HTML: interpolations are escaped unless already SanitizedHtml. */
export function html(strings: TemplateStringsArray, ...values: ReadonlyArray<unknown>): SanitizedHtml {
  let out = strings[0] ?? '';
  values.forEach((v, i) => {
    out += interpolate(v) + (strings[i + 1] ?? '');
  });
  return trust(out);
}

const RICH_TAGS = [
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'sub', 'sup', 'span', 'div', 'font',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'hr', 'a',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col', 'caption',
];
const RICH_ATTRS = [
  'style', 'class', 'align', 'valign', 'colspan', 'rowspan', 'width', 'height', 'border',
  'cellpadding', 'cellspacing', 'href', 'target', 'rel', 'title', 'color', 'face', 'size',
];
// Inline CSS is an allowlist: text, box and table styling only, nothing that places, transforms or loads.
const STYLE_PROPERTIES = new Set([
  'color', 'background-color', 'background', 'font-family', 'font-size', 'font-style', 'font-weight', 'font-variant',
  'line-height', 'letter-spacing', 'word-spacing', 'white-space', 'text-align', 'text-indent', 'text-transform',
  'text-decoration', 'text-decoration-line', 'text-decoration-style', 'text-decoration-color', 'vertical-align',
  'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height', 'border-collapse', 'border-spacing',
  'border-radius', 'list-style-type', 'page-break-before', 'page-break-after', 'page-break-inside',
  'break-before', 'break-after', 'break-inside',
]);
const BOX_PROPERTY = /^(?:(?:margin|padding)(?:-(?:top|right|bottom|left))?|border(?:-(?:top|right|bottom|left))?(?:-(?:width|style|color))?)$/;
// Colour functions are the only functions; any other `name(` (url, image-set, expression, var…) fails the charset.
const COLOR_FUNCTION = /\b(?:rgba?|hsla?)\(\s*[\d.%\s,/]+\)/gi;
const STYLE_VALUE = /^[a-z0-9#%.,\s'"-]+$/i;
// Abuse that places nothing but still hides or swamps the text around it.
const NEGATIVE = /(?:^|[\s,(])-\s*\.?\d/;
/** Readable font sizes per unit, [min, max]; a keyword (larger, x-large) is always readable. */
const FONT_SIZE: Readonly<Record<string, readonly [number, number]>> = {
  px: [6, 96], pt: [5, 72], pc: [0.4, 6], em: [0.4, 6], rem: [0.4, 6], '%': [40, 600], mm: [2, 25], cm: [0.2, 2.5], in: [0.08, 1],
};
function readableFontSize(value: string): boolean {
  if (/^[a-z-]+$/i.test(value)) return true;
  const m = /^(\d*\.?\d+)\s*([a-z%]+)$/i.exec(value);
  const range = m ? FONT_SIZE[m[2]!.toLowerCase()] : undefined;
  return range !== undefined && Number(m![1]) >= range[0] && Number(m![1]) <= range[1];
}
/** CSS px per unit, an em counted at 16 px. Any other unit (vw, cqw, Q…) is refused. */
const PX_PER: Readonly<Record<string, number>> = { px: 1, pt: 4 / 3, pc: 16, em: 16, rem: 16, ex: 8, ch: 8, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 };
/**
 * The largest length each property may take: in px, as a percentage, and as a plain number. A4 is about 1123 px tall.
 * `zero: false` refuses a collapsed box. A property not listed may hold no number at all.
 */
interface LengthLimit { px: number; pct: number; plain: number; zero: boolean }
const limit = (px: number, pct = 0, plain = 0, zero = true): LengthLimit => ({ px, pct, plain, zero });
const BOX = limit(1200, 100, 0, false);
const LENGTH_LIMITS: Readonly<Record<string, LengthLimit>> = {
  'text-indent': limit(160, 50),
  'letter-spacing': limit(16),
  'word-spacing': limit(16),
  'line-height': limit(96, 400, 4),
  width: BOX, height: BOX, 'max-width': BOX, 'max-height': BOX,
  'min-width': limit(1200, 100), 'min-height': limit(1200, 100),
  'border-radius': limit(200, 50),
  'border-spacing': limit(16),
  'vertical-align': limit(32, 100),
  'font-weight': limit(0, 0, 1000),
};
const SPACING = limit(200, 50);
const BORDER_WIDTH = limit(16);
function lengthLimitOf(property: string): LengthLimit | undefined {
  if (/^(?:margin|padding)/.test(property)) return SPACING;
  if (/^border(?:-(?:top|right|bottom|left))?(?:-width)?$/.test(property)) return BORDER_WIDTH;
  return LENGTH_LIMITS[property];
}
/** Every number in the value has a known unit and stays within the property's limit. */
function boundedLengths(property: string, value: string): boolean {
  if (property === 'font-size') return readableFontSize(value);
  const bound = lengthLimitOf(property);
  const numbers = value.replace(COLOR_FUNCTION, ' ').replace(HEX_COLOR, ' ').replace(/'[^']*'|"[^"]*"/g, ' ').matchAll(/(\d*\.?\d+)([a-z%]*)/gi);
  return [...numbers].every(([, digits = '', rawUnit = '']) => {
    const n = Number(digits);
    const unit = rawUnit.toLowerCase();
    if (!bound) return false;
    if (n === 0 && (unit === '' || unit in PX_PER || unit === '%')) return bound.zero;
    if (unit === '') return n <= bound.plain;
    if (unit === '%') return n <= bound.pct;
    const px = PX_PER[unit];
    return px !== undefined && n * px <= bound.px;
  });
}
const HEX_COLOR = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi;
/** Text, an underline or a border drawn in no colour, or nearly none. */
function invisibleColor(value: string): boolean {
  if (/\btransparent\b/i.test(value)) return true;
  const hexAlpha = [...value.matchAll(HEX_COLOR)].some(([hex]) => {
    const digits = hex.slice(1);
    if (digits.length === 4) return parseInt(digits[3]!.repeat(2), 16) / 255 < 0.2;
    return digits.length === 8 && parseInt(digits.slice(6), 16) / 255 < 0.2;
  });
  return hexAlpha || [...value.matchAll(/\b(?:rgba?|hsla?)\(([^)]*)\)/gi)].some(([, args = '']) => {
    const alpha = args.includes('/') ? args.split('/')[1] : args.split(',')[3];
    if (alpha === undefined) return false;
    const a = parseFloat(alpha);
    return (alpha.trim().endsWith('%') ? a / 100 : a) < 0.2;
  });
}
const DRAWN_IN_COLOR = /^(?:color|text-decoration-color|border(?:-(?:top|right|bottom|left))?(?:-color)?)$/;

/** The declarations of `style` that pass, verbatim when all of them do; null when none does. */
function safeStyle(style: string): string | null {
  // Escapes, comments and at-rules can spell anything; such a style is dropped whole.
  if (/[\\@<>{}!]|\/\*/.test(style)) return null;
  const declarations = style.split(';').map((d) => d.trim()).filter(Boolean);
  const kept = declarations.flatMap((d) => {
    const colon = d.indexOf(':');
    const property = d.slice(0, colon).trim().toLowerCase();
    const value = d.slice(colon + 1).trim();
    const allowed = colon > 0 && value !== '' && (STYLE_PROPERTIES.has(property) || BOX_PROPERTY.test(property))
      && STYLE_VALUE.test(value.replace(COLOR_FUNCTION, '0'))
      // A negative margin pulls the block over the content before it; a negative indent or spacing hides text.
      && !(property.startsWith('margin') && /-\s*\.?\d/.test(value)) && !NEGATIVE.test(value)
      && boundedLengths(property, value)
      && !(DRAWN_IN_COLOR.test(property) && invisibleColor(value));
    return allowed ? [`${property}:${value}`] : [];
  });
  if (kept.length === 0) return null;
  return kept.length === declarations.length ? style : kept.join(';');
}

let hooksInstalled = false;
function installHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const style = node.getAttribute?.('style');
    if (style !== null && style !== undefined) {
      const safe = safeStyle(style);
      if (safe === null) node.removeAttribute('style');
      else if (safe !== style) node.setAttribute('style', safe);
    }
    // The app's utility classes (fixed, inset-0, z-50…) would apply to rendered HTML; only template classes may.
    const classes = node.getAttribute?.('class');
    if (classes !== null && classes !== undefined) {
      const own = classes.split(/\s+/).filter((c) => /^tpl-[a-z0-9-]+$/.test(c));
      if (own.length === 0) node.removeAttribute('class');
      else if (own.join(' ') !== classes) node.setAttribute('class', own.join(' '));
    }
    if (node.tagName === 'A' && node.getAttribute('target')) node.setAttribute('rel', 'noopener noreferrer');
  });
}

/**
 * DOMPurify with an allowlist sized for NĐ30 documents and email bodies:
 * tables, inline text styles, alignment, no scripts, no event handlers, no
 * javascript:/data: URLs (m3 B02, m4a B03). Runs on save AND on render.
 */
export function sanitizeRichHtml(input: string): SanitizedHtml {
  installHooks();
  const clean = DOMPurify.sanitize(input, {
    ALLOWED_TAGS: RICH_TAGS,
    ALLOWED_ATTR: RICH_ATTRS,
    // DOMPurify tests every non-style attribute value against this, so scheme-less values must pass.
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    ALLOW_DATA_ATTR: false,
  });
  return trust(clean);
}

export function parseEmail(raw: unknown): Email | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  if (s.length > 254) return null;
  return /^[^\s@<>()[\]",;:\\]+@[^\s@<>()[\]",;:\\]+\.[a-z]{2,}$/.test(s) ? (s as Email) : null;
}
export function parseSafeUrl(raw: unknown): SafeUrl | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? (url.href as SafeUrl) : null;
  } catch {
    return null;
  }
}
/** Digits only, VN mobile/landline lengths; keeps the display form separately. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('84') && (digits.length === 11 || digits.length === 12)) return `0${digits.slice(2)}`;
  return digits;
}

/** '1.500.000' -> 1500000; '1.500.000,50' -> null (no fractional dong); 'abc' -> null (m6 BUG-34). */
export function parseVnd(raw: string): Vnd | null {
  const s = raw.trim().replace(/\s*(?:đ|₫|vnđ|vnd|đồng)\s*$/i, '').trim();
  const m = /^(\d{1,3}(?:([.,\s])\d{3})?(?:\2\d{3})*|\d+)(?:,(\d+))?$/.exec(s);
  if (!m || m[1] === undefined) return null;
  const [whole, sep, fraction] = [m[1], m[2], m[3]];
  if (sep === ',' && fraction !== undefined) return null;
  if (fraction !== undefined && !/^0+$/.test(fraction)) return null;
  const n = Number(whole.replace(/[.,\s]/g, ''));
  return Number.isSafeInteger(n) ? (n as Vnd) : null;
}
/** 1500000 -> '1.500.000 đ'; compact: '1,5 tr'. */
export function formatVnd(v: Vnd, opts?: { compact?: boolean }): string {
  if (opts?.compact) {
    const abs = Math.abs(v);
    if (abs >= 1e9) return `${decimalVi(v / 1e9)} tỷ`;
    if (abs >= 1e6) return `${decimalVi(v / 1e6)} tr`;
  }
  return `${groupThousands(Math.round(v))} đ`;
}
function groupThousands(n: number): string {
  const sign = n < 0 ? '-' : '';
  return sign + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function decimalVi(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  const [int, frac] = String(rounded).split('.');
  return frac ? `${groupThousands(Number(int))},${frac}` : groupThousands(Number(int));
}

/** Prefixes ' to strings starting with = + - @ TAB CR (m2 BUG-41, m4c B6). */
export function safeSpreadsheetText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}
/** RFC 4180 quoting + safeSpreadsheetText + UTF-8 BOM + CRLF. */
export function toCsv<Row>(rows: ReadonlyArray<Row>, columns: ReadonlyArray<CsvColumn<Row>>): Blob {
  const lines = [
    columns.map((c) => csvCell(c.header)).join(','),
    ...rows.map((row, i) => columns.map((c) => csvCell(c.value(row, i))).join(',')),
  ];
  return new Blob([`﻿${lines.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' });
}
function csvCell(value: string | number | boolean | null): string {
  if (value === null) return '';
  const text = typeof value === 'string' ? safeSpreadsheetText(value) : String(value);
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
export interface CsvColumn<Row> {
  header: string;
  value: (row: Row, index: number) => string | number | boolean | null;
}
/** ASCII-safe file name stem, Vietnamese folded, max length. */
export function fileNameStem(s: string, max = 80): string {
  const stem = stripDiacritics(s)
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, max)
    .replace(/_+$/, '');
  return stem || 'file';
}
