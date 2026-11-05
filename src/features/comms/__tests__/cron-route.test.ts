import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The REAL route handler, with core's authorizeCron behind it. Dev memory is switched on or off with env stubs; no
// Supabase client is built (the 503 without a service key answers before any), and the network is never asked.
vi.mock('next/dist/compiled/server-only', () => ({}));
const network = vi.fn(async () => {
  throw new Error('no network');
});

const SECRET = 'c'.repeat(32);
const ID = '00000000-0000-4000-8000-0000000000aa';
const request = (auth?: string) => new Request('https://sce.local/api/cron/rsvp-sync', { headers: auth ? { authorization: auth } : {} });

/** A fresh module graph per test: the dev run claim and the dev store live in module state. */
async function load() {
  vi.resetModules();
  const { GET } = await import('@/app/api/cron/rsvp-sync/route');
  return { GET };
}

beforeEach(() => {
  vi.stubGlobal('fetch', network);
  vi.stubEnv('CRON_SECRET', SECRET);
});
afterEach(() => {
  expect(network).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('GET /api/cron/rsvp-sync outside dev memory', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SCE_DEV_MEMORY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  });

  it.each([
    ['no header', undefined],
    ['a wrong secret', `Bearer ${'d'.repeat(32)}`],
    ['the secret without Bearer', SECRET],
  ])('%s -> 401', async (_, auth) => {
    const { GET } = await load();
    const res = await GET(request(auth));
    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(JSON.stringify(await res.json())).not.toContain(SECRET);
  });

  it.each([
    ['a secret of 31 characters', 'c'.repeat(31)],
    ['a 16-character secret, which the route accepted before', 'c'.repeat(16)],
    ['no secret', ''],
  ])('%s -> 503, even when the bearer matches', async (_, secret) => {
    vi.stubEnv('CRON_SECRET', secret);
    const { GET } = await load();
    expect((await GET(request(`Bearer ${secret}`))).status).toBe(503);
  });

  it('the right secret without SUPABASE_SERVICE_ROLE_KEY -> 503, not a 500', async () => {
    const { GET } = await load();
    const res = await GET(request(`Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'Chưa cấu hình khóa dịch vụ để chạy tác vụ hệ thống.' });
  });
});

describe('GET /api/cron/rsvp-sync in dev memory, as the system actor', () => {
  beforeEach(async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SCE_DEV_MEMORY', '1');
  });

  /** Turns auto sync on for the dev event's form, through the dev admin, and returns what the audit screen reads. */
  async function setup() {
    const { resetDevRuntime } = await import('@/core/dev/runtime');
    await resetDevRuntime();
    const { devContext } = await import('@/core/dev/runtime');
    const dev = await devContext({ role: 'admin', department: null });
    if (!dev.ok) throw new Error('no dev context');
    const { formsTable } = await import('../server/tables');
    const [form] = await dev.db.table(formsTable).list();
    await dev.db.table(formsTable).update(form!.id, { autoSync: true }, { expectedVersion: form!.version });
    return { db: dev.db, eventId: form!.eventId };
  }

  it('a run syncs the form with system:rsvp-sync rows, and a second call inside the window is 429 and syncs nothing', async () => {
    const { GET } = await load();
    const { db, eventId } = await setup();
    const res = await GET(request(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ synced: 1, results: [{ eventId, status: 'ok', rows: 6, applied: 2 }] });

    const audits = async () => [...(await db.rpc('sce_tcsk_list_audit', { eventId, limit: 200 }))];
    const rows = await audits();
    // The sync, and the guest changes it made by asking guests, name the job and no person.
    expect(new Set(rows.map((r) => r.action))).toEqual(new Set(['ĐỒNG BỘ GOOGLE FORM', 'CẬP NHẬT RSVP']));
    expect(rows.filter((r) => r.action === 'CẬP NHẬT RSVP')).toHaveLength(2);
    expect(rows.every((r) => r.actorEmail === 'system:rsvp-sync')).toBe(true);

    const again = await GET(request(`Bearer ${SECRET}`));
    expect(again.status).toBe(429);
    expect(await audits()).toHaveLength(rows.length);
  });

  it('a wrong secret does not use up the window', async () => {
    const { GET } = await load();
    await setup();
    expect((await GET(request(`Bearer ${'d'.repeat(32)}`))).status).toBe(401);
    expect((await GET(request(`Bearer ${SECRET}`))).status).toBe(200);
  });

  it.each([
    ['a comms command outside the job’s pairs', 'comms.resolveResponse', { id: ID, version: 1, action: { kind: 'dismiss' } }],
    ['a venue command the cron path never calls', 'venue.assignSeat', { guestId: ID, seatCode: 'auto' }],
    ['a core command', 'core.settings.update', { version: 1, patch: {} }],
  ])('refuses %s for the system actor and writes no audit row', async (_, id, rest) => {
    vi.resetModules();
    const { authorizeCron, runCommandAsSystem } = await import('@/core/auth/cron');
    const { eventId, db } = await setup();
    const audits = async () => [...(await db.rpc('sce_tcsk_list_audit', { eventId, limit: 200 }))];
    const before = await audits();
    const auth = await authorizeCron(request(`Bearer ${SECRET}`), 'rsvp-sync');
    if (!auth.ok) throw new Error('not authorized');
    const refused = await runCommandAsSystem('rsvp-sync', auth.ctx, id as never, { eventId, ...rest } as never);
    expect(refused).toMatchObject({ ok: false, kind: 'forbidden' });
    expect(await audits()).toEqual(before);
  });
});
