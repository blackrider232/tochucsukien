// Pure data, safe to import from the proxy. The owning worker extends it;
// the foundation wrote this first version (nav, permissions, routes, tables).

import { defineFeature } from '@/core/registry';

export const guestsManifest = defineFeature({
  key: 'guests',
  worker: 'M4a',
  permissions: {
    'guests.read': { label: 'Xem khách mời', scope: 'event', grants: { admin: 'all', leader: 'all', dept_leader: 'department', user: 'department' } },
    'guests.write': { label: 'Cập nhật khách mời', scope: 'event', grants: { admin: 'all', leader: 'all', dept_leader: 'department', user: 'department' } },
  },
  nav: [
    {
      id: 'guests', section: 'main', order: 30, label: 'Khách mời & Chỗ ngồi', icon: 'users', accent: 'amber',
      href: { kind: 'event', segment: 'guests' }, permission: 'guests.read', legacyTabIds: ['tab-guests', 'tab-module4'],
      header: {
        title: 'Khách Mời & Sơ Đồ Chỗ Ngồi',
        subtitle: 'Quản lý danh sách khách mời, xác nhận RSVP, in Biển tên chữ A, Thẻ đại biểu QR và phân khu hội trường.',
        badge: 'Hội Trường & VIP',
      },
    },
  ],
  subTabs: [
    { parentNav: 'guests', id: 'guest-list', order: 10, label: 'Danh sách khách mời', href: { kind: 'event', segment: 'guests' }, permission: 'guests.read' },
  ],
  routes: [
    { dir: '(app)/events/[eventId]/guests', permission: 'guests.read' },
    { dir: '(print)/events/[eventId]/guests', permission: 'guests.read' },
  ],
  tables: ['sce_tcsk_guests'],
  legacyBlobKeys: ['eventGuests'],
});
