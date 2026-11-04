import { describe, expect, it } from 'vitest';
import type { Version } from '@/core/brand';
import { badgeQuota, DEFAULT_SETTINGS, guestQuota, orgIdentity, parseSettingsRow, settingsPatchSchema, type SystemSettings } from '@/core/settings';

const settings: SystemSettings = { ...DEFAULT_SETTINGS, version: 1 as Version };

describe('quotas (m6 Q5: one rounding rule)', () => {
  it('rounds up the percentage of target guests', () => {
    expect(guestQuota(150, settings)).toBe(195);
    expect(guestQuota(151, settings)).toBe(197);
    expect(badgeQuota(150, settings)).toBe(180);
    expect(badgeQuota(7, settings)).toBe(9);
    expect(guestQuota(0, settings)).toBe(0);
  });

  it('reads the percentages from settings, not constants (core B13)', () => {
    expect(guestQuota(100, { ...settings, guestQuotaPercent: 200 })).toBe(200);
  });
});

describe('orgIdentity', () => {
  it('is the one letterhead source', () => {
    expect(orgIdentity({ ...settings, agencyName: 'TRUNG TÂM X' })).toEqual({
      parentAgency: 'SỞ TÀI CHÍNH HÀ NỘI',
      agencyName: 'TRUNG TÂM X',
      agencyShortName: 'SCE',
      city: 'Hà Nội',
    });
  });
});

describe('settings parsing', () => {
  it('maps the singleton row', () => {
    expect(
      parseSettingsRow({
        id: 1, agency_name: 'A', agency_short_name: 'S', parent_agency: 'P', daily_report_threshold_days: 7,
        field_presence_hours: 3, guest_quota_percent: 150, badge_quota_percent: 110, google_client_id: null,
        version: 4, updated_at: '2026-11-04T00:00:00+00:00', updated_by: null,
      }),
    ).toEqual({ agencyName: 'A', agencyShortName: 'S', parentAgency: 'P', dailyReportThresholdDays: 7, fieldPresenceHours: 3, guestQuotaPercent: 150, badgeQuotaPercent: 110, googleClientId: null, version: 4 });
  });

  it('enforces the DB ranges on patches', () => {
    expect(settingsPatchSchema.safeParse({ dailyReportThresholdDays: 31 }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ guestQuotaPercent: 99 }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ unitSenderEmails: [] }).success).toBe(false);
    expect(settingsPatchSchema.parse({ googleClientId: '  ' })).toEqual({ googleClientId: null });
    expect(settingsPatchSchema.parse({ fieldPresenceHours: 5 })).toEqual({ fieldPresenceHours: 5 });
  });
});
