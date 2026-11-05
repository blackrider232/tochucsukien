// Typed or pasted recipient lists: "a@x.vn; Nguyễn An <an@y.vn>\n"Trần, B" <b@z.vn>".
// A tokenizer, not a regex built from the input (m4c B40), and every address
// goes through the shared parseEmail (m4a B04).

import type { Email } from '@/core/brand';
import { parseEmail } from '@/core/text';

export interface ParsedRecipient {
  email: Email;
  /** The display name typed before <address>, or ''. */
  name: string;
}
export interface RecipientList {
  valid: ReadonlyArray<ParsedRecipient>;
  /** Pieces that are not an address, as typed, for the error message. */
  invalid: ReadonlyArray<string>;
  /** Addresses that appeared more than once; only the first is kept (m4a B31). */
  duplicates: ReadonlyArray<Email>;
}

/** Splits on , ; and newlines outside double quotes and angle brackets. */
function pieces(text: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  let angle = false;
  for (const ch of text) {
    if (ch === '"' && !angle) quoted = !quoted;
    else if (ch === '<' && !quoted) angle = true;
    else if (ch === '>' && !quoted) angle = false;
    if (!quoted && !angle && (ch === ',' || ch === ';' || ch === '\n' || ch === '\r')) {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out.map((p) => p.trim()).filter(Boolean);
}

function parsePiece(piece: string): ParsedRecipient | null {
  const open = piece.lastIndexOf('<');
  if (open >= 0 && piece.endsWith('>')) {
    const email = parseEmail(piece.slice(open + 1, -1));
    if (!email) return null;
    const name = piece.slice(0, open).trim().replace(/^"(.*)"$/s, '$1').replace(/\\"/g, '"').replace(/\s+/g, ' ').trim();
    return { email, name };
  }
  const email = parseEmail(piece);
  return email ? { email, name: '' } : null;
}

export function parseRecipientList(text: string): RecipientList {
  const valid: ParsedRecipient[] = [];
  const invalid: string[] = [];
  const duplicates: Email[] = [];
  const seen = new Set<string>();
  for (const piece of pieces(text)) {
    const r = parsePiece(piece);
    if (!r) {
      invalid.push(piece);
    } else if (seen.has(r.email)) {
      duplicates.push(r.email);
    } else {
      seen.add(r.email);
      valid.push(r);
    }
  }
  return { valid, invalid, duplicates };
}

/** The part before '@', for a recipient typed without a name. */
export const localPart = (email: Email) => email.slice(0, email.indexOf('@'));
