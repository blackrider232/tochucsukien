// One sheet row as a typed response. Answers are untrusted public input: they
// are kept as data, rendered as React text, and only a definite answer is
// ever applied (m4a B01, m4c B1, B21).

import type { Email, Instant, IsoDate } from '@/core/brand';
import { combineVN, parseHHmm, parseInstant, parseIsoDate } from '@/core/dates';
import { parseEmail } from '@/core/text';
import type { RsvpStatus } from '@/core/vocab';
import { parseRsvpAnswer, parseYesNo } from './answers';
import { FORM_FIELDS, type ColumnMap, type FormField } from './columns';

export interface ParsedResponse {
  /** The row's cells joined with a unit separator; its hash is the response's identity (contract rowHash). */
  rowKey: string;
  respondedAt: Instant | null;
  name: string;
  organization: string;
  title: string;
  email: Email | null;
  phone: string;
  rsvp: Exclude<RsvpStatus, 'pending'> | null;
  hasBanquet: boolean | null;
  substitute: string;
  notes: string;
  /** Header -> cell, as the sheet had it. */
  raw: Readonly<Record<string, string>>;
}

const MAX_CELL = 2000;
const cellOf = (row: ReadonlyArray<string>, map: ColumnMap, f: FormField) => {
  const i = map[f];
  return i === undefined ? '' : (row[i] ?? '').trim().slice(0, MAX_CELL);
};

/**
 * Google Forms writes 'dd/mm/yyyy hh:mm:ss' in a Vietnamese sheet and an ISO instant through the API. The wall clock
 * is read as Hà Nội time (the sheet's time zone is not in the CSV). Anything else is null: the response is then kept
 * for review and never applied on its own.
 */
export function parseSheetTimestamp(raw: string): Instant | null {
  const s = raw.trim();
  if (!s) return null;
  const iso = /^\d{4}-\d{2}-\d{2}T/.test(s) ? parseInstant(s) : null;
  if (iso) return iso;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s) ?? /^(\d{4})-(\d{2})-(\d{2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (!m) return null;
  const [d, mo, y] = s.includes('/') ? [m[1], m[2], m[3]] : [m[3], m[2], m[1]];
  const date = parseIsoDate(`${y}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`) as IsoDate | null;
  if (!date) return null;
  const hhmm = parseHHmm(`${(m[4] ?? '0').padStart(2, '0')}:${m[5] ?? '00'}`);
  if (!hhmm) return null;
  const base = Date.parse(combineVN(date, hhmm));
  return parseInstant(new Date(base + Number(m[6] ?? 0) * 1000).toISOString());
}

export function parseResponseRow(headers: ReadonlyArray<string>, row: ReadonlyArray<string>, map: ColumnMap): ParsedResponse | null {
  const get = (f: FormField) => cellOf(row, map, f);
  const name = get('name');
  const email = parseEmail(get('email'));
  const phone = get('phone');
  if (!name && !email && !phone) return null;
  const rawRsvp = get('rsvp');
  const rawBanquet = get('banquet');
  const raw = Object.fromEntries(headers.map((h, i) => [h || `Cột ${i + 1}`, (row[i] ?? '').trim().slice(0, MAX_CELL)]));
  return {
    rowKey: row.map((c) => c.trim()).join('\u001f'),
    respondedAt: parseSheetTimestamp(get('timestamp')),
    name,
    organization: get('organization'),
    title: get('title'),
    email,
    phone,
    rsvp: map.rsvp === undefined ? null : parseRsvpAnswer(rawRsvp),
    hasBanquet: map.banquet === undefined ? null : parseYesNo(rawBanquet),
    substitute: get('substitute'),
    notes: get('notes'),
    raw,
  };
}

/** A saved map from the database: only known fields, only non-negative integer columns. */
export function parseColumnMap(raw: unknown): ColumnMap | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: ColumnMap = {};
  for (const f of FORM_FIELDS) {
    const v = (raw as Record<string, unknown>)[f];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 200) out[f] = v;
  }
  return out;
}
