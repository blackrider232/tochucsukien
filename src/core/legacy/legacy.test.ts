import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildWorkCalendar } from '@/core/dates';
import type { ImportStore } from '@/core/db/import-store';
import {
  deterministicIds,
  isDemoLegacyEvent,
  isDemoLegacyId,
  normalizeBlob,
  orderImporters,
  planLegacyImport,
  runLegacyImportWith,
  uuidV5,
  type ImportIo,
  type LegacyBlob,
  type LegacyImporter,
} from '@/core/legacy';
import { coreLegacyImporter } from '@/features/core/server/legacy';

const fixture = normalizeBlob(JSON.parse(readFileSync(join(process.cwd(), 'scripts/__fixtures__/legacy-blob.json'), 'utf8')));

const eventsImporter: LegacyImporter = {
  feature: 'progress',
  dependsOn: [],
  plan(blob, ctx) {
    const issues: ReturnType<LegacyImporter['plan']>['issues'][number][] = [];
    const rows = (blob.events as Array<{ id: string; name: string }>).flatMap((e) => {
      if (!ctx.includeDemo && isDemoLegacyEvent(e)) {
        issues.push({ severity: 'skipped_demo', blobKey: 'events', legacyId: e.id, message: e.name });
        return [];
      }
      return [{ id: ctx.ids.eventId(e.id), legacy_id: e.id, name: e.name }];
    });
    return { batches: [{ table: 'sce_tcsk_events', rows }], issues };
  },
};
const guestsImporter: LegacyImporter = {
  feature: 'guests',
  dependsOn: ['progress'],
  plan(blob, ctx) {
    const byEvent = blob.eventGuests as Record<string, Array<{ id: string; name: string }>>;
    const rows = Object.entries(byEvent).flatMap(([ev, guests]) =>
      guests.filter((g) => ctx.includeDemo || !isDemoLegacyId(g.id)).map((g) => ({ id: ctx.ids.idFor('Guest', g.id, ev), event_id: ctx.ids.eventId(ev), legacy_id: g.id, name: g.name })),
    );
    return { batches: [{ table: 'sce_tcsk_guests', rows }], issues: [] };
  },
};
const venueImporter: LegacyImporter = { feature: 'venue', dependsOn: ['guests', 'progress', 'reports'], plan: () => ({ batches: [{ table: 'sce_tcsk_booths', rows: [] }], issues: [] }) };

function fakeIo(blob: unknown = fixture) {
  const log: string[] = [];
  const store: ImportStore = {
    readBlob: async () => blob,
    readHolidays: async () => [],
    insertPreMigrationBackup: async () => {
      log.push('backup');
      return 41;
    },
    upsert: async (table, rows) => {
      log.push(`upsert ${table} ${rows.length}`);
      return rows.length;
    },
    demoteAdmins: async (keep) => {
      log.push(`demote keeping ${keep.join(',')}`);
      return ['xadmin@gmail.com'];
    },
    markMigrated: async () => {
      log.push('migrated');
    },
  };
  let storeRequested = false;
  const io: ImportIo = {
    loadBlob: async () => blob,
    holidays: async () => [],
    store: () => {
      storeRequested = true;
      return store;
    },
  };
  return { io, log, storeRequested: () => storeRequested };
}

describe('deterministic ids', () => {
  it('implements RFC 4122 uuid v5', () => {
    expect(uuidV5('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'www.example.com')).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
  });

  it('gives the same id every run, distinct per entity and scope', () => {
    const a = deterministicIds.idFor('Guest', 'gst_1', 'evt_1');
    expect(deterministicIds.idFor('Guest', 'gst_1', 'evt_1')).toBe(a);
    expect(deterministicIds.idFor('Guest', 'gst_1', 'evt_2')).not.toBe(a);
    expect(deterministicIds.idFor('Booth', 'gst_1', 'evt_1')).not.toBe(a);
    expect(deterministicIds.eventId('evt_1')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('demo detection', () => {
  it.each(['gst_vip_01', 'gst_bc_04', 'bth_16', 'duty_03', 'sc_02', 'media_01', 'bid_03', 'rpt_t10', 'GF-SIM-01'])('%s is demo', (id) => {
    expect(isDemoLegacyId(id)).toBe(true);
  });
  it.each(['gst_1761200100000', 'gst_vip_1761200100000', 'bth_A01x', 'evt_1'])('%s is real', (id) => {
    expect(isDemoLegacyId(id)).toBe(false);
  });
  it('recognises the seeded sample events by name', () => {
    expect(isDemoLegacyEvent({ name: 'Hội chợ Đặc sản Vùng miền và Sản phẩm OCOP Hà Nội 2026' })).toBe(true);
    expect(isDemoLegacyEvent({ name: 'Hội nghị thật' })).toBe(false);
  });
});

describe('importer ordering', () => {
  it('sorts by dependsOn, ignoring features without an importer', () => {
    expect(orderImporters([venueImporter, guestsImporter, eventsImporter]).map((i) => i.feature)).toEqual(['progress', 'guests', 'venue']);
  });

  it('refuses a dependency cycle', () => {
    const a: LegacyImporter = { feature: 'guests', dependsOn: ['venue'], plan: () => ({ batches: [], issues: [] }) };
    const b: LegacyImporter = { feature: 'venue', dependsOn: ['guests'], plan: () => ({ batches: [], issues: [] }) };
    expect(() => orderImporters([a, b])).toThrow('cycle: guests -> venue -> guests');
  });
});

describe('planning', () => {
  const ctx = (includeDemo: boolean) => ({ ids: deterministicIds, calendar: buildWorkCalendar([]), includeDemo });

  it('skips demo rows and reports them, unless --include-demo', () => {
    const plan = planLegacyImport(fixture, [guestsImporter, eventsImporter], ctx(false));
    expect(plan.batches.map((b) => [b.table, b.rows.length])).toEqual([['sce_tcsk_events', 1], ['sce_tcsk_guests', 1]]);
    expect(plan.issues).toEqual([expect.objectContaining({ severity: 'skipped_demo', blobKey: 'events', legacyId: 'evt_1761200000001' })]);
    const all = planLegacyImport(fixture, [guestsImporter, eventsImporter], ctx(true));
    expect(all.batches.map((b) => b.rows.length)).toEqual([2, 2]);
  });

  it('re-planning yields identical rows, so a re-run converges on the same ids', () => {
    expect(planLegacyImport(fixture, [eventsImporter, guestsImporter], ctx(false))).toEqual(planLegacyImport(fixture, [eventsImporter, guestsImporter], ctx(false)));
  });

  it('unwraps a sce_tcsk_app_data row and rejects non-objects', () => {
    expect(normalizeBlob({ id: 1, data: { events: [] } })).toEqual({ events: [] });
    expect(() => normalizeBlob([1, 2])).toThrow('must be a JSON object');
  });
});

describe('runLegacyImportWith', () => {
  const opts = { source: { kind: 'file' as const, path: 'x.json' }, includeDemo: false, keepAdmins: ['admin@sce.vn'] };

  it('a dry run plans and reports without touching the database', async () => {
    const io = fakeIo();
    const report = await runLegacyImportWith({ ...opts, dryRun: true }, [eventsImporter, guestsImporter], io.io);
    expect(io.storeRequested()).toBe(false);
    expect(report).toEqual({
      counts: [{ table: 'sce_tcsk_events', planned: 1, written: 0 }, { table: 'sce_tcsk_guests', planned: 1, written: 0 }],
      issues: [expect.objectContaining({ severity: 'skipped_demo' })],
      demotedAdmins: [],
      preImportBackupId: null,
    });
  });

  it('a real run backs up the blob first, writes in dependency order, demotes admins, marks the blob migrated', async () => {
    const io = fakeIo();
    const report = await runLegacyImportWith({ ...opts, dryRun: false }, [guestsImporter, eventsImporter], io.io);
    expect(io.log).toEqual(['backup', 'upsert sce_tcsk_events 1', 'upsert sce_tcsk_guests 1', 'demote keeping admin@sce.vn', 'migrated']);
    expect(report.preImportBackupId).toBe(41);
    expect(report.demotedAdmins).toEqual(['xadmin@gmail.com']);
    expect(report.counts).toEqual([{ table: 'sce_tcsk_events', planned: 1, written: 1 }, { table: 'sce_tcsk_guests', planned: 1, written: 1 }]);
  });
});

describe('core legacy importer (systemSettings)', () => {
  const plan = (blob: LegacyBlob) => coreLegacyImporter.plan(blob, { ids: deterministicIds, calendar: buildWorkCalendar([]), includeDemo: false });

  it('maps settings, splits the short name out of the agency name, keeps out-of-range values at default', () => {
    const p = plan(fixture);
    expect(p.batches).toEqual([
      {
        table: 'sce_tcsk_system_settings',
        rows: [{
          id: 1, agency_name: 'TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP HÀ NỘI', agency_short_name: 'SCE', parent_agency: 'SỞ TÀI CHÍNH HÀ NỘI',
          google_client_id: '1234-abc.apps.googleusercontent.com', daily_report_threshold_days: 10, field_presence_hours: 2, guest_quota_percent: 130,
        }],
      },
    ]);
    expect(p.issues.map((i) => [i.severity, i.blobKey, i.legacyId])).toEqual([['dropped_invalid', 'departments', null], ['coerced', 'systemSettings', 'badgeQuotaPercent']]);
  });

  it('plans nothing without systemSettings', () => {
    expect(plan({})).toEqual({ batches: [], issues: [] });
  });
});
