import { describe, expect, it } from 'vitest';
import type { Email } from '@/core/brand';
import {
  base64, buildMimeMessage, encodeWords, MAX_JSON_BODY_BYTES, MAX_RAW_MESSAGE_BYTES, MimeError, prepareAttachment, toBase64Url, type MailMessage,
} from '../domain/mime';

const e = (s: string) => s as Email;
const message = (over: Partial<MailMessage> = {}): MailMessage => ({
  from: { name: 'Ban Tổ chức Hội nghị', email: e('btc@example.com') },
  to: [{ name: 'Nguyễn Văn An', email: e('an@example.vn') }],
  subject: '[Giấy Mời] Tham dự Hội nghị Xúc tiến Đầu tư - Kính gửi Đồng chí Nguyễn Văn An',
  html: '<p>Kính gửi <strong>Đồng chí</strong></p>',
  text: 'Kính gửi Đồng chí',
  ...over,
});

/** Undoes RFC 2047: whitespace between adjacent encoded-words is dropped, then each word is decoded. */
const decodeWords = (value: string) =>
  value
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/g, (_, b: string) => Buffer.from(b, 'base64').toString('utf8'));

/** Header block of a raw message, unfolded. */
function headers(raw: string): Record<string, string> {
  const head = raw.slice(0, raw.indexOf('\r\n\r\n'));
  const unfolded = head.replace(/\r\n /g, ' ');
  return Object.fromEntries(unfolded.split('\r\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 2)]));
}

const fixedRandom = (n: number) => new Uint8Array(n).fill(0xab);

describe('buildMimeMessage', () => {
  it('encodes a Vietnamese subject and display names as UTF-8 encoded-words that decode back exactly', () => {
    const raw = buildMimeMessage(message());
    const h = headers(raw);
    expect(decodeWords(h.Subject!)).toBe(message().subject);
    expect(h.Subject).toMatch(/^=\?UTF-8\?B\?/);
    expect(decodeWords(h.From!.split(' <')[0]!)).toBe('Ban Tổ chức Hội nghị');
    expect(h.From).toContain('<btc@example.com>');
    expect(h.To).toContain('<an@example.vn>');
    expect(raw).toMatch(/^[\x20-\x7e\r\n]*$/);
  });

  it('decodes a long subject to the original text with no code point split across words', () => {
    const subject = 'Thư mời dự Tiệc chiêu đãi Giao lưu Thân mật cùng Lãnh đạo Thành phố và các đại biểu khách quý ở Hà Nội ngày 15/12/2026';
    const raw = buildMimeMessage(message({ subject }));
    const head = raw.slice(0, raw.indexOf('\r\n\r\n'));
    const subjectBlock = head.slice(head.indexOf('Subject: ') + 9, head.indexOf('\r\nMIME-Version'));
    const words = subjectBlock.split('\r\n ');
    expect(words.length).toBeGreaterThan(2);
    for (const w of words) expect(Buffer.from(/\?B\?(.*)\?=/.exec(w)![1]!, 'base64').toString('utf8')).not.toContain('�');
    expect(words.map((w) => Buffer.from(/\?B\?(.*)\?=/.exec(w)![1]!, 'base64').toString('utf8')).join('')).toBe(subject);
  });

  it('folds every header and body line to at most 78 characters', () => {
    const raw = buildMimeMessage(message({ subject: 'Đ'.repeat(300), html: `<p>${'Xin chào '.repeat(500)}</p>` }));
    for (const line of raw.split('\r\n')) expect(line.length).toBeLessThanOrEqual(78);
  });

  it.each([
    ['subject LF', { subject: 'Xin chào\nBcc: victim@evil.com' }],
    ['subject CR', { subject: 'Xin chào\rBcc: victim@evil.com' }],
    ['subject NUL', { subject: 'a\u0000b' }],
    ['to name', { to: [{ name: 'An\r\nBcc: x@evil.com', email: e('an@example.vn') }] }],
    ['to address', { to: [{ name: '', email: e('an@example.vn\r\nBcc: x@evil.com') }] }],
    ['from name', { from: { name: 'BTC\nX-Evil: 1', email: e('btc@example.com') } }],
  ] as const)('refuses CR/LF in the %s before anything is built', (_, over) => {
    expect(() => buildMimeMessage(message(over as Partial<MailMessage>))).toThrow(MimeError);
    try {
      buildMimeMessage(message(over as Partial<MailMessage>));
    } catch (err) {
      expect((err as MimeError).kind).toBe('header_injection');
    }
  });

  it.each(['an@example', 'An <an@example.vn>', 'a,b@example.vn', 'an@exa mple.vn', ''])('refuses %j as an address', (addr) => {
    expect(() => buildMimeMessage(message({ to: [{ name: 'An', email: e(addr) }] }))).toThrow(/không hợp lệ|người nhận/);
  });

  it('quotes nothing by hand: a name with quotes, commas and angle brackets travels inside the encoded-word', () => {
    const name = 'Trần "Bình", <Giám đốc>';
    const h = headers(buildMimeMessage(message({ to: [{ name, email: e('binh@example.vn') }] })));
    expect(h.To!.match(/</g)).toHaveLength(1);
    expect(decodeWords(h.To!.slice(0, h.To!.lastIndexOf(' <')))).toBe(name);
  });

  it('sends HTML with a plain-text alternative, both base64 UTF-8', () => {
    const raw = buildMimeMessage(message({ html: '<p>Đại biểu</p>', text: 'Đại biểu' }), fixedRandom);
    const boundary = /boundary="([^"]+)"/.exec(raw)![1]!;
    const parts = raw.split(`--${boundary}`).slice(1, -1);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain('Content-Type: text/plain; charset=UTF-8');
    expect(parts[1]).toContain('Content-Type: text/html; charset=UTF-8');
    const body = (p: string) => Buffer.from(p.split('\r\n\r\n')[1]!.replace(/\r\n/g, ''), 'base64').toString('utf8');
    expect(body(parts[0]!)).toBe('Đại biểu');
    expect(body(parts[1]!)).toBe('<p>Đại biểu</p>');
    expect(raw.endsWith(`--${boundary}--\r\n`)).toBe(true);
  });

  it('nests the alternative inside multipart/mixed with attachments, one boundary per level, never inside content', () => {
    const png = prepareAttachment({ filename: 'The_CheckIn_An.png', contentType: 'image/png', data: new Uint8Array([137, 80, 78, 71, 1, 2, 3]) });
    const doc = prepareAttachment({ filename: 'Giấy mời chính thức.pdf', contentType: 'application/pdf', data: new TextEncoder().encode('--=_sce_ab fake boundary') });
    const raw = buildMimeMessage(message({ attachments: [png, doc] }));
    const boundaries = [...raw.matchAll(/boundary="([^"]+)"/g)].map((m) => m[1]!);
    expect(boundaries).toHaveLength(2);
    expect(boundaries[0]).not.toBe(boundaries[1]);
    expect(raw).toMatch(/^Content-Type: multipart\/mixed; boundary=/m);
    expect(raw).toContain('Content-Disposition: attachment; filename="The_CheckIn_An.png"');
    expect(raw).toContain("filename*=UTF-8''Gi%E1%BA%A5y%20m%E1%BB%9Di%20ch%C3%ADnh%20th%E1%BB%A9c.pdf");
    for (const b of boundaries) {
      const delimiter = raw.split('\r\n').filter((l) => l === `--${b}` || l === `--${b}--`);
      expect(delimiter.length).toBe(b === boundaries[0] ? 4 : 3);
    }
    const pngPart = raw.slice(raw.indexOf('filename="The_CheckIn_An.png"'));
    expect(Buffer.from(pngPart.split('\r\n\r\n')[1]!.split('\r\n--')[0]!.replace(/\r\n/g, ''), 'base64')).toEqual(Buffer.from([137, 80, 78, 71, 1, 2, 3]));
  });

  it('refuses an attachment file name with a line break or a bad content type', () => {
    expect(() => prepareAttachment({ filename: 'a\r\nb.png', contentType: 'image/png', data: new Uint8Array() })).toThrow(MimeError);
    expect(() => prepareAttachment({ filename: 'a.png', contentType: 'image/png\r\nX: 1', data: new Uint8Array() })).toThrow(MimeError);
  });
});

describe('size limit', () => {
  it('caps the raw message so its JSON body fits 5 MiB, under Gmail’s 25 MB', () => {
    expect(MAX_RAW_MESSAGE_BYTES).toBe(3_932_152);
    expect(`{"raw":"${'A'.repeat(Math.ceil((MAX_RAW_MESSAGE_BYTES * 4) / 3))}"}`.length).toBeLessThanOrEqual(MAX_JSON_BODY_BYTES);
  });

  it('builds a message just under the cap and refuses one just over it, before anything is sent', () => {
    const probe = buildMimeMessage(message({ attachments: [prepareAttachment({ filename: 'x.bin', contentType: 'application/octet-stream', data: new Uint8Array(0) })] }));
    // Base64 with CRLF every 76 characters: 3 raw bytes -> 4 characters, 57 bytes -> one 78-character line.
    const fit = Math.floor((MAX_RAW_MESSAGE_BYTES - probe.length) / 78) * 57;
    const under = message({ attachments: [prepareAttachment({ filename: 'x.bin', contentType: 'application/octet-stream', data: new Uint8Array(fit) })] });
    expect(buildMimeMessage(under).length).toBeLessThanOrEqual(MAX_RAW_MESSAGE_BYTES);
    const over = message({ attachments: [prepareAttachment({ filename: 'x.bin', contentType: 'application/octet-stream', data: new Uint8Array(fit + 200) })] });
    expect(() => buildMimeMessage(over)).toThrow(/Thư quá lớn/);
  });
});

describe('encoders', () => {
  it('base64 matches Node for every remainder length', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 100, 1001]) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37) % 256);
      expect(base64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    }
  });
  it('base64url has no + / or padding and decodes to the message', () => {
    const raw = buildMimeMessage(message());
    const url = toBase64Url(raw);
    expect(url).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(url, 'base64url').toString('latin1')).toBe(raw);
  });
  it('encodeWords of an empty string is empty, so an unnamed address is just <addr>', () => {
    expect(encodeWords('')).toBe('');
    expect(headers(buildMimeMessage(message({ to: [{ name: '', email: e('an@example.vn') }] }))).To).toBe('<an@example.vn>');
  });
});
