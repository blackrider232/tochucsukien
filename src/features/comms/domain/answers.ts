// Reads a Form answer as a definite RSVP or banquet choice, or as no answer.
// A whole answer that is one of the Form's choice labels ("Có", "Không",
// "Bận") decides first, then the answer's opening clause ("Có, không ăn
// tiệc"). Otherwise the answer is read as whole-word phrases on folded text
// (m4c B23: "no" no longer matches "Hanoi"), longest phrase first, and a
// phrase right after a negation ("không tham dự", "không cử người đi thay")
// counts as its opposite or not at all. Unsure, or both yes and no, is null,
// and null never changes a guest (m4c B21): a declined answer frees a seat,
// so only a clear one may. Folding makes "vâng" (yes) and "vắng" (absent)
// one word, so those two are read on the accented text, and "vang" typed
// without diacritics is no answer.

import type { RsvpStatus } from '@/core/vocab';
import { words } from './columns';

type Cue = 'yes' | 'no' | 'unsure' | 'substitute' | 'none';

/** Whole answers, as the Form's choices are written. Single words like "có", "bận" are read only here. */
const LABELS: ReadonlyMap<string, 'yes' | 'no'> = new Map([
  ...['co', 'yes', 'y', 'ok', 'dong y', 'xac nhan', 'chac chan', 'tham du', 'co tham du', 'se tham du', 'vâng', 'xin vâng', 'da vâng'].map((l) => [l, 'yes'] as const),
  ...['khong', 'no', 'n', 'ban', 'toi ban', 'em ban', 'ban viec', 'vắng', 'vắng mat', 'vang mat', 'tu choi', 'khong tham du', 'khong co'].map((l) => [l, 'no'] as const),
]);

const UNSURE = ['co the', 'chua chac', 'chua biet', 'chua xac dinh', 'bao sau', 'bao lai sau', 'maybe', 'perhaps', 'not sure', 'vang'];
const RSVP: ReadonlyArray<readonly [string, Cue]> = [
  ...UNSURE.map((p) => [p, 'unsure'] as const),
  ...['cu nguoi di thay', 'nguoi di thay', 'di thay', 'nguoi thay', 'cu dai dien', 'cu can bo', 'substitute'].map((p) => [p, 'substitute'] as const),
  // Banquet and organisation words are read, so that their "tham dự" or "có" is not taken for the RSVP.
  ...['tham du tiec', 'du tiec', 'an tiec', 'co quan'].map((p) => [p, 'none'] as const),
  ...['tham du', 'tham gia', 'se den', 'se du', 'co mat', 'dong y', 'yes', 'attend', 'attending', 'vâng'].map((p) => [p, 'yes'] as const),
  ...['tu choi', 'vắng', 'vang mat', 'xin phep vang', 'bao vang', 'ban cong tac', 'ban viec', 'ban lich', 'trung lich', 'decline', 'declined'].map((p) => [p, 'no'] as const),
];
const BANQUET: ReadonlyArray<readonly [string, Cue]> = [
  ...UNSURE.map((p) => [p, 'unsure'] as const),
  ...['co quan'].map((p) => [p, 'none'] as const),
  ...['tham du tiec', 'du tiec', 'an tiec', 'tham du', 'tham gia', 'co mat', 'dong y', 'yes', 'attend'].map((p) => [p, 'yes'] as const),
  ...['tu choi', 'vắng', 'vang mat', 'decline'].map((p) => [p, 'no'] as const),
];
/** Words that turn the phrase after them around. */
const NEGATIONS = ['khong the', 'chua the', 'khong co', 'khong can', 'khong', 'chua', 'chang', 'cannot', 'can t', 'won t', 'will not', 'not', 'unable to'];

/** Words kept as typed, since folding would make them one: vâng is yes, vắng is absent. */
const ACCENTED: ReadonlySet<string> = new Set(['vâng', 'vắng']);
const tokens = (raw: string) =>
  raw
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .flatMap((w) => (ACCENTED.has(w) ? [w] : words(w).trim().split(' ')))
    .filter(Boolean);
const longestFirst = (table: ReadonlyArray<readonly [string, Cue]>) => [...table].map(([p, c]) => [p.split(' '), c] as const).sort((a, b) => b[0].length - a[0].length);
const RSVP_PHRASES = longestFirst(RSVP);
const BANQUET_PHRASES = longestFirst(BANQUET);
const NEGATION_WORDS = NEGATIONS.map((n) => n.split(' '));

const endsWith = (t: ReadonlyArray<string>, end: number, w: ReadonlyArray<string>) => end >= w.length && w.every((x, i) => t[end - w.length + i] === x);

/** Every phrase of `table` in the answer, scanned left to right, each with whether a negation stands right before it. */
function cues(t: ReadonlyArray<string>, table: ReturnType<typeof longestFirst>) {
  const found: { cue: Cue; negated: boolean }[] = [];
  for (let i = 0; i < t.length; ) {
    const hit = table.find(([p]) => p.every((x, k) => t[i + k] === x));
    if (!hit) {
      i += 1;
      continue;
    }
    found.push({ cue: hit[1], negated: NEGATION_WORDS.some((n) => endsWith(t, i, n)) });
    i += hit[0].length;
  }
  return found;
}

function read(raw: string, table: ReturnType<typeof longestFirst>): { yesNo: boolean | null; substitute: boolean } {
  const all = tokens(raw);
  if (all.length === 0) return { yesNo: null, substitute: false };
  const whole = LABELS.get(all.join(' '));
  if (whole) return { yesNo: whole === 'yes', substitute: false };
  const found = cues(all, table);
  if (found.some((c) => c.cue === 'unsure')) return { yesNo: null, substitute: false };
  const opening = LABELS.get(tokens(raw.split(/[,.;:!?()/\-–—]/)[0] ?? '').join(' '));
  const yes = opening === 'yes' || found.some((c) => c.cue === 'yes' && !c.negated);
  const no = opening === 'no' || found.some((c) => (c.cue === 'yes' && c.negated) || (c.cue === 'no' && !c.negated));
  return { yesNo: yes === no ? null : yes, substitute: found.some((c) => c.cue === 'substitute' && !c.negated) };
}

/** true for yes, false for no, null when empty or unclear (a banquet answer). */
export function parseYesNo(raw: string): boolean | null {
  return read(raw, BANQUET_PHRASES).yesNo;
}

export function parseRsvpAnswer(raw: string): Exclude<RsvpStatus, 'pending'> | null {
  const { yesNo, substitute } = read(raw, RSVP_PHRASES);
  if (substitute) return 'substituted';
  return yesNo === null ? null : yesNo ? 'confirmed' : 'declined';
}
