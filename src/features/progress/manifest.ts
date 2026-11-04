// Pure data, safe to import from the proxy. The owning worker extends it;
// the foundation wrote this first version (nav, permissions, routes, tables).

import { defineFeature } from '@/core/registry';

export const progressManifest = defineFeature({
  key: 'progress',
  worker: 'M2',
  permissions: {
    'progress.read': { label: 'Xem tiến độ sự kiện', scope: 'event', grants: { admin: 'all', leader: 'all', dept_leader: 'department', user: 'department' } },
    'progress.write': { label: 'Cập nhật sự kiện và bước việc', scope: 'event', grants: { admin: 'all', leader: 'all', dept_leader: 'department', user: 'department' } },
    'progress.create': { label: 'Tạo sự kiện mới', scope: 'event', grants: { admin: 'all', leader: 'all', dept_leader: 'department', user: 'department' } },
    'progress.delete': { label: 'Xóa sự kiện', scope: 'event', grants: { admin: 'all', leader: 'all', dept_leader: 'department', user: 'none' } },
  },
  nav: [
    {
      id: 'events', section: 'main', order: 10, label: 'Tiến độ', icon: 'calendar-check', accent: 'blue',
      href: { kind: 'static', path: '/events' }, permission: 'progress.read', legacyTabIds: ['tab-events', 'tab-module2'],
      header: { title: 'Tiến Độ Tổ Chức Sự Kiện', subtitle: 'Theo dõi tiến độ, phân công nhiệm vụ và cập nhật trạng thái thực hiện các sự kiện.' },
    },
  ],
  subTabs: [],
  routes: [
    { dir: '(app)/events', permission: 'progress.read' },
    { dir: '(app)/events/new', permission: 'progress.create' },
    { dir: '(app)/events/[eventId]/plan', permission: 'progress.read' },
    { dir: '(print)/events/[eventId]/plan', permission: 'progress.read' },
    { dir: '(print)/events/summary', permission: 'progress.read' },
  ],
  tables: ['sce_tcsk_events', 'sce_tcsk_task_groups', 'sce_tcsk_steps'],
  legacyBlobKeys: ['events', 'programs'],
});
