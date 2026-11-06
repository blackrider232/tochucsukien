// Pure data, safe to import from the proxy: nav, the five sub-tabs,
// permissions, routes, tables and the legacy blob keys reports imports.

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
        title: 'Báo cáo & tổng kết sự kiện',
        subtitle: 'Xuất báo cáo tự động trình UBND Thành phố, Ban Giám đốc và tổng hợp kết quả truyền thông.',
        badge: 'Trình UBND TP',
      },
    },
  ],
  subTabs: [
    { parentNav: 'reports', id: 'daily', order: 10, label: 'Báo cáo hàng ngày', href: { kind: 'event', segment: 'reports' }, permission: 'reports.read' },
    { parentNav: 'reports', id: 'official', order: 20, label: 'Báo cáo UBND TP và Sở Tài chính', href: { kind: 'event', segment: 'reports/official' }, permission: 'reports.read' },
    { parentNav: 'reports', id: 'media', order: 30, label: 'Truyền thông và thông cáo báo chí', href: { kind: 'event', segment: 'reports/media' }, permission: 'reports.read' },
    { parentNav: 'reports', id: 'bidding', order: 40, label: 'Gói thầu và ngân sách', href: { kind: 'event', segment: 'reports/bidding' }, permission: 'reports.read' },
    { parentNav: 'reports', id: 'dashboard', order: 50, label: 'Bảng điều khiển tổng hợp', href: { kind: 'event', segment: 'reports/dashboard' }, permission: 'reports.read' },
  ],
  routes: [
    { dir: '(app)/events/[eventId]/reports', permission: 'reports.read' },
    { dir: '(print)/events/[eventId]/reports', permission: 'reports.read' },
  ],
  tables: ['sce_tcsk_media_clippings', 'sce_tcsk_bidding_packages', 'sce_tcsk_daily_reports', 'sce_tcsk_press_releases'],
  legacyBlobKeys: ['eventMediaClippings', 'eventBiddingPackages', 'dailyReports'],
});
