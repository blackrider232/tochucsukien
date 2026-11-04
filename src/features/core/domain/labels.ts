// Vietnamese labels of the settings fields and account states, shared by the
// screens and the audit summaries so both say the same thing.

import type { ProfileStatus } from '@/core/auth';
import type { SystemSettings } from '@/core/settings';
import type { EnumRegistry } from '@/core/vocab';

export type SettingsField = Exclude<keyof SystemSettings, 'version'>;

export const SETTINGS_FIELDS: { readonly [K in SettingsField]: { label: string; unit?: string } } = {
  parentAgency: { label: 'Đơn vị chủ quản (cấp trên)' },
  agencyName: { label: 'Đơn vị tổ chức sự kiện' },
  agencyShortName: { label: 'Tên viết tắt' },
  dailyReportThresholdDays: { label: 'Ngưỡng kích hoạt báo cáo hàng ngày', unit: 'ngày làm việc trước sự kiện' },
  fieldPresenceHours: { label: 'Thời gian cán bộ có mặt hiện trường', unit: 'tiếng trước khai mạc' },
  guestQuotaPercent: { label: 'Tỷ lệ danh sách khách mời tối thiểu (nhóm 1a)', unit: '% khách dự kiến' },
  badgeQuotaPercent: { label: 'Tỷ lệ in thẻ đại biểu tối thiểu (nhóm 2b)', unit: '% khách dự kiến' },
  googleClientId: { label: 'Google Client ID mặc định' },
};

export const PROFILE_STATUS: EnumRegistry<ProfileStatus> = {
  pending: { label: 'Chờ duyệt', short: 'Chờ duyệt', tone: 'amber' },
  active: { label: 'Đang hoạt động', short: 'Đã duyệt', tone: 'emerald' },
  locked: { label: 'Đã khóa', short: 'Đã khóa', tone: 'rose' },
};

export const BACKUP_KINDS = {
  manual: { label: 'Tạo thủ công', short: 'Thủ công', tone: 'blue' },
  auto: { label: 'Tự động hằng ngày', short: 'Tự động', tone: 'slate' },
  pre_migration: { label: 'Dữ liệu trước khi chuyển hệ thống', short: 'Trước chuyển đổi', tone: 'amber' },
} as const satisfies EnumRegistry<'manual' | 'auto' | 'pre_migration'>;
