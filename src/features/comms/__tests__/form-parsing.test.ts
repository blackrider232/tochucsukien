import { describe, expect, it } from 'vitest';
import { parseRsvpAnswer, parseYesNo } from '../domain/answers';
import { detectColumns, type ColumnMap } from '../domain/columns';
import { CsvError, parseCsv } from '../domain/csv';
import { parseColumnMap, parseResponseRow, parseSheetTimestamp } from '../domain/responses';
import { isSheetCsvUrl, parseFormUrl, toSheetCsvUrl } from '../domain/sheet-url';

describe('parseCsv', () => {
  it.each([
    ['plain', 'a,b\r\n1,2\r\n', [['a', 'b'], ['1', '2']]],
    ['LF and CR row ends', 'a,b\n1,2\r3,4', [['a', 'b'], ['1', '2'], ['3', '4']]],
    ['BOM dropped', '﻿Họ tên,Email\nAn,a@x.vn', [['Họ tên', 'Email'], ['An', 'a@x.vn']]],
    ['quoted comma', '"Nguyễn, An",x', [['Nguyễn, An', 'x']]],
    ['doubled quote', '"Nói ""có""",x', [['Nói "có"', 'x']]],
    ['newline inside quotes', '"dòng 1\r\ndòng 2",x\n1,2', [['dòng 1\r\ndòng 2', 'x'], ['1', '2']]],
    ['leading zero phone stays text', 'SĐT\n0912345678\n+84 912 345 678', [['SĐT'], ['0912345678'], ['+84 912 345 678']]],
    ['empty rows dropped, empty cells kept', 'a,b\n,\n\n1,', [['a', 'b'], ['1', '']]],
    ['unquoted cells trimmed', ' a , b ', [['a', 'b']]],
    ['no trailing newline', 'a', [['a']]],
  ])('%s', (_, input, rows) => {
    expect(parseCsv(input)).toEqual(rows);
  });
  it('refuses an unterminated quote', () => {
    expect(() => parseCsv('"abc,1\n2')).toThrow(CsvError);
  });
});

describe('toSheetCsvUrl', () => {
  const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
  it.each([
    [`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=123`, `https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=123`],
    [`https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`, `https://docs.google.com/spreadsheets/d/${ID}/export?format=csv`],
    [`https://docs.google.com/spreadsheets/d/${ID}/gviz/tq?tqx=out:csv&gid=7`, `https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=7`],
    [ID, `https://docs.google.com/spreadsheets/d/${ID}/export?format=csv`],
    [`https://docs.google.com/spreadsheets/d/e/2PACX-${ID}/pubhtml?gid=5`, `https://docs.google.com/spreadsheets/d/e/2PACX-${ID}/pub?output=csv&gid=5&single=true`],
    [`https://docs.google.com/spreadsheets/d/e/2PACX-${ID}/pub?output=csv`, `https://docs.google.com/spreadsheets/d/e/2PACX-${ID}/pub?output=csv`],
  ])('%s -> export CSV with the tab kept', (input, csv) => {
    const r = toSheetCsvUrl(input);
    expect(r).toEqual({ ok: true, csvUrl: csv });
    expect(isSheetCsvUrl(csv)).toBe(true);
  });
  it.each([
    `http://docs.google.com/spreadsheets/d/${ID}/edit`,
    `https://docs.google.com.evil.com/spreadsheets/d/${ID}/edit`,
    `https://evil.com/spreadsheets/d/${ID}/edit`,
    `https://user:pw@docs.google.com/spreadsheets/d/${ID}/edit`,
    `https://docs.google.com:8443/spreadsheets/d/${ID}/edit`,
    `https://docs.google.com/document/d/${ID}/edit`,
    'https://169.254.169.254/latest/meta-data',
    'file:///etc/passwd',
    'javascript:alert(1)',
    '',
  ])('refuses %j', (input) => {
    expect(toSheetCsvUrl(input).ok).toBe(false);
  });
  it('refuses a stored URL that is not exactly what toSheetCsvUrl writes', () => {
    expect(isSheetCsvUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit`)).toBe(false);
  });
  it('accepts only https Google Form links', () => {
    expect(parseFormUrl('https://forms.gle/abcXYZ123')).toBe('https://forms.gle/abcXYZ123');
    expect(parseFormUrl('https://docs.google.com/forms/d/e/x/viewform')).toBe('https://docs.google.com/forms/d/e/x/viewform');
    expect(parseFormUrl('http://forms.gle/abc')).toBeNull();
    expect(parseFormUrl('https://evil.com/forms/x')).toBeNull();
    expect(parseFormUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('detectColumns', () => {
  it('maps a Google Form sheet whatever the order, with the org before the name and banquet asked as "tham dự tiệc"', () => {
    const headers = ['Dấu thời gian', 'Tên cơ quan / đơn vị', 'Họ và tên', 'Địa chỉ email', 'Số điện thoại', 'Anh/chị có tham dự tiệc chiêu đãi?', 'Xác nhận tham dự', 'Họ tên người đi thay', 'Chức vụ', 'Ghi chú'];
    expect(detectColumns(headers)).toEqual({ timestamp: 0, organization: 1, name: 2, email: 3, phone: 4, banquet: 5, rsvp: 6, substitute: 7, title: 8, notes: 9 });
  });
  it('leaves fields without a column absent, never guessed', () => {
    const map = detectColumns(['Timestamp', 'Full name', 'Email']);
    expect(map).toEqual({ timestamp: 0, name: 1, email: 2 });
    expect(map.rsvp).toBeUndefined();
    expect(map.banquet).toBeUndefined();
  });
  it('does not read "Ghi chú (notes)" as an RSVP column because of "no"', () => {
    expect(detectColumns(['Họ tên', 'Notes']).rsvp).toBeUndefined();
  });
});

describe('answers', () => {
  // Each phrasing is checked as typed and without diacritics (folded the way many people type on a phone).
  const plain = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
  const both = (rows: ReadonlyArray<readonly [string, unknown]>) => rows.flatMap(([raw, v]) => (plain(raw) === raw ? [[raw, v] as const] : [[raw, v] as const, [plain(raw), v] as const]));

  it.each(
    both([
      ['Có', 'confirmed'],
      ['Có, tôi sẽ tham dự', 'confirmed'],
      ['Tham dự', 'confirmed'],
      ['Có, không ăn tiệc', 'confirmed'],
      ['Tôi xác nhận tham dự, không ăn tiệc', 'confirmed'],
      ['Xin xác nhận sẽ tham dự cùng Ban Giám đốc', 'confirmed'],
      ['Tôi sẽ tham dự, không có gì thay đổi', 'confirmed'],
      ['Không có gì thay đổi, tôi sẽ tham dự', 'confirmed'],
      ['Em xác nhận tham dự, không cử người đi thay', 'confirmed'],
      ['Tham dự, không có người đi thay', 'confirmed'],
      ['Tham dự hội nghị, không tham dự tiệc', 'confirmed'],
      ['Đồng ý tham gia', 'confirmed'],
      ['Sẽ đến đúng giờ', 'confirmed'],
      ['Có mặt', 'confirmed'],
      ['Yes', 'confirmed'],
      ['Yes, I will attend', 'confirmed'],
      ['Không', 'declined'],
      ['Không tham dự', 'declined'],
      ['Không tham dự được', 'declined'],
      ['Không, tôi bận', 'declined'],
      ['Tôi bận công tác', 'declined'],
      ['Bận', 'declined'],
      ['Xin phép vắng mặt', 'declined'],
      ['Tôi không thể tham dự', 'declined'],
      ['Tôi xác nhận không tham dự', 'declined'],
      ['Rất tiếc, tôi sẽ không tham dự', 'declined'],
      ['Từ chối', 'declined'],
      ['Trùng lịch, xin phép vắng', 'declined'],
      ['No', 'declined'],
      ['Cử người đi thay', 'substituted'],
      ['Không tham dự, cử người đi thay', 'substituted'],
      ['Có thể', null],
      ['Chưa chắc', null],
      ['Có thể tham dự', null],
      ['Có, nhưng không tham dự được', null],
      ['Tham dự hay không tôi báo sau', null],
      ['Ban Giám đốc', null],
      ['Hanoi', null],
      ['Cơ quan tôi', null],
      ['', null],
    ]),
  )('RSVP %j -> %s', (raw, expected) => {
    expect(parseRsvpAnswer(raw)).toBe(expected);
  });

  it.each(
    both([
      ['Có', true],
      ['Có dự tiệc', true],
      ['Tôi tham dự tiệc, không cần xe đưa đón', true],
      ['Dự tiệc, không ăn cay', true],
      ['Không', false],
      ['Không dự tiệc', false],
      ['Không tham dự tiệc', false],
      ['Có, không ăn tiệc', null],
      ['', null],
      ['Có thể', null],
      ['Cơ quan', null],
    ]),
  )('banquet %j -> %s', (raw, expected) => {
    expect(parseYesNo(raw)).toBe(expected);
  });
});

describe('parseResponseRow', () => {
  const headers = ['Dấu thời gian', 'Họ và tên', 'Email', 'Số điện thoại', 'Xác nhận tham dự'];
  const map: ColumnMap = { timestamp: 0, name: 1, email: 2, phone: 3, rsvp: 4 };
  it('keeps the answers as data and reads only the columns the sheet has', () => {
    const r = parseResponseRow(headers, ['04/11/2026 09:15:30', '<img src=x onerror=alert(1)>', 'AN@Example.VN', '0912345678', 'Có'], map)!;
    expect(r.name).toBe('<img src=x onerror=alert(1)>');
    expect(r.email).toBe('an@example.vn');
    expect(r.phone).toBe('0912345678');
    expect(r.rsvp).toBe('confirmed');
    expect(r.hasBanquet).toBeNull();
    expect(r.respondedAt).toBe('2026-11-04T02:15:30.000Z');
    expect(r.raw['Họ và tên']).toBe('<img src=x onerror=alert(1)>');
  });
  it('gives no RSVP when the sheet has no RSVP column, rather than pending', () => {
    expect(parseResponseRow(headers, ['04/11/2026 09:15:30', 'An', '', '', 'Có'], { timestamp: 0, name: 1 })!.rsvp).toBeNull();
  });
  it('drops a row that identifies nobody', () => {
    expect(parseResponseRow(headers, ['04/11/2026', '', '', '', 'Có'], map)).toBeNull();
  });
  it('drops an email with a line break instead of keeping it', () => {
    expect(parseResponseRow(headers, ['', 'An', 'an@x.vn\r\nBcc: v@evil.com', '', ''], map)!.email).toBeNull();
  });
  it.each([
    ['04/11/2026 09:15:30', '2026-11-04T02:15:30.000Z'],
    ['4/11/2026 9:05', '2026-11-04T02:05:00.000Z'],
    ['2026-11-04 09:15:30', '2026-11-04T02:15:30.000Z'],
    ['2026-11-04T02:15:30.000Z', '2026-11-04T02:15:30.000Z'],
    ['31/02/2026 10:00', null],
    ['hôm qua', null],
    ['', null],
  ])('timestamp %j -> %s (Hà Nội wall clock)', (raw, expected) => {
    expect(parseSheetTimestamp(raw)).toBe(expected);
  });
  it('parses a saved column map leniently, dropping unknown fields and bad indexes', () => {
    expect(parseColumnMap({ name: 1, email: -1, rsvp: 2.5, evil: 3, phone: 4 })).toEqual({ name: 1, phone: 4 });
    expect(parseColumnMap(null)).toBeNull();
  });
});
