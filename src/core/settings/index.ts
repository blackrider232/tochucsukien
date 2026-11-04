// System settings (singleton row sce_tcsk_system_settings, id = 1). Core owns it.
// Every consumer reads these through RequestContext.settings or useSettings();
// pure functions take them as a parameter, so a hard-coded 10 / 1.3 / agency
// string has nowhere to live (core B12/B13, m2 BUG-07, m3 B15/B37, m5 BUG-18).

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

export declare const DEFAULT_SETTINGS: Omit<SystemSettings, 'version'>;

/** NĐ30 letterhead lines, one source for every print and Word export. */
export interface OrgIdentity {
  parentAgency: string;
  agencyName: string;
  agencyShortName: string;
  city: 'Hà Nội';
}
export function orgIdentity(s: SystemSettings): OrgIdentity {
  throw new Error('not implemented');
}

/** ceil(targetGuests * guestQuotaPercent / 100). One rounding rule (m6 Q5). */
export function guestQuota(targetGuests: number, s: SystemSettings): number {
  throw new Error('not implemented');
}
export function badgeQuota(targetGuests: number, s: SystemSettings): number {
  throw new Error('not implemented');
}
