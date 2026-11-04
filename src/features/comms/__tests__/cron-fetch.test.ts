import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventId } from '@/core/brand';
import { bearerMatches, handleCronSync, serverSyncReady } from '../server/cron';
import { DEV_SHEET_URL } from '../server/dev-sheets';
import { fetchSheetCsv, isAllowedHop } from '../server/sheet-fetch';
import { defaultSheetSource, FAKE_UNKNOWN_SHEET } from '../server/sheet-source';
import { admin, harness, xtdtUser } from './harness';

const SECRET = 'a-long-random-cron-secret-value';
const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${ID}/export?format=csv`;

describe('cron route auth', () => {
  const deps = (h: ReturnType<typeof harness>, sync = vi.fn(async () => ({ ok: true as const, value: { status: 'error' as const, message: 'x' } }))) => ({
    secret: SECRET,
    systemContext: async () => h.ctx(admin),
    sync,
  });
  const req = (auth?: string) => new Request('http://localhost/api/cron/rsvp-sync', { headers: auth ? { authorization: auth } : {} });

  it.each([
    ['missing', undefined, 401],
    ['wrong', `Bearer ${SECRET}x`, 401],
    ['without Bearer', SECRET, 401],
    ['under another 7-character scheme', `Token: ${SECRET}`, 401],
    ['with a lower-case scheme', `bearer ${SECRET}`, 401],
    ['empty bearer', 'Bearer ', 401],
    ['right', `Bearer ${SECRET}`, 200],
  ])('%s secret (header %j) -> %i', async (_, auth, status) => {
    const h = harness();
    const sync = vi.fn(async () => ({ ok: true as const, value: { status: 'error' as const, message: 'x' } }));
    const res = await handleCronSync(req(auth), deps(h, sync));
    expect(res.status).toBe(status);
    if (status === 401) expect(sync).not.toHaveBeenCalled();
  });

  it('refuses to run when CRON_SECRET is unset or short', async () => {
    const h = harness();
    expect((await handleCronSync(req('Bearer '), { ...deps(h), secret: undefined })).status).toBe(503);
    expect((await handleCronSync(req('Bearer short'), { ...deps(h), secret: 'short' })).status).toBe(503);
  });

  it('answers 503 when the deployment has no system identity', async () => {
    const h = harness();
    expect((await handleCronSync(req(`Bearer ${SECRET}`), { ...deps(h), systemContext: async () => null })).status).toBe(503);
  });

  it('syncs every event with auto sync on and a sheet, and only those', async () => {
    const h = harness();
    const [a, b, c] = [await h.createEvent(), await h.createEvent(), await h.createEvent()];
    const save = (eventId: EventId, autoSync: boolean, sheetUrl: string | null) =>
      h.ok(xtdtUser, 'comms.saveForm', { eventId, version: null, config: { formUrl: null, sheetUrl, autoSync, autoAddNewGuests: false } } as never);
    await save(a, true, CSV_URL);
    await save(b, false, CSV_URL);
    await save(c, true, null);
    const sync = vi.fn(async () => ({ ok: true as const, value: { status: 'error' as const, message: 'x' } }));
    const res = await handleCronSync(req(`Bearer ${SECRET}`), deps(h, sync));
    expect(await res.json()).toMatchObject({ synced: 1, results: [{ eventId: a }] });
    expect(sync.mock.calls.map((call) => (call as unknown[])[1])).toEqual([a]);
  });

  it('compares the bearer in constant time over equal-length digests', () => {
    expect(bearerMatches(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(bearerMatches(`Bearer ${SECRET.slice(0, -1)}`, SECRET)).toBe(false);
    expect(bearerMatches(null, SECRET)).toBe(false);
  });
});

/** A fetch that answers per URL; records every URL asked for. */
function fakeFetch(routes: Record<string, () => Response>) {
  const asked: string[] = [];
  const impl = vi.fn(async (url: string, init?: RequestInit) => {
    asked.push(url);
    expect(init?.redirect).toBe('manual');
    const route = routes[url];
    if (!route) throw new TypeError('fetch failed');
    return route();
  });
  return { impl: impl as unknown as typeof fetch, asked };
}
const csvResponse = (body: string) => () => new Response(body, { status: 200, headers: { 'content-type': 'text/csv; charset=utf-8' } });
const redirect = (location: string) => () => new Response(null, { status: 307, headers: { location } });

describe('serverSyncReady', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('is false in production, which has no system identity yet, whatever the secret', () => {
    vi.stubEnv('SCE_DEV_MEMORY', '');
    expect(serverSyncReady(SECRET)).toBe(false);
  });
  it('needs a valid secret where the identity exists (dev memory)', () => {
    vi.stubEnv('SCE_DEV_MEMORY', '1');
    vi.stubEnv('NODE_ENV', 'development');
    expect(serverSyncReady(SECRET)).toBe(true);
    expect(serverSyncReady('short')).toBe(false);
    expect(serverSyncReady(undefined)).toBe(false);
  });
});

describe('fetchSheetCsv (no open proxy)', () => {
  it('reads the export through a redirect to Google’s content host', async () => {
    const hop = 'https://doc-0s-4c-sheets.googleusercontent.com/export/abc';
    const f = fakeFetch({ [CSV_URL]: redirect(hop), [hop]: csvResponse('Họ và tên\nAn') });
    expect(await fetchSheetCsv(CSV_URL, { fetch: f.impl })).toEqual({ ok: true, text: 'Họ và tên\nAn' });
    expect(f.asked).toEqual([CSV_URL, hop]);
  });

  it.each([
    'https://evil.com/spreadsheets/d/x/export?format=csv',
    `http://docs.google.com/spreadsheets/d/${ID}/export?format=csv`,
    'http://169.254.169.254/latest/meta-data/',
    'http://127.0.0.1:5432/',
    `https://docs.google.com/spreadsheets/d/${ID}/edit`,
    'file:///etc/passwd',
  ])('refuses the stored URL %s without fetching', async (url) => {
    const f = fakeFetch({});
    expect((await fetchSheetCsv(url, { fetch: f.impl })).ok).toBe(false);
    expect(f.asked).toEqual([]);
  });

  it.each([
    ['another host', 'https://evil.com/steal'],
    ['plain http on Google', 'http://doc-0s.googleusercontent.com/x'],
    ['a look-alike host', 'https://googleusercontent.com.evil.com/x'],
    ['a Google-looking prefix on another domain', 'https://doc-0s.googleusercontent.com.evil.com/x'],
    ['the metadata address', 'http://169.254.169.254/latest/meta-data/'],
    ['localhost', 'http://localhost:3000/api'],
  ])('refuses a redirect to %s and never fetches it', async (_, location) => {
    const f = fakeFetch({ [CSV_URL]: redirect(location) });
    const r = await fetchSheetCsv(CSV_URL, { fetch: f.impl });
    expect(r).toEqual({ ok: false, message: 'Google Sheet chuyển hướng tới địa chỉ không được phép.' });
    expect(f.asked).toEqual([CSV_URL]);
  });

  it('stops after three redirects', async () => {
    const hops = [1, 2, 3, 4].map((i) => `https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&hop=${i}`);
    const f = fakeFetch({ [CSV_URL]: redirect(hops[0]!), [hops[0]!]: redirect(hops[1]!), [hops[1]!]: redirect(hops[2]!), [hops[2]!]: redirect(hops[3]!) });
    expect(await fetchSheetCsv(CSV_URL, { fetch: f.impl })).toEqual({ ok: false, message: 'Google Sheet chuyển hướng quá nhiều lần.' });
    expect(f.asked).toHaveLength(4);
  });

  it('refuses a response over the size cap, declared or streamed', async () => {
    const declared = fakeFetch({ [CSV_URL]: () => new Response('x', { status: 200, headers: { 'content-type': 'text/csv', 'content-length': String(6 * 1024 * 1024) } }) });
    expect((await fetchSheetCsv(CSV_URL, { fetch: declared.impl })).ok).toBe(false);
    const streamed = fakeFetch({ [CSV_URL]: csvResponse('a,b\n'.repeat(400)) });
    expect(await fetchSheetCsv(CSV_URL, { fetch: streamed.impl, maxBytes: 1000 })).toMatchObject({ ok: false, message: expect.stringContaining('lớn hơn') });
  });

  it('reads an HTML answer (a sheet that is not shared) as an error, not as data', async () => {
    const f = fakeFetch({ [CSV_URL]: () => new Response('<html>Sign in</html>', { status: 200, headers: { 'content-type': 'text/html' } }) });
    expect(await fetchSheetCsv(CSV_URL, { fetch: f.impl })).toMatchObject({ ok: false, message: expect.stringContaining('chia sẻ') });
  });

  it('gives up after the time limit', async () => {
    const slow = vi.fn((_: string, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })))));
    expect(await fetchSheetCsv(CSV_URL, { fetch: slow as unknown as typeof fetch, timeoutMs: 20 })).toMatchObject({ ok: false, message: expect.stringContaining('không phản hồi kịp') });
  });

  it.each(['https://10.0.0.1/x', 'https://192.168.1.10/x', 'https://[::1]/x', 'https://169.254.169.254/x', 'https://docs.google.com:8443/x', 'https://user:pw@docs.google.com/x'])(
    'never treats %s as an allowed hop, https or not',
    (href) => expect(isAllowedHop(new URL(href))).toBe(false),
  );
});

describe('the sheet source the app commands use', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('under SCE_DEV_MEMORY answers the dev fixture and any other sheet without opening a connection', async () => {
    vi.stubEnv('SCE_DEV_MEMORY', '1');
    vi.stubEnv('NODE_ENV', 'development');
    const net = vi.fn(async () => new Response('should not be asked'));
    vi.stubGlobal('fetch', net);
    expect(defaultSheetSource.kind).toBe('fake');
    expect(await defaultSheetSource.read(DEV_SHEET_URL)).toMatchObject({ ok: true, text: expect.stringContaining('thu.nghiem.e@example.com') });
    expect(await defaultSheetSource.read(CSV_URL)).toEqual({ ok: false, message: FAKE_UNKNOWN_SHEET });
    expect(net).not.toHaveBeenCalled();
  });

  it('outside dev memory reads Google through the guarded fetch', async () => {
    vi.stubEnv('SCE_DEV_MEMORY', '');
    const net = vi.fn(async () => new Response('Họ và tên\nAn', { status: 200, headers: { 'content-type': 'text/csv' } }));
    vi.stubGlobal('fetch', net);
    expect(defaultSheetSource.kind).toBe('google');
    expect(await defaultSheetSource.read(CSV_URL)).toEqual({ ok: true, text: 'Họ và tên\nAn' });
    expect(net).toHaveBeenCalledWith(CSV_URL, expect.objectContaining({ redirect: 'manual' }));
    expect(await defaultSheetSource.read('http://169.254.169.254/latest/meta-data/')).toMatchObject({ ok: false });
    expect(net).toHaveBeenCalledTimes(1);
  });
});
