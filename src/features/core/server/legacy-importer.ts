// Imports the legacy systemSettings into the settings singleton. Its six form
// fields and googleClientId land in typed columns; unitSenderEmails belong to
// comms (sender mailboxes) and are left to its importer; the legacy departments
// list was never read (core B22) and is dropped. Profiles, the legacy audit rows
// and the whole-blob backups are not blob keys: 0001 converts them in place
// (is_active -> status, '' department -> null, old backups -> kind auto, format 1),
// and scripts/import-legacy.ts writes the pre-migration backup and demotes
// admins outside --keep-admins (core B1).

import type { ImportIssue, LegacyImporter } from '@/core/legacy';

const RANGES = {
  dailyReportThresholdDays: ['daily_report_threshold_days', 1, 30],
  fieldPresenceHours: ['field_presence_hours', 1, 5],
  guestQuotaPercent: ['guest_quota_percent', 100, 200],
  badgeQuotaPercent: ['badge_quota_percent', 100, 200],
} as const;
const TEXT_MAX = { agency_name: 300, agency_short_name: 40, parent_agency: 300, google_client_id: 300 } as const;

export const legacyImporter: LegacyImporter = {
  feature: 'core',
  dependsOn: [],
  plan(blob) {
    const issues: ImportIssue[] = [];
    if (Array.isArray(blob.departments)) {
      issues.push({ severity: 'dropped_invalid', blobKey: 'departments', legacyId: null, message: 'Danh sách phòng ban cũ không còn dùng; phòng ban lấy từ sce_tcsk_departments.' });
    }
    const raw = blob.systemSettings;
    if (!raw || typeof raw !== 'object') return { batches: [], issues };
    const s = raw as Record<string, unknown>;
    const row: Record<string, unknown> = { id: 1 };

    const put = (column: keyof typeof TEXT_MAX, field: string, value: unknown) => {
      const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
      if (!text) return;
      if (text.length > TEXT_MAX[column]) {
        issues.push({ severity: 'coerced', blobKey: 'systemSettings', legacyId: field, message: `${field} dài hơn ${TEXT_MAX[column]} ký tự; giữ giá trị mặc định.` });
        return;
      }
      row[column] = text;
    };
    const agency = typeof s.agencyName === 'string' ? s.agencyName.replace(/\s+/g, ' ').trim() : '';
    // Legacy stored 'TRUNG TÂM … HÀ NỘI (SCE)'; the short name has its own column now.
    const m = /^(.*?)\s*\(([^()]+)\)$/.exec(agency);
    put('agency_name', 'agencyName', m ? m[1] : agency);
    if (m) put('agency_short_name', 'agencyName', m[2]);
    put('parent_agency', 'parentAgency', s.parentAgency);
    put('google_client_id', 'googleClientId', s.googleClientId);

    for (const [field, [column, min, max]] of Object.entries(RANGES)) {
      if (s[field] === undefined || s[field] === null || s[field] === '') continue;
      const value = Number(s[field]);
      if (Number.isInteger(value) && value >= min && value <= max) row[column] = value;
      else issues.push({ severity: 'coerced', blobKey: 'systemSettings', legacyId: field, message: `${field} = ${JSON.stringify(s[field])} ngoài khoảng ${min}..${max}; giữ giá trị mặc định.` });
    }
    return { batches: [{ table: 'sce_tcsk_system_settings', rows: [row] }], issues };
  },
};
