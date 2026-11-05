// RFC 5322 message builder for the Gmail API (m4a B04, B30; m4c B5, B47). Pure:
// every header value is checked for CR/LF before it is written, display names
// and subjects are RFC 2047 encoded-words in UTF-8, bodies and attachments are
// base64 in 76-character lines, and the whole message is ASCII.

import type { Email } from '@/core/brand';
import { parseEmail } from '@/core/text';

export interface MailAddress {
  name: string;
  email: Email;
}
export interface MailAttachment {
  filename: string;
  contentType: string;
  data: Uint8Array;
}
/** An attachment encoded once and reused for every recipient (m4c B47). */
export interface PreparedAttachment {
  readonly filename: string;
  readonly contentType: string;
  readonly base64Lines: string;
  readonly rawBytes: number;
}
export interface MailMessage {
  from: MailAddress;
  to: ReadonlyArray<MailAddress>;
  subject: string;
  html: string;
  text: string;
  attachments?: ReadonlyArray<PreparedAttachment>;
}

/** Gmail's documented limit for a whole message, attachments and encoding included. */
export const GMAIL_MESSAGE_LIMIT_BYTES = 25 * 1024 * 1024;
/**
 * The send endpoint without uploadType takes the message as base64url inside a JSON body. Google's non-upload
 * endpoints refuse request bodies over 5 MiB (inferred from Google's API limits, not measured against Gmail here),
 * so the raw message is capped where its JSON body `{"raw":"…"}` still fits in 5 MiB: 3,932,152 bytes.
 */
export const MAX_JSON_BODY_BYTES = 5 * 1024 * 1024;
export const MAX_RAW_MESSAGE_BYTES = Math.floor(((MAX_JSON_BODY_BYTES - '{"raw":""}'.length) * 3) / 4);

export class MimeError extends Error {
  constructor(
    readonly kind: 'header_injection' | 'invalid_address' | 'invalid_content_type' | 'too_large' | 'no_recipient',
    message: string,
  ) {
    super(message);
  }
}

const CRLF = '\r\n';
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += `${B64[(n >> 18) & 63]!}${B64[(n >> 12) & 63]!}==`;
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += `${B64[(n >> 18) & 63]!}${B64[(n >> 12) & 63]!}${B64[(n >> 6) & 63]!}=`;
  }
  return out;
}

/** The Gmail API `raw` field: URL-safe alphabet, no padding. */
export function toBase64Url(message: string): string {
  return base64(asciiBytes(message)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function asciiBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
  return out;
}

const utf8 = (s: string) => new TextEncoder().encode(s);

const wrap76 = (b64: string) => b64.replace(/.{1,76}/g, (line) => `${line}${CRLF}`);

/** CR, LF, NUL or another C0 control in a value that goes into a header (m4a B04). */
function assertHeaderSafe(value: string, field: string): void {
  if (/[\u0000-\u0008\u000a-\u001f\u007f]/.test(value)) {
    throw new MimeError('header_injection', `Trường ${field} chứa ký tự xuống dòng hoặc ký tự điều khiển.`);
  }
}

/** Splits UTF-8 bytes into chunks of at most `max` bytes without cutting a code point. */
function utf8Chunks(s: string, max: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  let current: number[] = [];
  for (const ch of s) {
    const bytes = utf8(ch);
    if (current.length + bytes.length > max && current.length > 0) {
      chunks.push(Uint8Array.from(current));
      current = [];
    }
    current.push(...bytes);
  }
  if (current.length > 0) chunks.push(Uint8Array.from(current));
  return chunks;
}

// 42 bytes give 56 base64 characters, so '=?UTF-8?B?…?=' is 68 characters and 'Subject: ' plus one word stays under 78.
const WORD_BYTES = 42;

/** RFC 2047 B encoded-words, folded onto continuation lines. Empty input gives ''. */
export function encodeWords(value: string): string {
  return utf8Chunks(value, WORD_BYTES)
    .map((chunk) => `=?UTF-8?B?${base64(chunk)}?=`)
    .join(`${CRLF} `);
}

function formatAddress(a: MailAddress, field: string): string {
  assertHeaderSafe(a.name, field);
  assertHeaderSafe(a.email, field);
  const email = parseEmail(a.email);
  if (!email || email !== a.email.trim().toLowerCase()) throw new MimeError('invalid_address', `Địa chỉ ${field} không hợp lệ: ${a.email}`);
  const name = a.name.trim();
  return name ? `${encodeWords(name)}${CRLF} <${email}>` : `<${email}>`;
}

const TOKEN = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i;
const ASCII_FILENAME = /^[A-Za-z0-9._ ()-]{1,120}$/;

/** RFC 2231 percent-encoding for a non-ASCII file name. */
const rfc2231 = (s: string) => Array.from(utf8(s), (b) => (/[A-Za-z0-9._-]/.test(String.fromCharCode(b)) ? String.fromCharCode(b) : `%${b.toString(16).toUpperCase().padStart(2, '0')}`)).join('');

export function prepareAttachment(a: MailAttachment): PreparedAttachment {
  assertHeaderSafe(a.filename, 'tên tệp đính kèm');
  if (!TOKEN.test(a.contentType)) throw new MimeError('invalid_content_type', `Loại tệp không hợp lệ: ${a.contentType}`);
  return { filename: a.filename, contentType: a.contentType.toLowerCase(), base64Lines: wrap76(base64(a.data)), rawBytes: a.data.length };
}

function attachmentPart(a: PreparedAttachment): string {
  const name = a.filename.trim() || 'tep_dinh_kem';
  const plain = ASCII_FILENAME.test(name);
  return [
    `Content-Type: ${a.contentType}; name="${plain ? name : encodeWords(name).replace(/\r\n /g, ' ')}"`,
    `Content-Disposition: attachment; ${plain ? `filename="${name}"` : `filename*=UTF-8''${rfc2231(name)}`}`,
    'Content-Transfer-Encoding: base64',
    '',
    a.base64Lines,
  ].join(CRLF);
}

function textPart(type: 'text/plain' | 'text/html', body: string): string {
  return [`Content-Type: ${type}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '', wrap76(base64(utf8(body)))].join(CRLF);
}

/** Base64 never contains '_' or '-', and the boundary does, so no body line can equal a delimiter. */
export function newBoundary(random: (bytes: number) => Uint8Array = randomBytes): string {
  return `=_sce_${Array.from(random(12), (b) => b.toString(16).padStart(2, '0')).join('')}`;
}
function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

function multipart(subtype: 'alternative' | 'mixed', boundary: string, parts: ReadonlyArray<string>): string {
  return [`Content-Type: multipart/${subtype}; boundary="${boundary}"`, '', ...parts.map((p) => `--${boundary}${CRLF}${p}`), `--${boundary}--`, ''].join(CRLF);
}

/**
 * The raw message. Throws MimeError before anything is sent when a header carries CR/LF, an address is not a plain
 * RFC 5322 address, or the message is over MAX_RAW_MESSAGE_BYTES.
 */
export function buildMimeMessage(m: MailMessage, random?: (bytes: number) => Uint8Array): string {
  if (m.to.length === 0) throw new MimeError('no_recipient', 'Thư chưa có người nhận.');
  assertHeaderSafe(m.subject, 'Tiêu đề');
  const alternative = multipart('alternative', newBoundary(random), [textPart('text/plain', m.text), textPart('text/html', m.html)]);
  const attachments = m.attachments ?? [];
  const body = attachments.length === 0 ? alternative : multipart('mixed', newBoundary(random), [alternative, ...attachments.map(attachmentPart)]);
  const headers = [
    `From: ${formatAddress(m.from, 'người gửi')}`,
    `To: ${m.to.map((a) => formatAddress(a, 'người nhận')).join(`,${CRLF} `)}`,
    `Subject: ${encodeWords(m.subject.trim())}`,
    'MIME-Version: 1.0',
  ];
  const raw = `${headers.join(CRLF)}${CRLF}${body}`;
  assertSize(raw.length);
  return raw;
}

export function assertSize(rawBytes: number): void {
  const limit = Math.min(MAX_RAW_MESSAGE_BYTES, GMAIL_MESSAGE_LIMIT_BYTES);
  if (rawBytes > limit) {
    throw new MimeError('too_large', `Thư quá lớn (${formatMb(rawBytes)}). Giới hạn mỗi thư là ${formatMb(limit)} sau khi mã hóa.`);
  }
}

/** Base64 grows 4/3 plus a CRLF per 76 characters; headers and the text parts come on top. */
export function encodedSizeOf(rawBytes: number): number {
  const b64 = Math.ceil(rawBytes / 3) * 4;
  return b64 + Math.ceil(b64 / 76) * 2;
}

export const formatMb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
