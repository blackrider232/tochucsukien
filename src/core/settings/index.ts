// System settings (singleton row sce_tcsk_system_settings, id = 1). Core owns it.
// Every consumer reads these through RequestContext.settings or useSettings();
// pure functions take them as a parameter, so a hard-coded 10 / 1.3 / agency
// string has nowhere to live (core B12/B13, m2 BUG-07, m3 B15/B37, m5 BUG-18).

import { z } from 'zod';
import type { Version } from '@/core/brand';

export interface SystemSettings {
  /** 'TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP HÀ NỘI' */
  agencyName: string;
  /** 'SCE' */
  agencyShortName: string;
  /** 'SỞ TÀI CHÍNH HÀ NỘI' */
  parentAgency: string;
  /** 1..30, "ngày làm việc trước sự kiện" */
  dailyReportThresholdDays: number;
  /** 1..5, "tiếng trước khai mạc" */
  fieldPresenceHours: number;
  /** 100..200 */
  guestQuotaPercent: number;
  /** 100..200 */
  badgeQuotaPercent: number;
  /** Deployment-wide Google OAuth web client id; a mailbox may override it. */
  googleClientId: string | null;
  version: Version;
}

export type SettingsPatch = Partial<Omit<SystemSettings, 'version'>>;

/** Mirrors the column defaults of sce_tcsk_system_settings in 0001_foundation.sql. */
export const DEFAULT_SETTINGS: Omit<SystemSettings, 'version'> = {
  agencyName: 'TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP HÀ NỘI',
  agencyShortName: 'SCE',
  parentAgency: 'SỞ TÀI CHÍNH HÀ NỘI',
  dailyReportThresholdDays: 10,
  fieldPresenceHours: 2,
  guestQuotaPercent: 130,
  badgeQuotaPercent: 120,
  googleClientId: null,
};

const int = (min: number, max: number) => z.number().int().min(min).max(max);
const text = z.string().trim().min(1).max(300);

/** The ranges the DB check constraints enforce, for the settings form and core.settings.update. */
export const settingsPatchSchema = z
  .object({
    agencyName: text,
    agencyShortName: z.string().trim().min(1).max(40),
    parentAgency: text,
    dailyReportThresholdDays: int(1, 30),
    fieldPresenceHours: int(1, 5),
    guestQuotaPercent: int(100, 200),
    badgeQuotaPercent: int(100, 200),
    googleClientId: z.string().trim().max(300).nullable().transform((v) => (v ? v : null)),
  })
  .partial()
  .strict();

/** Parses a sce_tcsk_system_settings row (snake_case, as PostgREST returns it). */
export function parseSettingsRow(row: unknown): SystemSettings {
  const r = z
    .object({
      agency_name: z.string(),
      agency_short_name: z.string(),
      parent_agency: z.string(),
      daily_report_threshold_days: z.number(),
      field_presence_hours: z.number(),
      guest_quota_percent: z.number(),
      badge_quota_percent: z.number(),
      google_client_id: z.string().nullable(),
      version: z.number(),
    })
    .parse(row);
  return {
    agencyName: r.agency_name,
    agencyShortName: r.agency_short_name,
    parentAgency: r.parent_agency,
    dailyReportThresholdDays: r.daily_report_threshold_days,
    fieldPresenceHours: r.field_presence_hours,
    guestQuotaPercent: r.guest_quota_percent,
    badgeQuotaPercent: r.badge_quota_percent,
    googleClientId: r.google_client_id,
    version: r.version as Version,
  };
}

/** NĐ30 letterhead lines, one source for every print and Word export. */
export interface OrgIdentity {
  parentAgency: string;
  agencyName: string;
  agencyShortName: string;
  city: 'Hà Nội';
}
export function orgIdentity(s: SystemSettings): OrgIdentity {
  return { parentAgency: s.parentAgency, agencyName: s.agencyName, agencyShortName: s.agencyShortName, city: 'Hà Nội' };
}

/** ceil(targetGuests * guestQuotaPercent / 100). One rounding rule (m6 Q5). */
export function guestQuota(targetGuests: number, s: SystemSettings): number {
  return quota(targetGuests, s.guestQuotaPercent);
}
export function badgeQuota(targetGuests: number, s: SystemSettings): number {
  return quota(targetGuests, s.badgeQuotaPercent);
}
/** Integer ceiling division, so 150 * 130% is exactly 195 with no floating-point drift. */
function quota(target: number, percent: number): number {
  return Math.floor((Math.max(0, Math.round(target)) * Math.round(percent) + 99) / 100);
}
