// RFC 4180 reader for the Google Sheet export: quoted cells with commas,
// doubled quotes and line breaks, CRLF / LF / CR rows, a UTF-8 BOM. Cells
// stay strings, so '0912…' keeps its leading zero (m4a B58).

export class CsvError extends Error {}

export const MAX_CSV_ROWS = 20_000;
export const MAX_CSV_COLUMNS = 200;

export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let wasQuoted = false;
  const endCell = () => {
    row.push(wasQuoted ? cell : cell.trim());
    if (row.length > MAX_CSV_COLUMNS) throw new CsvError(`Bảng có quá ${MAX_CSV_COLUMNS} cột.`);
    cell = '';
    wasQuoted = false;
  };
  const endRow = () => {
    endCell();
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    if (rows.length > MAX_CSV_ROWS) throw new CsvError(`Bảng có quá ${MAX_CSV_ROWS} dòng.`);
    row = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true;
      wasQuoted = true;
      cell = '';
    } else if (ch === ',') {
      endCell();
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      endRow();
    } else {
      cell += ch;
    }
  }
  if (quoted) throw new CsvError('Dữ liệu CSV bị lỗi: thiếu dấu ngoặc kép đóng.');
  if (cell !== '' || row.length > 0) endRow();
  return rows;
}
