// Server-side fetch of a responses sheet. Not a proxy: the URL must be one
// toSheetCsvUrl wrote (https, docs.google.com, the export or pub endpoint),
// every redirect is followed by hand and must stay on https docs.google.com
// or Google's *.googleusercontent.com content hosts, the body is capped in
// bytes and the whole fetch in time, and an HTML answer (a sign-in page for a
// sheet that is not shared) is an error, never data.

import { devMemoryEnabled } from '@/core/dev/mode';
import { isSheetCsvUrl } from '../domain/sheet-url';

export const SHEET_MAX_BYTES = 5 * 1024 * 1024;
export const SHEET_TIMEOUT_MS = 10_000;
export const SHEET_MAX_REDIRECTS = 3;

export type SheetFetchResult = { ok: true; text: string } | { ok: false; message: string };

const NOT_SHARED = 'Không đọc được Google Sheet. Hãy chia sẻ Sheet ở chế độ "Bất kỳ ai có đường liên kết đều có thể xem".';

export function isAllowedHop(url: URL, devOrigin: string | null): boolean {
  if (devOrigin && url.origin === devOrigin) return true;
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
  return url.hostname === 'docs.google.com' || /^[a-z0-9-]+\.googleusercontent\.com$/.test(url.hostname);
}

/**
 * Dev memory runtime only: SCE_DEV_SHEET_ORIGIN (e.g. http://127.0.0.1:4555) serves fixture sheets in place of
 * https://docs.google.com, after the stored URL has passed the same guard. Never read in production.
 */
function devSheetOrigin(): string | null {
  if (!devMemoryEnabled()) return null;
  const raw = process.env.SCE_DEV_SHEET_ORIGIN;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost' ? u.origin : null;
  } catch {
    return null;
  }
}

async function readCapped(res: Response, max: number): Promise<string | null> {
  const declared = Number(res.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > max) return null;
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  return new TextDecoder('utf-8').decode(all);
}

export interface SheetFetchOptions {
  fetch?: typeof fetch;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  /** Tests pass it; the app takes it from devSheetOrigin(). */
  devOrigin?: string | null;
}

export async function fetchSheetCsv(storedUrl: string, o: SheetFetchOptions = {}): Promise<SheetFetchResult> {
  if (!isSheetCsvUrl(storedUrl)) return { ok: false, message: 'Link Google Sheet đã lưu không hợp lệ. Hãy dán lại link Sheet phản hồi.' };
  const fetchImpl = o.fetch ?? fetch;
  const devOrigin = o.devOrigin === undefined ? devSheetOrigin() : o.devOrigin;
  const signal = AbortSignal.timeout(o.timeoutMs ?? SHEET_TIMEOUT_MS);
  let url = new URL(devOrigin ? storedUrl.replace('https://docs.google.com', devOrigin) : storedUrl);
  try {
    for (let hop = 0; ; hop += 1) {
      if (!isAllowedHop(url, devOrigin)) return { ok: false, message: 'Google Sheet chuyển hướng tới địa chỉ không được phép.' };
      const res = await fetchImpl(url.href, { redirect: 'manual', signal, headers: { accept: 'text/csv' }, cache: 'no-store' });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location || hop >= (o.maxRedirects ?? SHEET_MAX_REDIRECTS)) return { ok: false, message: 'Google Sheet chuyển hướng quá nhiều lần.' };
        url = new URL(location, url);
        continue;
      }
      if (res.status === 401 || res.status === 403 || res.status === 404) return { ok: false, message: NOT_SHARED };
      if (!res.ok) return { ok: false, message: `Google Sheet trả lỗi HTTP ${res.status}. Vui lòng thử lại sau.` };
      if (/text\/html/i.test(res.headers.get('content-type') ?? '')) return { ok: false, message: NOT_SHARED };
      const text = await readCapped(res, o.maxBytes ?? SHEET_MAX_BYTES);
      if (text === null) return { ok: false, message: `Google Sheet lớn hơn ${Math.round((o.maxBytes ?? SHEET_MAX_BYTES) / 1024 / 1024)} MB, không thể đồng bộ.` };
      return { ok: true, text };
    }
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return { ok: false, message: timedOut ? 'Google Sheet không phản hồi kịp (quá 10 giây). Vui lòng thử lại.' : 'Không kết nối được Google Sheet. Vui lòng thử lại.' };
  }
}
