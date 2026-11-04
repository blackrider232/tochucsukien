// Pure data, safe to import from the proxy. The owning worker extends it;
// the foundation wrote this first version (nav, permissions, routes, tables).

import { defineFeature } from '@/core/registry';

export const templatesManifest = defineFeature({
  key: 'templates',
  worker: 'M3',
  permissions: {
    'templates.read': { label: 'Xem và dùng biểu mẫu', scope: 'global', grants: { admin: 'all', leader: 'all', dept_leader: 'all', user: 'all' } },
    'templates.admin': { label: 'Quản trị biểu mẫu', scope: 'global', grants: { admin: 'all', leader: 'none', dept_leader: 'none', user: 'none' } },
  },
  nav: [
    {
      id: 'templates', section: 'main', order: 20, label: 'Biểu mẫu', icon: 'file-signature', accent: 'purple',
      href: { kind: 'static', path: '/templates' }, permission: 'templates.read', legacyTabIds: ['tab-templates', 'tab-module3'],
      header: { title: 'Kho Biểu Mẫu Chuẩn Hóa', subtitle: 'Hệ thống biểu mẫu hành chính chuẩn 3 cấp thẩm quyền theo Nghị định 30/2020/NĐ-CP.' },
    },
    {
      id: 'admin-templates', section: 'admin', order: 30, label: 'Quản trị biểu mẫu', icon: 'layout-template', accent: 'purple',
      tooltip: 'Quản trị biểu mẫu chuẩn hóa 3 cấp thẩm quyền',
      href: { kind: 'static', path: '/admin/templates' }, permission: 'templates.admin', legacyTabIds: ['tab-admin-templates'],
      header: { title: 'Quản Trị Biểu Mẫu Chuẩn Hóa', subtitle: 'Quản trị và hiệu chỉnh biểu mẫu hành chính chuẩn 3 cấp thẩm quyền theo Nghị định 30/2020/NĐ-CP.' },
    },
  ],
  subTabs: [],
  routes: [
    { dir: '(app)/templates', permission: 'templates.read' },
    { dir: '(app)/admin/templates', permission: 'templates.admin' },
    { dir: '(print)/templates', permission: 'templates.read' },
  ],
  tables: ['sce_tcsk_templates'],
  legacyBlobKeys: ['systemTemplates'],
});
