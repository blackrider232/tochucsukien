import { describe, expect, it } from 'vitest';
import { featureManifests } from '@/features/registry';
import { legacyImporter as coreLegacyImporter } from '@/features/core/server/legacy-importer';
import { blobCoverage, formatReport, parseArgs } from './import-legacy';

describe('import-legacy CLI', () => {
  it('parses flags, with the path positional or after --path', () => {
    expect(parseArgs(['--dry-run', '--source', 'file', 'a.json'])).toEqual({ source: { kind: 'file', path: 'a.json' }, dryRun: true, includeDemo: false, keepAdmins: [] });
    expect(parseArgs(['--source', 'file', '--path', 'b.json', '--include-demo'])).toMatchObject({ source: { kind: 'file', path: 'b.json' }, includeDemo: true });
    expect(parseArgs(['--source', 'database', '--keep-admins', 'a@sce.vn, b@sce.vn'])).toMatchObject({ source: { kind: 'database' }, keepAdmins: ['a@sce.vn', 'b@sce.vn'] });
    expect(() => parseArgs(['a.json'])).toThrow('--source file|database is required');
    expect(() => parseArgs(['--source', 'file'])).toThrow('needs a path');
    expect(() => parseArgs(['--source', 'file', 'a.json', '--force'])).toThrow('unknown flag --force');
  });

  it('reports each blob key with its rows, demo rows and owners', () => {
    const coverage = blobCoverage(
      { events: [{ id: 'evt_1', name: 'Hội chợ Đặc sản Vùng miền và Sản phẩm OCOP Hà Nội 2026' }, { id: 'evt_2', name: 'Thật' }], eventBooths: { evt_2: [{ id: 'bth_01' }, { id: 'b2' }] }, systemSettings: { agencyName: 'X' }, junk: 1 },
      featureManifests(),
      [coreLegacyImporter],
    );
    expect(coverage).toEqual([
      { key: 'eventBooths', rows: 2, demoRows: 1, owners: [{ feature: 'venue', hasImporter: false }] },
      { key: 'events', rows: 2, demoRows: 1, owners: [{ feature: 'progress', hasImporter: false }, { feature: 'comms', hasImporter: false }] },
      { key: 'junk', rows: 0, demoRows: 0, owners: [] },
      { key: 'systemSettings', rows: 1, demoRows: 0, owners: [{ feature: 'core', hasImporter: true }, { feature: 'comms', hasImporter: false }] },
    ]);
    const text = formatReport(
      { source: { kind: 'file', path: 'f.json' }, dryRun: true, includeDemo: false, keepAdmins: [] },
      { counts: [], issues: [], demotedAdmins: [], preImportBackupId: null },
      coverage,
      [coreLegacyImporter],
    );
    expect(text).toContain('Legacy import (dry run, nothing written) from file f.json');
    expect(text).toMatch(/junk\s+0\s+0\s+UNCLAIMED/);
    expect(text).toContain('Pre-import backup: none (dry run)');
  });
});
