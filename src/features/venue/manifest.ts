// Pure data, safe to import from the proxy. The owning worker extends it;
// the foundation wrote this first version (nav, permissions, routes, tables).

import { defineFeature } from '@/core/registry';

export const venueManifest = defineFeature({
  key: 'venue',
  worker: 'M4b',
  permissions: {
    'venue.seating.read': { label: 'Xem sơ đồ chỗ ngồi', scope: 'event', grants: { admin: 'all', leader: 'all', dept_leader: 'department', user: 'department' } },
    'venue.seating.write': { label: 'Xếp chỗ ngồi', scope: 'event', grants: { admin: 'all', leader: 'all', dept_leader: 'department', user: 'department' } },
    'venue.booths.read': { label: 'Xem gian hàng', scope: 'event', grants: { admin: 'all', leader: 'all', dept_leader: 'department', user: 'department' } },
    'venue.booths.write': { label: 'Cập nhật gian hàng và ca trực', scope: 'event', grants: { admin: 'all', leader: 'all', dept_leader: 'department', user: 'department' } },
    'venue.halls.read': { label: 'Xem danh mục hội trường', scope: 'global', grants: { admin: 'all', leader: 'all', dept_leader: 'all', user: 'all' } },
    'venue.halls.admin': { label: 'Quản trị hội trường mẫu', scope: 'global', grants: { admin: 'all', leader: 'none', dept_leader: 'none', user: 'none' } },
  },
  nav: [
    {
      id: 'booths', section: 'main', order: 40, label: 'Gian hàng Hội chợ', icon: 'store', accent: 'emerald',
      href: { kind: 'event', segment: 'booths' }, permission: 'venue.booths.read', legacyTabIds: ['tab-booths'],
      header: {
        title: 'Quản Lý Gian Hàng Hội Chợ',
        subtitle: 'Sơ đồ phân lô mặt bằng 3m x 3m, hồ sơ doanh nghiệp tham gia, kinh phí hỗ trợ và phân công cán bộ trực SCE.',
        badge: 'Hội Chợ Triển Lãm',
      },
    },
    {
      id: 'admin-halls', section: 'admin', order: 40, label: 'Quản trị Hội trường', icon: 'building', accent: 'indigo',
      tooltip: 'Quản trị Hội trường tổ chức sự kiện & phân khu',
      href: { kind: 'static', path: '/admin/halls' }, permission: 'venue.halls.admin', legacyTabIds: ['tab-admin-halls'],
      header: { title: 'Quản Trị Hội Trường Tổ Chức Sự Kiện', subtitle: 'Quản lý danh mục hội trường mẫu, thiết lập phân khu và ma trận vị trí chỗ ngồi.', badge: 'Mẫu Hội Trường' },
    },
  ],
  subTabs: [
    { parentNav: 'guests', id: 'seating', order: 40, label: 'Sơ đồ chỗ ngồi', href: { kind: 'event', segment: 'seating' }, permission: 'venue.seating.read' },
  ],
  routes: [
    { dir: '(app)/events/[eventId]/seating', permission: 'venue.seating.read' },
    { dir: '(app)/events/[eventId]/booths', permission: 'venue.booths.read' },
    { dir: '(app)/admin/halls', permission: 'venue.halls.admin' },
    { dir: '(print)/events/[eventId]/seating', permission: 'venue.seating.read' },
    { dir: '(print)/events/[eventId]/booths', permission: 'venue.booths.read' },
  ],
  tables: ['sce_tcsk_hall_templates', 'sce_tcsk_event_halls', 'sce_tcsk_seat_assignments', 'sce_tcsk_booths', 'sce_tcsk_booth_shifts'],
  legacyBlobKeys: ['hallTemplates', 'eventHallConfig', 'eventSeating', 'eventBooths'],
});
