// Reads a Form answer conservatively. An RSVP answer changes a guest only when,
// as a whole, it is one of the Form's own choice labels (saved per event) or one
// of a short list of canonical answers ("Có", "Không tham dự", "Cử người đi
// thay"). Any other answer is 'review': a person reads it on the Form screen
// and decides. A declined answer frees a seat, so no sentence is read for its
// meaning (m4c B21, B23). Three rounds of phrase rules each read new phrasings
// wrongly; a whole-answer list cannot.
//
// Before the lookup an answer is put in NFC, lower case, old-style tone marks
// ("uỷ" is "ủy"), single spaces, and loses the particles and full stops at its
// end ("Có ạ.", "Không nhé!"). A question mark stays, so "Không?" is review.
// Typed without diacritics, an answer is looked up in the plain forms of the
// list, except those with "vang", which is vâng (yes) or vắng (absent). The
// shorthand "ko", "k", "hok", "khg" stands for "không" inside a listed answer,
// but a bare "k" is review: it is "ok" too.

import type { RsvpStatus } from '@/core/vocab';
import { words } from './columns';

export type AnswerStatus = Exclude<RsvpStatus, 'pending'>;
/** What the RSVP cell says: an answer to apply, one for a person to read, or nothing at all. */
export type RsvpReading = AnswerStatus | 'review' | 'empty';
/** The Form's choice labels, each normalised (normalizeAnswer), with what it means. */
export type AnswerLabels = Readonly<Record<string, AnswerStatus>>;

export const CANONICAL_ANSWERS: { readonly [S in AnswerStatus]: ReadonlyArray<string> } = {
  confirmed: ['có', 'vâng', 'dạ', 'dạ có', 'dạ vâng', 'xin vâng', 'xác nhận', 'tham dự', 'sẽ tham dự', 'có tham dự', 'xác nhận tham dự', 'xin xác nhận tham dự', 'tôi sẽ tham dự', 'tôi tham dự'],
  declined: [
    'không', 'dạ không', 'không tham dự', 'không thể tham dự', 'không tham dự được', 'tôi không tham dự', 'tôi không thể tham dự', 'xin vắng', 'xin phép vắng', 'vắng mặt',
    'xin vắng mặt', 'xin phép vắng mặt', 'từ chối',
  ],
  substituted: ['cử người thay', 'cử người đi thay', 'sẽ cử người đi thay', 'cử đại diện', 'cử đại diện tham dự', 'ủy quyền'],
};

const BANQUET_ANSWERS: { readonly yes: ReadonlyArray<string>; readonly no: ReadonlyArray<string> } = {
  yes: ['có', 'vâng', 'dạ có', 'có dự tiệc', 'dự tiệc', 'có tham dự tiệc', 'tham dự tiệc', 'tham dự', 'có tham dự'],
  no: ['không', 'dạ không', 'không dự tiệc', 'không tham dự tiệc', 'không tham dự'],
};

const PARTICLES = ['ạ', 'a', 'nhé', 'nhe', 'nha', 'nhen', 'ah', 'ạh', 'à'];
const SHORTHAND_NO = ['ko', 'k', 'hok', 'khg'];
/** New-style tone placement to the old style the lists are written in (ui-rules 18). */
const OLD_STYLE: ReadonlyArray<readonly [RegExp, string]> = [
  [/uỳ/g, 'ùy'], [/uý/g, 'úy'], [/uỷ/g, 'ủy'], [/uỹ/g, 'ũy'], [/uỵ/g, 'ụy'],
  [/oà/g, 'òa'], [/oá/g, 'óa'], [/oả/g, 'ỏa'], [/oã/g, 'õa'], [/oạ/g, 'ọa'],
  [/oè/g, 'òe'], [/oé/g, 'óe'], [/oẻ/g, 'ỏe'], [/oẽ/g, 'õe'], [/oẹ/g, 'ọe'],
];
const TRAILING = new RegExp(`(?:\\s*[.!…]+|\\s+(?:${PARTICLES.join('|')}))+$`, 'u');

/** An answer as the lists compare it: NFC, lower case, old-style marks, single spaces, no trailing particle or full stop. */
export function normalizeAnswer(raw: string): string {
  let s = raw.normalize('NFC').toLowerCase();
  for (const [from, to] of OLD_STYLE) s = s.replace(from, to);
  s = s.replace(/\s+/g, ' ').trim();
  if (PARTICLES.includes(s)) return s;
  return s.replace(TRAILING, '').trim();
}

const fold = (s: string) => words(s).trim();
const isPlain = (s: string) => fold(s) === s;
/** Folded, these words are two answers (vâng is yes, vắng is absent), so a plain-typed answer with them is review. */
const AMBIGUOUS_PLAIN = new Set(['vang']);

function lookup<V>(table: ReadonlyArray<readonly [string, V]>): { accented: ReadonlyMap<string, V>; plain: ReadonlyMap<string, V> } {
  const accented = new Map<string, V>();
  for (const [text, v] of table) {
    const forms = [text, ...(text.split(' ').includes('không') ? SHORTHAND_NO.map((k) => text.split(' ').map((w) => (w === 'không' ? k : w)).join(' ')) : [])];
    // A bare "k" is "ok" as often as it is "không".
    for (const f of forms) if (f !== 'k') accented.set(f, v);
  }
  const plain = new Map<string, V>();
  for (const [text, v] of accented) {
    const key = fold(text);
    if (key === 'da' || key.split(' ').some((w) => AMBIGUOUS_PLAIN.has(w))) continue;
    plain.set(key, v);
  }
  return { accented, plain };
}

const read = <V>(t: ReturnType<typeof lookup<V>>, n: string): V | undefined => t.accented.get(n) ?? (isPlain(n) ? t.plain.get(n) : undefined);

const RSVP = lookup<AnswerStatus>((Object.keys(CANONICAL_ANSWERS) as AnswerStatus[]).flatMap((s) => CANONICAL_ANSWERS[s].map((a) => [a, s] as const)));
const BANQUET = lookup<boolean>([...BANQUET_ANSWERS.yes.map((a) => [a, true] as const), ...BANQUET_ANSWERS.no.map((a) => [a, false] as const)]);

/** The RSVP cell: a Form label (by identity) or a canonical answer applies; anything else is review. */
export function readRsvpAnswer(raw: string, labels: AnswerLabels = {}): RsvpReading {
  if (!raw.trim()) return 'empty';
  const n = normalizeAnswer(raw);
  return (Object.hasOwn(labels, n) ? labels[n] : undefined) ?? read(RSVP, n) ?? 'review';
}

/** The banquet cell: true or false for a canonical whole answer, null for anything else (the guest's banquet is left as is). */
export function parseYesNo(raw: string): boolean | null {
  const n = normalizeAnswer(raw);
  return n ? (read(BANQUET, n) ?? null) : null;
}

/** What people put in the substitute column to say there is none. */
const NO_SUBSTITUTE: ReadonlySet<string> = new Set([
  '', 'khong', 'ko', 'k', 'kg', 'khg', 'khong co', 'khong co ai', 'khong ai', 'khong ai ca', 'khong cu', 'khong co nguoi di thay', 'khong co nguoi thay', 'chua co', 'khong ro',
  'tu di', 'none', 'no', 'n a', 'na', 'x', '0',
]);

/** The substitute's name as typed, or '' when the cell says there is none ("Không", "-", "n/a", "Tự đi"). */
export function substituteName(raw: string): string {
  const name = raw.trim();
  return NO_SUBSTITUTE.has(words(name).trim()) ? '' : name;
}
