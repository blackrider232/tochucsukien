// Pure data, safe to import from the proxy. The owning worker extends it;
// the foundation wrote this first version (nav, permissions, routes, tables).

import { defineFeature } from '@/core/registry';

export const reportsManifest = defineFeature({
  key: 'reports',
  worker: 'M6',
  permissions: {
    'reports.read': { label: 'Xem báo cáo', scope: 'event', grants: { admin: 'all', leader: 'all', dept_leader: 'department', user: 'department' } },
    'reports.write': { label: 'Cập nhật truyền thông, gói thầu', scope: 'event', grants: { admin: 'all', leader: 'all', dept_leader: 'department', user: 'department' } },
    'reports.issue': { label: 'Ban hành báo cáo hàng ngày', scope: 'event', grants: { admin: 'all', leader: 'all', dept_leader: 'department', user: 'none' } },
  },
  nav: [
    {
      id: 'reports', section: 'main', order: 60, label: 'Báo cáo & Tổng kết', icon: 'chart-line', accent: 'rose',
      href: { kind: 'event', segment: 'reports' }, permission: 'reports.read', legacyTabIds: ['tab-reports', 'tab-module6'],
      header: {
        title: 'Báo Cáo & Tổng Kết Sự Kiện',
        subtitle: 'Xuất báo cáo tự động trình UBND Thành phố, Ban Giám đốc và tổng hợp kết quả truyền thông.',
        badge: 'Trình UBND TP',
      },
    },
  ],
  subTabs: [],
  routes: [
    { dir: '(app)/events/[eventId]/reports', permission: 'reports.read' },
    { dir: '(print)/events/[eventId]/reports', permission: 'reports.read' },
  ],
  tables: ['sce_tcsk_media_clippings', 'sce_tcsk_bidding_packages', 'sce_tcsk_daily_reports', 'sce_tcsk_press_releases'],
  legacyBlobKeys: ['eventMediaClippings', 'eventBiddingPackages', 'dailyReports'],
});
