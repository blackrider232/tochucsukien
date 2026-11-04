// Pure data, safe to import from the proxy. The owning worker extends it;
// the foundation wrote this first version (nav, permissions, routes, tables).

import { defineFeature } from '@/core/registry';

export const liveManifest = defineFeature({
  key: 'live',
  worker: 'M5',
  permissions: {
    'live.read': { label: 'Xem tác nghiệp hiện trường', scope: 'event', grants: { admin: 'all', leader: 'all', dept_leader: 'department', user: 'department' } },
    'live.checkin': { label: 'Check-in đại biểu', scope: 'event', grants: { admin: 'all', leader: 'all', dept_leader: 'department', user: 'department' } },
    'live.manage': { label: 'Phân công trực, xử lý sự cố', scope: 'event', grants: { admin: 'all', leader: 'all', dept_leader: 'department', user: 'department' } },
  },
  nav: [
    {
      id: 'live', section: 'main', order: 50, label: 'Tổ chức sự kiện', icon: 'smartphone', accent: 'teal',
      href: { kind: 'event', segment: 'live' }, permission: 'live.read', legacyTabIds: ['tab-live', 'tab-module5'],
      header: {
        title: 'Tác Nghiệp Hiện Trường Ngày Sự Kiện (Giờ G)',
        subtitle: 'Điều hành tác nghiệp thời gian thực từ T0 - 2h, kiểm tra kỹ thuật, check-in QR và điều phối hội trường.',
        badge: 'T0 - 2h Hiện Trường',
      },
    },
  ],
  subTabs: [
    { parentNav: 'live', id: 'checkin', order: 10, label: 'Check-in', href: { kind: 'event', segment: 'live' }, permission: 'live.read' },
    { parentNav: 'live', id: 'duty', order: 20, label: 'Phân công ca trực', href: { kind: 'event', segment: 'live/duty' }, permission: 'live.read' },
    { parentNav: 'live', id: 'incidents', order: 30, label: 'Sổ xử lý sự cố', href: { kind: 'event', segment: 'live/incidents' }, permission: 'live.read' },
    { parentNav: 'live', id: 'monitor', order: 40, label: 'Giám sát chỗ ngồi', href: { kind: 'event', segment: 'live/monitor' }, permission: 'live.read' },
  ],
  routes: [
    { dir: '(app)/events/[eventId]/live', permission: 'live.read' },
    { dir: '(print)/events/[eventId]/live', permission: 'live.read' },
  ],
  tables: ['sce_tcsk_checkins', 'sce_tcsk_duty_staff', 'sce_tcsk_incidents'],
  // Check-in fields of eventGuests move to sce_tcsk_checkins.
  legacyBlobKeys: ['eventDutyRoster', 'eventIncidents', 'eventGuests'],
});
