// Imports the legacy systemSettings into the settings singleton. unitSenderEmails
// belong to comms (sender mailboxes) and are left to its importer; the legacy
// departments list was never read (core B22) and is dropped.

import type { ImportIssue, LegacyImporter } from '@/core/legacy';

const RANGES = {
  dailyReportThresholdDays: ['daily_report_threshold_days', 1, 30],
  fieldPresenceHours: ['field_presence_hours', 1, 5],
  guestQuotaPercent: ['guest_quota_percent', 100, 200],
  badgeQuotaPercent: ['badge_quota_percent', 100, 200],
} as const;

export const coreLegacyImporter: LegacyImporter = {
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

    const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const agency = text(s.agencyName);
    if (agency) {
      // Legacy stored 'TRUNG TÂM … HÀ NỘI (SCE)'; the short name has its own column now.
      const m = /^(.*?)\s*\(([^()]+)\)$/.exec(agency);
      row.agency_name = m ? m[1] : agency;
      if (m) row.agency_short_name = m[2]!.trim();
    }
    if (text(s.parentAgency)) row.parent_agency = text(s.parentAgency);
    if (text(s.googleClientId)) row.google_client_id = text(s.googleClientId);

    for (const [field, [column, min, max]] of Object.entries(RANGES)) {
      const value = Number(s[field]);
      if (s[field] === undefined || s[field] === null || s[field] === '') continue;
      if (Number.isInteger(value) && value >= min && value <= max) row[column] = value;
      else issues.push({ severity: 'coerced', blobKey: 'systemSettings', legacyId: field, message: `${field} = ${JSON.stringify(s[field])} ngoài khoảng ${min}..${max}; giữ giá trị mặc định.` });
    }
    return { batches: [{ table: 'sce_tcsk_system_settings', rows: [row] }], issues };
  },
};
