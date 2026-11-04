// Turns what staff paste (an edit link, a "publish to web" link or a bare id)
// into the CSV export URL. Only https docs.google.com spreadsheet links are
// accepted, and the tab id (gid) is kept (m4a B20, m4c B43). The export
// endpoint returns cell text as typed, unlike gviz, which infers types (m4a B58).

import type { SafeUrl } from '@/core/brand';

export type SheetUrlResult = { ok: true; csvUrl: SafeUrl } | { ok: false; message: string };

const SHEETS_HOST = 'docs.google.com';
const BARE_ID = /^[A-Za-z0-9_-]{25,}$/;
const NOT_A_SHEET = 'Liên kết phải là Google Sheet dạng https://docs.google.com/spreadsheets/d/…';

function gidOf(url: URL): string | null {
  const fromQuery = url.searchParams.get('gid');
  const fromHash = /(?:^|[#&])gid=(\d+)/.exec(url.hash)?.[1] ?? null;
  const gid = fromQuery ?? fromHash;
  return gid && /^\d{1,12}$/.test(gid) ? gid : null;
}

export function toSheetCsvUrl(input: string): SheetUrlResult {
  const raw = input.trim();
  if (BARE_ID.test(raw)) return { ok: true, csvUrl: `https://${SHEETS_HOST}/spreadsheets/d/${raw}/export?format=csv` as SafeUrl };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, message: NOT_A_SHEET };
  }
  if (url.protocol !== 'https:' || url.hostname !== SHEETS_HOST || url.username || url.password || (url.port && url.port !== '443')) {
    return { ok: false, message: NOT_A_SHEET };
  }
  const gid = gidOf(url);
  const published = /^\/spreadsheets\/d\/e\/([A-Za-z0-9_-]{20,})\/pub(?:html)?\/?$/.exec(url.pathname);
  if (published) {
    const tab = gid ? `&gid=${gid}&single=true` : '';
    return { ok: true, csvUrl: `https://${SHEETS_HOST}/spreadsheets/d/e/${published[1]}/pub?output=csv${tab}` as SafeUrl };
  }
  const sheet = /^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})(?:\/.*)?$/.exec(url.pathname);
  if (sheet && sheet[1] !== 'e') {
    return { ok: true, csvUrl: `https://${SHEETS_HOST}/spreadsheets/d/${sheet[1]}/export?format=csv${gid ? `&gid=${gid}` : ''}` as SafeUrl };
  }
  return { ok: false, message: NOT_A_SHEET };
}

/** The guard the server fetch applies again to whatever is stored: the URL toSheetCsvUrl produces, and nothing else. */
export function isSheetCsvUrl(raw: string): boolean {
  const r = toSheetCsvUrl(raw);
  return r.ok && r.csvUrl === raw;
}

/** A Google Form link: https on docs.google.com/forms or forms.gle. */
export function parseFormUrl(input: string): SafeUrl | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const ok = (url.hostname === SHEETS_HOST && url.pathname.startsWith('/forms/')) || url.hostname === 'forms.gle';
    return ok ? (url.href as SafeUrl) : null;
  } catch {
    return null;
  }
}
