// Reads a Form answer as a definite RSVP or banquet choice, or as no answer.
// The answer is cut into clauses (at punctuation and "nhưng"). A clause that
// is one of the Form's choice labels ("Có", "Không", "Bận") reads as that
// label. Any other clause is read as whole-word phrases on folded text
// (m4c B23: "no" no longer matches "Hanoi"), longest phrase first. A negation
// ("không", "ko", "chưa thể"…) turns the next phrase of its clause around
// when it stands at most two words before it, and so does "… không được"
// right after it. Every reading that could go either way is no answer: an
// unsure word ("có thể", "nếu", "cố gắng"), a negation too far from its
// phrase, a double negation, a question ("có tham dự không"), or clauses
// that disagree ("Có, Không"). No answer never changes a guest (m4c B21): a
// declined answer frees a seat, so only a clear one may. Folding makes
// "vâng" (yes) and "vắng" (absent) one word, so those two, and "hông" (no),
// are read on the accented text; typed without diacritics they are unclear.

import type { RsvpStatus } from '@/core/vocab';
import { words } from './columns';

type Cue = 'yes' | 'no' | 'unsure' | 'substitute' | 'none';
type Phrase = readonly [words: ReadonlyArray<string>, cue: Cue];

/** Whole clauses, as the Form's choices are written. Single words like "có", "bận" are read only here. */
const LABELS: ReadonlyMap<string, 'yes' | 'no'> = new Map([
  ...['co', 'da co', 'yes', 'y', 'ok', 'dong y', 'xac nhan', 'chac chan', 'tham du', 'co tham du', 'se tham du', 'vâng', 'xin vâng', 'da vâng'].map((l) => [l, 'yes'] as const),
  ...['khong', 'da khong', 'ko', 'kg', 'khg', 'khog', 'hok', 'hông', 'no', 'n', 'ban', 'toi ban', 'em ban', 'ban viec', 'vắng', 'vắng mat', 'vang mat', 'tu choi', 'khong tham du', 'khong co'].map(
    (l) => [l, 'no'] as const,
  ),
]);
/** Politeness at the end of a clause: "Có ạ", "Không nhé". */
const PARTICLES: ReadonlySet<string> = new Set(['a', 'nhe', 'nha', 'nhen', 'ah', 'oi']);

const UNSURE = [
  'co the', 'co le', 'chua chac', 'khong chac', 'not sure', 'chua biet', 'khong biet', 'chua ro', 'chua xac dinh', 'neu', 'co gang', 'can nhac', 'phan van',
  'bao sau', 'bao lai', 'bao lai sau', 'maybe', 'perhaps',
  // Typed plain, these could mean opposite things: vâng/vắng, hông/hồng.
  'vang', 'hong',
  // The one who answers goes in someone's place: whose RSVP that is, a person decides.
  'toi di thay', 'em di thay', 'di thay cho',
];
const RSVP: ReadonlyArray<readonly [string, Cue]> = [
  ...UNSURE.map((p) => [p, 'unsure'] as const),
  ...['cu nguoi di thay', 'cu nguoi thay', 'nguoi di thay', 'di thay', 'nguoi thay', 'cu dai dien', 'cu can bo', 'substitute'].map((p) => [p, 'substitute'] as const),
  // Banquet and organisation words are read, so that their "tham dự" or "có" is not taken for the RSVP.
  ...['tham du tiec', 'du tiec', 'an tiec', 'co quan'].map((p) => [p, 'none'] as const),
  ...['tham du', 'tham gia', 'se den', 'se du', 'di du', 'tu di', 'co mat', 'dong y', 'yes', 'attend', 'attending', 'vâng'].map((p) => [p, 'yes'] as const),
  ...['tu choi', 'vắng', 'vang mat', 'xin phep vang', 'bao vang', 'ban cong tac', 'ban viec', 'ban lich', 'trung lich', 'decline', 'declined'].map((p) => [p, 'no'] as const),
];
const BANQUET: ReadonlyArray<readonly [string, Cue]> = [
  ...UNSURE.map((p) => [p, 'unsure'] as const),
  ...['co quan'].map((p) => [p, 'none'] as const),
  ...['tham du tiec', 'du tiec', 'an tiec', 'tham du', 'tham gia', 'co mat', 'dong y', 'yes', 'attend', 'vâng'].map((p) => [p, 'yes'] as const),
  ...['tu choi', 'vắng', 'vang mat', 'decline'].map((p) => [p, 'no'] as const),
];
/** Words that turn a phrase around, with the shorthand people type ("ko", "k", "khg", "hông"). */
const NEGATIONS = [
  'khong the', 'chua the', 'khong can', 'khong', 'chua', 'chang', 'ko', 'k', 'kg', 'khg', 'kh', 'khog', 'hk', 'hok', 'hông',
  'cannot', 'can t', 'won t', 'will not', 'not', 'unable to',
];
/** How many words may stand between a negation and the phrase it turns around. */
const NEGATION_REACH = 2;

/** Words kept as typed, since folding would make them another word: vâng is yes, vắng is absent, hông is no. */
const ACCENTED: ReadonlySet<string> = new Set(['vâng', 'vắng', 'hông']);
const tokens = (raw: string) =>
  raw
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .flatMap((w) => (ACCENTED.has(w) ? [w] : words(w).trim().split(' ')))
    .filter(Boolean);

/** The answer's clauses: cut at punctuation, and at "nhưng" / "but". */
function clauses(raw: string): string[][] {
  const out: string[][] = [];
  for (const part of raw.split(/[,.;:!?()/\-–—\n]+/)) {
    let clause: string[] = [];
    for (const t of tokens(part)) {
      if (t === 'nhung' || t === 'but') {
        out.push(clause);
        clause = [];
      } else clause.push(t);
    }
    out.push(clause);
  }
  return out.filter((c) => c.length > 0);
}

const longestFirst = (table: ReadonlyArray<readonly [string, Cue]>): ReadonlyArray<Phrase> =>
  table.map(([p, c]) => [p.split(' '), c] as const).sort((a, b) => b[0].length - a[0].length);
const RSVP_PHRASES = longestFirst(RSVP);
const BANQUET_PHRASES = longestFirst(BANQUET);
const NEGATION_WORDS = NEGATIONS.map((n) => n.split(' ')).sort((a, b) => b.length - a.length);

const at = (t: ReadonlyArray<string>, i: number, w: ReadonlyArray<string>) => w.every((x, k) => t[i + k] === x);
const negationAt = (t: ReadonlyArray<string>, i: number) => NEGATION_WORDS.find((n) => at(t, i, n))?.length ?? 0;

interface Hit {
  cue: Cue;
  negated: boolean;
}

/** The phrases of one clause, left to right, each with whether a negation turns it around. */
function scan(t: ReadonlyArray<string>, table: ReadonlyArray<Phrase>): Hit[] {
  const hits: Hit[] = [];
  let negation = null as { end: number; double: boolean } | null;
  for (let i = 0; i < t.length; ) {
    const phrase = table.find(([p]) => at(t, i, p));
    const neg = negationAt(t, i);
    if (!phrase || neg > phrase[0].length) {
      if (neg) negation = { end: i + neg, double: negation?.end === i };
      i += neg || 1;
      continue;
    }
    let end = i + phrase[0].length;
    let negated = false;
    let unsure = phrase[1] === 'unsure';
    if (negation) {
      negated = i - negation.end <= NEGATION_REACH;
      // "không thể không tham dự", or "không … (many words) … tham dự": either reading is a guess.
      if (phrase[1] !== 'none' && (negation.double || !negated)) unsure = true;
      negation = null;
    }
    // After the phrase: "tham dự không được" turns it around; "tham dự không?" / "tham dự được không?" asks.
    const afterDuoc = t[end] === 'duoc' ? negationAt(t, end + 1) : 0;
    const after = negationAt(t, end);
    if (afterDuoc && end + 1 + afterDuoc === t.length) {
      unsure = true;
      end += 1 + afterDuoc;
    } else if (after && t[end + after] === 'duoc') {
      if (negated) unsure = true;
      negated = true;
      end += after + 1;
    } else if (after && end + after === t.length) {
      unsure = true;
      end += after;
    }
    // "không từ chối": a negated no is a guess too.
    hits.push({ cue: unsure || (phrase[1] === 'no' && negated) ? 'unsure' : phrase[1], negated });
    i = end;
  }
  return hits;
}

function read(raw: string, table: ReadonlyArray<Phrase>): { yesNo: boolean | null; substitute: boolean } {
  const hits = clauses(raw).flatMap((c): Hit[] => {
    const end = c.length > 1 && PARTICLES.has(c[c.length - 1]!) ? c.length - 1 : c.length;
    const label = LABELS.get(c.slice(0, end).join(' '));
    return label ? [{ cue: label, negated: false }] : scan(c, table);
  });
  const yes = hits.some((h) => h.cue === 'yes' && !h.negated);
  const no = hits.some((h) => (h.cue === 'yes' && h.negated) || (h.cue === 'no' && !h.negated));
  if (hits.some((h) => h.cue === 'unsure') || (yes && no)) return { yesNo: null, substitute: false };
  return { yesNo: yes === no ? null : yes, substitute: hits.some((h) => h.cue === 'substitute' && !h.negated) };
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
