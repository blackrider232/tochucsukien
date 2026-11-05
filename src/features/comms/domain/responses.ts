// One sheet row as a typed response. Answers are untrusted public input: they
// are kept as data, rendered as React text, and only a definite answer is
// ever applied (m4a B01, m4c B1, B21).

import type { Email, Instant, IsoDate } from '@/core/brand';
import { combineVN, parseHHmm, parseInstant, parseIsoDate } from '@/core/dates';
import { parseEmail } from '@/core/text';
import { normalizeAnswer, parseYesNo, readRsvpAnswer, type AnswerLabels, type AnswerStatus, type RsvpReading } from './answers';
import { FORM_FIELDS, type ColumnMap, type FormField } from './columns';

export interface ParsedResponse {
  /**
   * Who answered when, joined with a unit separator; its hash is the response's identity (contract rowHash). Only
   * the timestamp and the identifying answers count, so a column added to the sheet or a corrected answer does not
   * make every row a new response. Without a timestamp, the answers count too.
   */
  rowKey: string;
  respondedAt: Instant | null;
  name: string;
  organization: string;
  title: string;
  email: Email | null;
  phone: string;
  /** The RSVP cell as typed. */
  rsvpAnswer: string;
  /** How it reads with the Form's labels: 'empty' too when the sheet has no RSVP column. */
  rsvp: RsvpReading;
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

export type DateOrder = 'dmy' | 'mdy';
const SLASH_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;

/** A response cannot come from the future; allow for a few minutes of clock skew between Google and the server. */
const FUTURE_SKEW_MS = 10 * 60_000;
/** A sheet is synced while its answers come in (every few minutes with auto-sync): its newest answer is recent. */
const RECENT_MS = 7 * 86_400_000;

/**
 * Google Forms writes every timestamp of a sheet in its owner's locale: 'dd/mm/yyyy hh:mm:ss' in a Vietnamese sheet,
 * 'mm/dd/yyyy' in a US one, and appends the rows in the order the answers came. So the sheet's order is the reading
 * that can read every date; when both can, the one that puts none in the future; when both still can, the only one
 * whose times go one way (forward, or back for a sheet sorted newest first) and whose newest answer is recent. A sheet
 * sorted as text ("01/11", "02/10", "03/11") goes one way only when read the wrong way, and is not recent that way, so
 * both tests must agree. When the
 * rows cannot tell, null: no slash date is then read, and the responses wait for review.
 */
export function detectDateOrder(cells: ReadonlyArray<string>, now: Instant): DateOrder | null {
  const dates = cells.map((c) => c.trim()).filter((c) => SLASH_DATE.test(c) && (readTimestamp(c, 'dmy') || readTimestamp(c, 'mdy')));
  const readings = (['dmy', 'mdy'] as const)
    .map((order) => ({ order, times: dates.map((c) => readTimestamp(c, order)) }))
    .filter((r) => r.times.every((t) => t !== null))
    .map((r) => ({ order: r.order, times: r.times.map((t) => Date.parse(t!)) }));
  if (dates.length === 0 || (readings.length === 2 && readings[0]!.times.every((t, i) => t === readings[1]!.times[i]))) return 'dmy';
  if (readings.length < 2) return readings[0]?.order ?? null;
  const past = readings.filter((r) => r.times.every((t) => t <= Date.parse(now) + FUTURE_SKEW_MS));
  if (past.length < 2) return past[0]?.order ?? null;
  const oneWay = (times: ReadonlyArray<number>) => times.every((t, i) => i === 0 || t >= times[i - 1]!) || times.every((t, i) => i === 0 || t <= times[i - 1]!);
  const settled = past.filter((r) => oneWay(r.times) && Date.parse(now) - Math.max(...r.times) <= RECENT_MS);
  return settled.length === 1 ? settled[0]!.order : null;
}

/**
 * A sheet timestamp, or an ISO instant through the API. The wall clock is read as Hà Nội time (the sheet's time zone
 * is not in the CSV). An unreadable time, a slash date when the sheet's order is unknown (null), or a time after `now`
 * (a day and month read the wrong way round) is null: the response is then kept for review and never applied on its own.
 */
export function parseSheetTimestamp(raw: string, o: { order?: DateOrder | null; now?: Instant } = {}): Instant | null {
  if (o.order === null && SLASH_DATE.test(raw.trim())) return null;
  const at = readTimestamp(raw, o.order ?? 'dmy');
  return at && o.now && Date.parse(at) > Date.parse(o.now) + FUTURE_SKEW_MS ? null : at;
}

function readTimestamp(raw: string, order: DateOrder): Instant | null {
  const s = raw.trim();
  if (!s) return null;
  const iso = /^\d{4}-\d{2}-\d{2}T/.test(s) ? parseInstant(s) : null;
  if (iso) return iso;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s) ?? /^(\d{4})-(\d{2})-(\d{2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (!m) return null;
  const [d, mo, y] = !s.includes('/') ? [m[3], m[2], m[1]] : order === 'mdy' ? [m[2], m[1], m[3]] : [m[1], m[2], m[3]];
  const date = parseIsoDate(`${y}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`) as IsoDate | null;
  if (!date) return null;
  const hhmm = parseHHmm(`${(m[4] ?? '0').padStart(2, '0')}:${m[5] ?? '00'}`);
  if (!hhmm) return null;
  const base = Date.parse(combineVN(date, hhmm));
  return parseInstant(new Date(base + Number(m[6] ?? 0) * 1000).toISOString());
}

export function parseResponseRow(
  headers: ReadonlyArray<string>,
  row: ReadonlyArray<string>,
  map: ColumnMap,
  time: { order?: DateOrder | null; now?: Instant } = {},
  labels: AnswerLabels = {},
): ParsedResponse | null {
  const get = (f: FormField) => cellOf(row, map, f);
  const name = get('name');
  const email = parseEmail(get('email'));
  const phone = get('phone');
  if (!name && !email && !phone) return null;
  const rawRsvp = get('rsvp');
  const rawBanquet = get('banquet');
  const raw = Object.fromEntries(headers.map((h, i) => [h || `Cột ${i + 1}`, (row[i] ?? '').trim().slice(0, MAX_CELL)]));
  return {
    rowKey: [get('timestamp'), email ?? '', phone, name, ...(get('timestamp') ? [] : [rawRsvp, rawBanquet, get('substitute'), get('notes')])].join('\u001f'),
    respondedAt: parseSheetTimestamp(get('timestamp'), time),
    name,
    organization: get('organization'),
    title: get('title'),
    email,
    phone,
    rsvpAnswer: rawRsvp,
    rsvp: readRsvpAnswer(rawRsvp, labels),
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

const ANSWER_STATUSES: ReadonlySet<string> = new Set<AnswerStatus>(['confirmed', 'declined', 'substituted']);

/** Saved Form labels from the database: each key normalised again, only the three answers, at most 50. */
export function parseAnswerLabels(raw: unknown): AnswerLabels {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, AnswerStatus> = {};
  for (const [label, status] of Object.entries(raw as Record<string, unknown>).slice(0, 50)) {
    const key = normalizeAnswer(label);
    if (key && key.length <= 200 && typeof status === 'string' && ANSWER_STATUSES.has(status)) out[key] = status as AnswerStatus;
  }
  return out;
}
