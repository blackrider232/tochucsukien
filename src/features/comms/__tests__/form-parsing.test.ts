import { describe, expect, it } from 'vitest';
import type { Instant } from '@/core/brand';
import { detectColumns, type ColumnMap } from '../domain/columns';
import { CsvError, parseCsv } from '../domain/csv';
import { detectDateOrder, parseColumnMap, parseResponseRow, parseSheetTimestamp } from '../domain/responses';
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
    expect(parseResponseRow(headers, ['04/11/2026 09:15:30', 'An', '', '', 'Có'], { timestamp: 0, name: 1 })!.rsvp).toBe('empty');
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
  // Google appends rows in the order the answers came, so a sheet's times only go forward, and none is in the future.
  const NOW_ = '2026-11-04T05:00:00.000Z' as Instant;
  it.each([
    ['a Vietnamese sheet', ['13/10/2026 08:00:00', '1/11/2026 07:00:00', '04/11/2026 09:00:00'], 'dmy'],
    ['a US-locale sheet with a day above 12', ['10/28/2026 09:00:00', '11/4/2026 10:00:00'], 'mdy'],
    ['a US-locale sheet whose days are all 12 or less: day-first puts 10 December in the future', ['10/12/2026 09:00:00', '11/4/2026 10:00:00'], 'mdy'],
    ['one US-locale answer from this morning: day-first is 11 April, months before the sheet was synced', ['11/4/2026 10:00:00'], 'mdy'],
    ['one Vietnamese answer from this morning', ['04/11/2026 10:00:00'], 'dmy'],
    ['Vietnamese answers of early November', ['1/11/2026 08:00:00', '2/11/2026 08:00:00', '4/11/2026 09:00:00'], 'dmy'],
    ['a sheet whose day and month are the same in every row', ['11/11/2025 10:00:00', '2026-11-04T02:15:30.000Z', ''], 'dmy'],
    ['a sheet with no slash dates', ['2026-11-04T02:15:30.000Z', 'hôm qua'], 'dmy'],
  ])('reads the date order of %s from its rows', (_, cells, order) => {
    expect(detectDateOrder(cells, NOW_)).toBe(order);
  });
  it.each([
    ['old answers that go forward either way, nothing recent', ['1/3/2026 09:00:00', '4/3/2026 09:00:00']],
    ['dates that are impossible either way', ['13/10/2026 08:00:00', '10/28/2026 09:00:00']],
    ['every reading puts an answer in the future', ['12/11/2026 08:00:00']],
    ['answers that go forward only one way, and that way nothing is recent', ['3/5/2026 08:00:00', '4/3/2026 08:00:00']],
    ['a sheet sorted as text: day-first is recent but goes back, month-first goes forward but is old', ['01/11/2026 08:00:00', '02/10/2026 08:00:00', '03/11/2026 08:00:00']],
  ])('cannot tell the date order of %s: null, the rows are kept for review', (_, cells) => {
    expect(detectDateOrder(cells, NOW_)).toBeNull();
  });
  it('reads no slash date without a known order', () => {
    expect(parseSheetTimestamp('04/11/2026 10:00:00', { order: null })).toBeNull();
    expect(parseSheetTimestamp('2026-11-04T02:15:30.000Z', { order: null })).toBe('2026-11-04T02:15:30.000Z');
  });
  it('reads "11/4/2026 10:00:00" as 4 November in a US-locale sheet', () => {
    expect(parseSheetTimestamp('11/4/2026 10:00:00', { order: 'mdy' })).toBe('2026-11-04T03:00:00.000Z');
    expect(parseSheetTimestamp('11/4/2026 10:00:00', { order: 'dmy' })).toBe('2026-04-11T03:00:00.000Z');
  });
  it('refuses a time in the future: a misread day and month, never an answer to apply', () => {
    const now = '2026-11-04T05:00:00.000Z' as Instant;
    expect(parseSheetTimestamp('04/12/2026 10:00:00', { now })).toBeNull();
    expect(parseSheetTimestamp('04/11/2026 11:59:00', { now })).toBe('2026-11-04T04:59:00.000Z');
    expect(parseSheetTimestamp('2027-01-01T00:00:00.000Z', { now })).toBeNull();
  });
  it('parses a saved column map leniently, dropping unknown fields and bad indexes', () => {
    expect(parseColumnMap({ name: 1, email: -1, rsvp: 2.5, evil: 3, phone: 4 })).toEqual({ name: 1, phone: 4 });
    expect(parseColumnMap(null)).toBeNull();
  });
});
