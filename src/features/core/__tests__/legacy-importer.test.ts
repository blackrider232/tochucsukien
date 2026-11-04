import { describe, expect, it } from 'vitest';
import { buildWorkCalendar } from '@/core/dates';
import type { ImportStore } from '@/core/db/import-store';
import { deterministicIds, runLegacyImportWith, type LegacyBlob } from '@/core/legacy';
import { legacyImporter } from '../server/legacy-importer';
import fixture from './fixtures/legacy-core.json';

const ctx = { ids: deterministicIds, calendar: buildWorkCalendar([]), includeDemo: false };
const plan = (blob: LegacyBlob) => legacyImporter.plan(blob, ctx);

describe('core legacy importer', () => {
  it('maps the legacy settings into typed columns and reports what it kept at default', () => {
    const p = plan(fixture);
    expect(p.batches).toEqual([{
      table: 'sce_tcsk_system_settings',
      rows: [{ id: 1, agency_name: 'TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP HÀ NỘI', agency_short_name: 'SCE', parent_agency: 'SỞ TÀI CHÍNH HÀ NỘI', daily_report_threshold_days: 12, guest_quota_percent: 140 }],
    }]);
    expect(p.issues.map((i) => [i.severity, i.blobKey, i.legacyId])).toEqual([
      ['dropped_invalid', 'departments', null],
      ['coerced', 'systemSettings', 'fieldPresenceHours'],
      ['coerced', 'systemSettings', 'badgeQuotaPercent'],
    ]);
  });

  it('never writes sender mailboxes (comms owns them) and plans the same rows on every run', () => {
    const p = plan(fixture);
    expect(JSON.stringify(p.batches)).not.toContain('gmail');
    expect(plan(fixture)).toEqual(p);
  });

  it('keeps an over-long text at default instead of failing the import', () => {
    const p = plan({ systemSettings: { parentAgency: 'X'.repeat(301), agencyName: 'Trung tâm (Tên viết tắt dài hơn bốn mươi ký tự của trung tâm)' } });
    expect(p.batches[0]!.rows[0]).toEqual({ id: 1, agency_name: 'Trung tâm' });
    expect(p.issues.map((i) => i.legacyId)).toEqual(['agencyName', 'parentAgency']);
  });

  it('runs through the import script: pre-migration backup first, settings upserted, backdoor admins demoted, blob marked', async () => {
    const log: string[] = [];
    const store: ImportStore = {
      readBlob: async () => fixture,
      readHolidays: async () => [],
      insertPreMigrationBackup: async (blob) => (log.push(`backup ${Object.keys(blob as object).length} keys`), 7),
      upsert: async (table, rows) => (log.push(`upsert ${table} ${rows.length}`), rows.length),
      demoteAdmins: async (keep) => (log.push(`demote keeping ${keep.join(',')}`), ['xadmin@gmail.com']),
      markMigrated: async () => void log.push('migrated'),
    };
    const report = await runLegacyImportWith(
      { source: { kind: 'database' }, dryRun: false, includeDemo: false, keepAdmins: ['admin@sce.vn'] },
      [legacyImporter],
      { loadBlob: async () => fixture, holidays: async () => [], store: () => store },
    );
    expect(log).toEqual(['backup 4 keys', 'upsert sce_tcsk_system_settings 1', 'demote keeping admin@sce.vn', 'migrated']);
    expect(report).toMatchObject({ preImportBackupId: 7, demotedAdmins: ['xadmin@gmail.com'], counts: [{ table: 'sce_tcsk_system_settings', planned: 1, written: 1 }] });
  });
});
