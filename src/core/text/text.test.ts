import { describe, expect, it } from 'vitest';
import type { Vnd } from '@/core/brand';
import {
  escapeHtml,
  fileNameStem,
  foldVi,
  formatVnd,
  html,
  matchesQuery,
  normalizePhone,
  parseEmail,
  parseSafeUrl,
  parseVnd,
  safeSpreadsheetText,
  sanitizeRichHtml,
  toCsv,
} from '@/core/text';

describe('foldVi and matchesQuery', () => {
  it('folds tones, đ, case and whitespace', () => {
    expect(foldVi('  Nguyễn   Văn ĐỨC ')).toBe('nguyen van duc');
    expect(foldVi('Hội chợ OCOP')).toBe('hoi cho ocop');
  });

  it('matches every token anywhere in the haystack', () => {
    expect(matchesQuery('nguyen ubnd', 'Nguyễn Văn A', 'UBND Thành phố')).toBe(true);
    expect(matchesQuery('nguyen sở', 'Nguyễn Văn A', 'UBND')).toBe(false);
    expect(matchesQuery('', 'anything')).toBe(true);
    expect(matchesQuery('a', null, undefined)).toBe(false);
  });
});

describe('escapeHtml and html``', () => {
  it('escapes all five characters and keeps falsy values (core B28)', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
    expect(escapeHtml(0)).toBe('0');
    expect(escapeHtml(false)).toBe('false');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('escapes interpolations but nests trusted fragments', () => {
    const name = '<img src=x onerror=alert(1)>';
    const row = html`<td>${name}</td>`;
    expect(row).toBe('<td>&lt;img src=x onerror=alert(1)&gt;</td>');
    const table = html`<table><tr>${row}</tr>${[html`<tr><td>${0}</td></tr>`, html`<tr><td>${'a&b'}</td></tr>`]}</table>`;
    expect(table).toBe('<table><tr><td>&lt;img src=x onerror=alert(1)&gt;</td></tr><tr><td>0</td></tr><tr><td>a&amp;b</td></tr></table>');
  });

  it('does not trust a plain string that merely looks like markup', () => {
    expect(html`<p>${'<b>x</b>'}</p>`).toBe('<p>&lt;b&gt;x&lt;/b&gt;</p>');
  });
});

describe('sanitizeRichHtml', () => {
  it('keeps NĐ30 formatting: tables, alignment, inline styles', () => {
    const input = '<table border="1"><tr><td colspan="2" style="text-align:center"><b>QUYẾT ĐỊNH</b></td></tr></table><p align="right"><i>Hà Nội</i></p>';
    expect(sanitizeRichHtml(input)).toBe(input.replace('<tr>', '<tbody><tr>').replace('</table>', '</tbody></table>'));
  });

  it('removes scripts, event handlers and javascript:/data: URLs (m3 B02, m4a B03)', () => {
    const out = sanitizeRichHtml(
      '<p onclick="steal()">x</p><script>alert(1)</script><a href="javascript:alert(1)">a</a><a href="data:text/html,<script>">b</a><img src=x onerror=alert(1)><iframe src="https://evil"></iframe>',
    );
    expect(out).toBe('<p>x</p><a>a</a><a>b</a>');
  });

  it('drops styles that load remote resources and hardens target links', () => {
    expect(sanitizeRichHtml('<span style="background:url(https://evil/x.png)">x</span>')).toBe('<span>x</span>');
    expect(sanitizeRichHtml('<a href="https://sce.vn" target="_blank">x</a>')).toBe('<a href="https://sce.vn" target="_blank" rel="noopener noreferrer">x</a>');
  });

  const styleOf = (out: string) => /style="([^"]*)"/.exec(out)?.[1] ?? null;

  it.each([
    ['a CSS escape inside url', 'background:u\\72l(https://evil/x.png)'],
    ['a CSS escape of the whole function name', 'background:\\75\\72\\6c(https://evil/x.png)'],
    ['upper-case URL', 'background:URL(https://evil/x.png)'],
    ['a comment inside url', 'background:u/**/rl(https://evil/x.png)'],
    ['an HTML entity inside url', 'background:&#117;rl(https://evil/x.png)'],
    ['a named entity for the parenthesis', 'background:url&lpar;https://evil/x.png)'],
    ['image-set', 'background-image:image-set("https://evil/x.png" 1x)'],
    ['-webkit-image-set', 'background-image:-webkit-image-set(url(https://evil/x.png) 1x)'],
    ['cross-fade', 'background-image:cross-fade(url(a.png), url(b.png), 50%)'],
    ['expression', 'width:expression(alert(1))'],
    ['a CSS escape inside expression', 'width:expr\\65ssion(alert(1))'],
    ['@import', '@import "https://evil/x.css"'],
    ['behavior', 'behavior:url(x.htc)'],
    ['-moz-binding', '-moz-binding:url(https://evil/x.xml#x)'],
    ['var()', 'color:var(--danger-ink)'],
    ['content', 'content:"Đã xác thực"'],
  ])('drops %s', (_label, style) => {
    const out = sanitizeRichHtml(`<span style="${style}">x</span>`);
    expect(out).toBe('<span>x</span>');
  });

  it.each([
    ['a position:fixed overlay', 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;background-color:white'],
    ['an upper-case overlay with spaces', 'POSITION : FIXED ; INSET: 0'],
    ['a position:absolute overlay', 'position:absolute;top:-1px'],
    ['an overlay with a CSS escape in the property name', 'posit\\69on:fixed;top:0'],
    ['an overlay with a comment between property and value', 'position/**/:fixed;inset:0'],
    ['an overlay with an entity in the property name', 'positi&#111;n:fixed;top:0'],
    ['a transformed overlay', 'transform:translate(-50%,-50%) scale(40)'],
    ['a block pulled over the text above it', 'margin-top:-400px;margin: -2px 0 0 -9999px'],
  ])('%s loses every placing declaration', (_label, style) => {
    const kept = styleOf(sanitizeRichHtml(`<div style="${style}">Đăng nhập lại</div>`));
    expect(kept ?? '').not.toMatch(/position|fixed|absolute|inset|top|left|z-index|transform|-\d|\\|\/\*/i);
  });

  it('keeps the inline styles NĐ30 templates and the editor use, verbatim', () => {
    const style = "font-family: 'Times New Roman', serif; line-height: 1.6; font-size: 14pt; color: rgb(30, 58, 138); background-color: #f1f5f9; padding: 6px; margin: 5px 0; text-indent: 30px; text-align: justify; border-collapse: collapse; vertical-align: top; text-transform: uppercase; width: 50%; border: 1px solid black;";
    expect(styleOf(sanitizeRichHtml(`<p style="${style}">x</p>`))).toBe(style);
  });

  it.each([
    ['a CSS escape', 'color:red; background:u\\72l(https://evil/x.png); font-weight:bold'],
    ['a comment', 'color:red;/* x */font-weight:bold'],
    ['an at-rule', 'color:red; @import "https://evil/x.css"; font-weight:bold'],
    ['!important', 'color:red !important; font-weight:bold'],
  ])('a style with %s is dropped whole, its allowed declarations too', (_label, style) => {
    expect(sanitizeRichHtml(`<span style="${style}">x</span>`)).toBe('<span>x</span>');
  });

  it.each([
    ['text pushed off the page', 'text-indent:-9999px'],
    ['letters drawn over each other', 'letter-spacing: -5px'],
    ['words drawn over each other', 'word-spacing:-.5em'],
    ['a page-sized font', 'font-size:99999px'],
    ['a huge point size', 'font-size: 400pt'],
    ['a huge em size', 'font-size:20em'],
    ['text too small to read', 'font-size:1px'],
    ['a zero font size', 'font-size:0'],
    ['a viewport-wide block', 'width:100vw'],
    ['a viewport-tall block', 'height: 100vh'],
    ['a dynamic viewport block', 'min-height:100dvh'],
    ['transparent text', 'color:transparent'],
    ['text with zero alpha', 'color: rgba(0, 0, 0, 0)'],
    ['text with nearly zero alpha', 'color:hsla(0, 0%, 0%, 0.05)'],
    ['text with zero alpha, space syntax', 'color: rgb(0 0 0 / 0%)'],
  ])('drops %s', (_label, style) => {
    expect(sanitizeRichHtml(`<p style="${style}">x</p>`)).toBe('<p>x</p>');
  });

  it.each([
    ['text in a 4-digit hex with zero alpha', 'color:#0000'],
    ['text in an 8-digit hex with zero alpha', 'color: #00000000'],
    ['text in an 8-digit hex with 2 % alpha', 'color:#ff000005'],
    ['an underline in a hex with zero alpha', 'text-decoration-color:#fff0'],
    ['text pushed a page away', 'text-indent:99999px'],
    ['letters spread across the page', 'letter-spacing:500px'],
    ['words spread across the page', 'word-spacing: 40em'],
    ['a line taller than any page', 'line-height:100000px'],
    ['a unitless line height of a page', 'line-height: 900'],
    ['a block taller than any page', 'height:999999px'],
    ['a block wider than any page', 'min-width: 5000mm'],
    ['a block collapsed to nothing', 'width:0;height:0'],
    ['a container-wide block', 'width:100cqw'],
    ['a percentage over the whole', 'width: 5000%'],
    ['a margin that pushes the text away', 'margin:0 0 0 20000px'],
    ['padding that swamps the page', 'padding: 300mm'],
    ['a border that fills the page', 'border: 900px solid black'],
    ['an invisible border colour', 'border-color: transparent'],
    ['an invisible border in a shorthand', 'border:2px solid transparent'],
    ['a length in an unknown unit', 'margin-top: 3furlongs'],
  ])('drops %s', (_label, style) => {
    expect(sanitizeRichHtml(`<p style="${style}">x</p>`)).toBe('<p>x</p>');
  });

  it('keeps the visible colours, lengths and proportions of a document', () => {
    const style = 'color: #1e3a8a; color: #000f; color: #1e3a8aff; text-indent: 2em; letter-spacing: 2px; line-height: 2; line-height: 150%; line-height: 24pt; width: 250px; max-width: 550px; min-height: 120px; min-width: 0; width: 100%; height: 297mm; padding: 35px; margin: 0 auto; margin-top: 40px; border: 4px solid #b45309; border-radius: 12px; font-weight: 700';
    expect(styleOf(sanitizeRichHtml(`<p style="${style}">x</p>`))).toBe(style);
  });

  it('keeps ordinary sizes, colours and a transparent background', () => {
    const style = 'font-size: 14pt; font-size: 72px; font-size: 2em; font-size: 120%; font-size: larger; color: rgba(0, 0, 0, 0.8); background-color: transparent; text-indent: 30px; letter-spacing: 0.5px; width: 100%; height: 40mm';
    expect(styleOf(sanitizeRichHtml(`<p style="${style}">x</p>`))).toBe(style);
  });

  it('keeps the allowed declarations of a style it has to cut', () => {
    expect(sanitizeRichHtml('<p style="color: red; position: fixed; font-weight: bold">x</p>')).toBe('<p style="color:red;font-weight:bold">x</p>');
  });

  it('keeps only its own template classes, since the app’s utility classes could place an overlay', () => {
    expect(sanitizeRichHtml('<span class="tpl-blank">……</span>')).toBe('<span class="tpl-blank">……</span>');
    expect(sanitizeRichHtml('<div class="fixed inset-0 z-50 bg-surface tpl-blank">x</div>')).toBe('<div class="tpl-blank">x</div>');
    expect(sanitizeRichHtml('<div class="fixed inset-0 z-50">x</div>')).toBe('<div>x</div>');
  });

  it('is idempotent and its output nests in html`` unescaped', () => {
    const once = sanitizeRichHtml('<p>Kính gửi <b>Ông A</b></p>');
    expect(sanitizeRichHtml(once)).toBe(once);
    expect(html`<div>${once}</div>`).toBe('<div><p>Kính gửi <b>Ông A</b></p></div>');
  });
});

describe('parsers', () => {
  it('parses emails, lowercased and trimmed', () => {
    expect(parseEmail('  Ten.Nguoi@SCE.Hanoi.gov.vn ')).toBe('ten.nguoi@sce.hanoi.gov.vn');
    expect(parseEmail('no-at-sign')).toBeNull();
    expect(parseEmail('a@b')).toBeNull();
    expect(parseEmail('a b@c.vn')).toBeNull();
    expect(parseEmail('"x"@c.vn')).toBeNull();
    expect(parseEmail(42)).toBeNull();
  });

  it('accepts only http(s) URLs', () => {
    expect(parseSafeUrl('https://docs.google.com/forms/d/x')).toBe('https://docs.google.com/forms/d/x');
    expect(parseSafeUrl('javascript:alert(1)')).toBeNull();
    expect(parseSafeUrl(' JavaScript:alert(1)')).toBeNull();
    expect(parseSafeUrl('data:text/html,x')).toBeNull();
    expect(parseSafeUrl('www.sce.vn')).toBeNull();
    expect(parseSafeUrl('')).toBeNull();
  });

  it('normalizes VN phone numbers', () => {
    expect(normalizePhone('0913.210.001')).toBe('0913210001');
    expect(normalizePhone('+84 913 210 001')).toBe('0913210001');
    expect(normalizePhone('(024) 3825 1234')).toBe('02438251234');
  });

  it.each([
    ['1.500.000', 1500000],
    ['480.000.000', 480000000],
    ['1500000', 1500000],
    ['1 500 000 đ', 1500000],
    ['1,500,000', 1500000],
    ['1.500.000,00', 1500000],
    ['350.000.000 VNĐ', 350000000],
    ['0', 0],
  ])('parseVnd(%s) = %i', (raw, expected) => {
    expect(parseVnd(raw)).toBe(expected);
  });

  it.each(['1.500.000,50', '1,5', 'abc', '', '-5', '1.50.000', '12.5000'])('parseVnd(%s) is null (m6 BUG-34)', (raw) => {
    expect(parseVnd(raw)).toBeNull();
  });

  it('formats VND in full and compact forms', () => {
    expect(formatVnd(1500000 as Vnd)).toBe('1.500.000 đ');
    expect(formatVnd(0 as Vnd)).toBe('0 đ');
    expect(formatVnd(1500000 as Vnd, { compact: true })).toBe('1,5 tr');
    expect(formatVnd(2_350_000_000 as Vnd, { compact: true })).toBe('2,4 tỷ');
    expect(formatVnd(900 as Vnd, { compact: true })).toBe('900 đ');
  });
});

describe('spreadsheet safety', () => {
  it.each(['=HYPERLINK("http://evil")', '+1+1', '-2+3', '@SUM(A1)', '\tx', '\rx'])('neutralizes %j', (v) => {
    expect(safeSpreadsheetText(v)).toBe(`'${v}`);
  });

  it('leaves ordinary text alone', () => {
    expect(safeSpreadsheetText('Nguyễn Văn A')).toBe('Nguyễn Văn A');
  });

  it('writes RFC 4180 CSV with BOM, CRLF and formula injection blocked (m2 BUG-41, m4c B6)', async () => {
    const blob = toCsv(
      [
        { name: 'Nguyễn "Bé" A', org: '=cmd|"/c calc"!A1', n: -3, ok: true, note: null },
        { name: 'Line\nbreak', org: 'UBND, TP', n: 0, ok: false, note: ' padded' },
      ],
      [
        { header: 'Họ tên', value: (r) => r.name },
        { header: 'Đơn vị', value: (r) => r.org },
        { header: 'Số', value: (r) => r.n },
        { header: 'OK', value: (r) => r.ok },
        { header: 'STT', value: (_r, i) => i + 1 },
        { header: 'Ghi chú', value: (r) => r.note },
      ],
    );
    expect(blob.type).toBe('text/csv;charset=utf-8');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3))).toBe(
      'Họ tên,Đơn vị,Số,OK,STT,Ghi chú\r\n' +
        `"Nguyễn ""Bé"" A","'=cmd|""/c calc""!A1",-3,true,1,\r\n` +
        '"Line\nbreak","UBND, TP",0,false,2," padded"\r\n',
    );
  });
});

describe('fileNameStem', () => {
  it('folds Vietnamese to an ASCII stem', () => {
    expect(fileNameStem('Hội nghị Xúc tiến Đầu tư 2026 / Tokyo')).toBe('Hoi_nghi_Xuc_tien_Dau_tu_2026_Tokyo');
    expect(fileNameStem('Đại biểu', 5)).toBe('Dai_b');
    expect(fileNameStem('***')).toBe('file');
  });
});
