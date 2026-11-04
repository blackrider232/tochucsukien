// Reads a Form answer as a definite RSVP or banquet choice, or as no answer.
// Whole-word phrases on folded text (m4c B23: "no" no longer matches
// "Hanoi"); an opening word decides "Có, không ăn tiệc"; anything unclear is
// null, and null never changes a guest (m4c B21).

import type { RsvpStatus } from '@/core/vocab';
import { hasPhrase, words } from './columns';

const UNSURE = ['co the', 'chua chac', 'chua biet', 'maybe', 'chua xac dinh'];
const SUBSTITUTE = ['cu nguoi di thay', 'nguoi di thay', 'di thay', 'cu dai dien', 'cu can bo', 'substitute'];
const NO = ['khong', 'ban', 'tu choi', 'vang', 'no', 'declined', 'decline', 'cannot', 'xin phep vang'];
const YES = ['co', 'tham du', 'dong y', 'xac nhan', 'chac chan', 'yes', 'attend', 'se tham du', 'tham gia'];

const startsWith = (w: string, list: ReadonlyArray<string>) => list.some((p) => w.startsWith(` ${p} `));
const contains = (w: string, list: ReadonlyArray<string>) => list.some((p) => hasPhrase(w, p));

/** true for yes, false for no, null when empty or unclear. */
export function parseYesNo(raw: string): boolean | null {
  const w = words(raw);
  if (w.trim() === '' || contains(w, UNSURE)) return null;
  if (startsWith(w, NO)) return false;
  if (startsWith(w, YES)) return true;
  const no = contains(w, NO);
  const yes = contains(w, YES) || hasPhrase(w, 'du tiec');
  return no === yes ? (no ? false : null) : yes;
}

export function parseRsvpAnswer(raw: string): Exclude<RsvpStatus, 'pending'> | null {
  const w = words(raw);
  if (w.trim() === '') return null;
  if (contains(w, SUBSTITUTE)) return 'substituted';
  const yes = parseYesNo(raw);
  return yes === null ? null : yes ? 'confirmed' : 'declined';
}
