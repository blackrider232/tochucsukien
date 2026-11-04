// CSV by hand (no dependency): RFC 4180 quoting, a UTF-8 BOM, CRLF/LF/CR rows,
// quoted newlines, and the three delimiters Vietnamese spreadsheets write.
// Cells are always strings, so '0912…' keeps its leading zero (a number type
// would drop it). Writing goes through toCsv from @/core/text, which guards
// formula cells (m4c B6).

import { toCsv, type CsvColumn } from '@/core/text';

export type Delimiter = ',' | ';' | '\t';
export const MAX_CSV_CHARS = 4_000_000;

export interface CsvParse {
  rows: string[][];
  delimiter: Delimiter;
  /** Vietnamese message when the text is not a CSV file we can read, else null. */
  error: string | null;
}

/** The delimiter that splits the first record into the most cells, ignoring quoted text. Comma on a tie. */
export function detectDelimiter(text: string): Delimiter {
  const counts: Record<Delimiter, number> = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted && ch in counts) counts[ch as Delimiter] += 1;
  }
  return counts[';'] > counts[','] && counts[';'] >= counts['\t'] ? ';' : counts['\t'] > counts[','] ? '\t' : ',';
}

/**
 * Records of cells. A BOM is dropped, blank lines are skipped, `""` inside quotes is one quote, a quoted cell may hold
 * the delimiter and line breaks. An unterminated quote is an error rather than one cell that swallows the file.
 */
export function parseCsv(input: string, delimiter?: Delimiter): CsvParse {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const sep = delimiter ?? detectDelimiter(text);
  if (text.length > MAX_CSV_CHARS) return { rows: [], delimiter: sep, error: 'Nội dung CSV quá lớn (tối đa khoảng 4 MB). Hãy tách thành nhiều tệp.' };

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let started = false;
  let line = 1;
  let quoteLine = 1;

  const endCell = () => {
    row.push(cell);
    cell = '';
    started = false;
  };
  const endRow = () => {
    endCell();
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else {
        if (ch === '\n') line += 1;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && !started) {
      quoted = true;
      started = true;
      quoteLine = line;
    } else if (ch === sep) endCell();
    else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      line += 1;
      endRow();
    } else {
      cell += ch;
      started = true;
    }
  }
  if (quoted) return { rows: [], delimiter: sep, error: `Dấu ngoặc kép mở ở dòng ${quoteLine} chưa được đóng. Kiểm tra lại tệp CSV.` };
  if (started || cell !== '' || row.length > 0) endRow();
  return { rows, delimiter: sep, error: null };
}

/** Serialises through toCsv: quoted where needed, formula-looking cells guarded, BOM and CRLF. */
export function serializeCsv<Row>(rows: ReadonlyArray<Row>, columns: ReadonlyArray<CsvColumn<Row>>): Blob {
  return toCsv(rows, columns);
}

/** A cell a spreadsheet guard prefixed with ' (safeSpreadsheetText) is read back without it, so an export re-imports as it was. */
export function unguardCell(value: string): string {
  return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
}
