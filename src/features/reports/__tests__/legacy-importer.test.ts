import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildWorkCalendar } from '@/core/dates';
import { deterministicIds, normalizeBlob, type ImportContext } from '@/core/legacy';
import { legacyImporter } from '../server/legacy-importer';

const blob = normalizeBlob(JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'legacy-reports.json'), 'utf8')));
const ctx: ImportContext = { ids: deterministicIds, calendar: buildWorkCalendar([]), includeDemo: false };
const plan = (c: ImportContext = ctx) => legacyImporter.plan(blob, c);
const rows = (table: string, p = plan()) => p.batches.find((b) => b.table === table)?.rows ?? [];
const issuesOf = (severity: string, p = plan()) => p.issues.filter((i) => i.severity === severity).map((i) => i.legacyId);
const EVT = deterministicIds.eventId('evt_real');

describe('reports legacy importer', () => {
  it('is deterministic and depends on progress', () => {
    expect(plan()).toEqual(plan());
    expect(legacyImporter.dependsOn).toEqual(['progress']);
  });

  it('skips the seeder rows (m6 BUG-01) and the rows of demo or missing events', () => {
    expect(issuesOf('skipped_demo')).toEqual(expect.arrayContaining(['media_01', 'bid_02', 'rpt_t10', 'evt_demo']));
    expect(issuesOf('orphan')).toEqual(['evt_gone']);
    expect(rows('sce_tcsk_media_clippings').map((r) => r.legacy_id)).not.toContain('media_01');
    expect(rows('sce_tcsk_media_clippings', plan({ ...ctx, includeDemo: true })).map((r) => r.legacy_id)).toContain('media_01');
  });

  it('imports clippings, dropping unsafe links and fixing unknown types and dates, each reported', () => {
    expect(rows('sce_tcsk_media_clippings')).toEqual([
      { id: deterministicIds.idFor('MediaClipping', 'media_1730000000001', 'evt_real'), event_id: EVT, legacy_id: 'media_1730000000001', outlet: 'Báo Hà Nội Mới', title: 'Hà Nội đón nhà đầu tư Hàn Quốc', published_on: '2026-12-01', media_type: 'Báo điện tử', url: 'https://hanoimoi.vn/a', author: 'Phóng viên thường trú' },
      { id: deterministicIds.idFor('MediaClipping', 'media_1730000000002', 'evt_real'), event_id: EVT, legacy_id: 'media_1730000000002', outlet: 'VTV', title: 'Phóng sự <b>XSS</b>', published_on: '2026-12-15', media_type: 'Báo điện tử', url: null, author: '' },
    ]);
    expect(issuesOf('coerced').filter((k) => k === 'media_1730000000002')).toHaveLength(3);
    expect(issuesOf('dropped_invalid')).toContain('media_1730000000003');
  });

  it('imports packages with a suffixed duplicate code, parsed money, no "Đang thương thảo" contractor and valid lists', () => {
    expect(rows('sce_tcsk_bidding_packages').map((r) => [r.code, r.department, r.budget_vnd, r.winning_price_vnd, r.contractor, r.status])).toEqual([
      ['TB-2026-001', 'Phòng Xúc tiến đầu tư', 220000000, 215000000, null, 'Đang thực hiện hợp đồng'],
      ['TB-2026-001-2', 'Phòng Hành chính - Tổ chức', 160000000, null, 'Công ty A', 'Đang thực hiện hợp đồng'],
    ]);
    expect(issuesOf('dropped_invalid')).toContain('bid_1730000000003');
  });

  it('imports a hand-written report once per day, clamped, signed by the lead department head, without invented figures', () => {
    expect(rows('sce_tcsk_daily_reports')).toEqual([
      expect.objectContaining({
        legacy_id: 'daily_1', event_id: EVT, report_date: '2026-12-08', workdays_to_event: 5, progress_percent: 100, key_highlight: 'Đã chốt kịch bản', blockers: 'Chờ địa điểm',
        signatory: 'Trần Văn Bình', signatory_title: 'TRƯỞNG PHÒNG XÚC TIẾN ĐẦU TƯ', figures: { progressPercent: 100 }, event_name: 'Hội nghị XTĐT Hà Nội - Hàn Quốc 2026',
        issued_at: '2026-12-08T09:30:00.000Z', issued_by: null,
      }),
    ]);
    expect(issuesOf('dropped_invalid')).toContain('daily_2');
  });
});
