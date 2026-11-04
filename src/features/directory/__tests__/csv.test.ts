import { describe, expect, it } from 'vitest';
import type { ContactId, Email } from '@/core/brand';
import type { MasterContact } from '../contract';
import { CONTACT_CSV_COLUMNS, previewContactImport } from '../domain/csv-import';
import { detectDelimiter, parseCsv, serializeCsv, unguardCell } from '../domain/csv';

const rows = (text: string) => parseCsv(text).rows;

describe('parseCsv', () => {
  it.each([
    ['plain', 'a,b,c\r\n1,2,3', [['a', 'b', 'c'], ['1', '2', '3']]],
    ['LF', 'a,b\n1,2\n', [['a', 'b'], ['1', '2']]],
    ['bare CR (old Mac)', 'a,b\r1,2', [['a', 'b'], ['1', '2']]],
    ['BOM is dropped', '﻿a,b\n1,2', [['a', 'b'], ['1', '2']]],
    ['quoted comma', '"Sở, Ban",x\n', [['Sở, Ban', 'x']]],
    ['doubled quote', '"nói ""xin chào""",y', [['nói "xin chào"', 'y']]],
    ['newline inside quotes', '"dòng 1\r\ndòng 2",z\n3,4', [['dòng 1\r\ndòng 2', 'z'], ['3', '4']]],
    ['leading zeros stay text', 'sdt\n0912345678\n007', [['sdt'], ['0912345678'], ['007']]],
    ['empty cells and trailing comma', 'a,,c,\n,,,\nx,y,z,', [['a', '', 'c', ''], ['x', 'y', 'z', '']]],
    ['blank lines are skipped', 'a\n\n\nb\n', [['a'], ['b']]],
    ['spaces inside cells are kept', ' a , b ', [[' a ', ' b ']]],
    ['quote in the middle of a bare cell is literal', 'Nguyễn "Bob" An,x', [['Nguyễn "Bob" An', 'x']]],
    ['empty quoted cell', '"",a', [['', 'a']]],
    ['no trailing newline', 'a,b', [['a', 'b']]],
  ])('%s', (_name, text, expected) => {
    expect(rows(text)).toEqual(expected);
  });

  it('detects the delimiter a Vietnamese Excel writes, ignoring delimiters inside quotes', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a\tb\tc')).toBe('\t');
    expect(detectDelimiter('"a;b;c",d,e')).toBe(',');
    expect(detectDelimiter('single')).toBe(',');
    expect(rows('Họ tên;Cơ quan\nAn;"Sở; Ban"')).toEqual([['Họ tên', 'Cơ quan'], ['An', 'Sở; Ban']]);
  });

  it('reports an unterminated quote instead of swallowing the rest of the file', () => {
    const r = parseCsv('a,b\n"oops,1\n2,3');
    expect(r.rows).toEqual([]);
    expect(r.error).toContain('dòng 2');
  });

  it('refuses a file over the size limit', () => {
    expect(parseCsv('x'.repeat(4_000_001)).error).toContain('quá lớn');
  });
});

describe('serializeCsv (formula-injection safe, m4c B6)', () => {
  // Blob.text() drops a BOM, so the bytes are decoded with the BOM kept.
  const text = async (rows: string[][]) =>
    new TextDecoder('utf-8', { ignoreBOM: true }).decode(await serializeCsv(rows, [{ header: 'h', value: (r) => r[0]! }, { header: 'g', value: (r) => r[1] ?? '' }]).arrayBuffer());

  it('starts with a BOM, uses CRLF and quotes what needs it', async () => {
    const out = await text([['a,b', 'say "hi"'], ['dòng 1\ndòng 2', ' lead']]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out).toBe('﻿h,g\r\n"a,b","say ""hi"""\r\n"dòng 1\ndòng 2"," lead"\r\n');
  });

  it.each(['=1+1', '+84 912 345 678', '-5', '@SUM(A1)', '\tTAB', '\rCR'])('guards a cell that starts with %j', async (value) => {
    const out = await text([[value]]);
    const cell = out.split('\r\n')[1]!;
    expect(cell.replace(/^"/, '').startsWith("'")).toBe(true);
    expect(parseCsv(out).rows[1]![0]).toBe(`'${value}`);
    expect(unguardCell(`'${value}`)).toBe(value);
  });

  it('does not touch an apostrophe that guards nothing, or a leading zero', async () => {
    expect(unguardCell("'abc")).toBe("'abc");
    expect((await text([['0912345678']])).split('\r\n')[1]).toBe('0912345678,');
  });

  it('round-trips awkward text through the parser', async () => {
    const awkward = ['a,"b"\r\nc', ' x ', 'Đặng "Bình"', ';', ''];
    const out = await text(awkward.map((v) => [v]));
    expect(parseCsv(out).rows.slice(1).map((r) => r[0])).toEqual(awkward.filter((v) => v.trim() !== ''));
  });
});

describe('export then import', () => {
  const contact = (over: Partial<MasterContact>): MasterContact =>
    ({ id: 'a1' as ContactId, name: 'Nguyễn Văn An', group: 'VIP', title: 'Giám đốc', organization: 'Sở Mẫu, Hà Nội', phone: '0912.345.678', email: 'an@example.com' as Email, address: 'Số 1\nPhố X', taxCode: '', notes: 'Nói "xin chào"', hasBanquet: true, updatedAt: '' as never, version: 1 as never, ...over });

  it('a file the app wrote imports back to the same contacts, including a phone that starts with +', async () => {
    const list = [
      contact({}),
      contact({ id: 'a2' as ContactId, name: 'Test Guest', group: 'QuocTe', organization: 'Org', phone: '+81 3 0000 0007', email: null, address: '', notes: '', hasBanquet: false }),
      contact({ id: 'a3' as ContactId, name: 'Ba', group: 'BaoChi', organization: 'Báo Mẫu', phone: '', email: null, notes: '=HYPERLINK("x")', hasBanquet: false }),
    ];
    const csv = await serializeCsv(list, CONTACT_CSV_COLUMNS).text();
    const preview = previewContactImport(csv, { defaultGroup: 'DoanhNghiep', existingKeys: new Set() });
    expect(preview.error).toBeNull();
    expect(preview.counts).toEqual({ total: 3, created: 3, duplicateExisting: 0, duplicateInFile: 0, invalid: 0 });
    expect(preview.rows.map((r) => r.draft)).toEqual(
      list.map(({ id, updatedAt, version, ...rest }) => ({ ...rest, notes: rest.notes })),
    );
  });
});
