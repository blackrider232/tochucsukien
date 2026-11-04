// Pure data, safe to import from the proxy. The owning worker extends it;
// the foundation wrote this first version (nav, permissions, routes, tables).

import { defineFeature } from '@/core/registry';

export const directoryManifest = defineFeature({
  key: 'directory',
  worker: 'M4c',
  permissions: {
    'directory.read': { label: 'Tra cứu CSDL khách mời', scope: 'global', grants: { admin: 'all', leader: 'all', dept_leader: 'all', user: 'all' } },
    'directory.admin': { label: 'Quản trị CSDL khách mời', scope: 'global', grants: { admin: 'all', leader: 'none', dept_leader: 'none', user: 'none' } },
  },
  nav: [
    {
      id: 'admin-guests', section: 'admin', order: 50, label: 'CSDL Khách & DN', icon: 'contact', accent: 'emerald',
      tooltip: 'Quản trị CSDL khách & doanh nghiệp dùng chung (Master Directory)',
      href: { kind: 'static', path: '/admin/directory' }, permission: 'directory.admin', legacyTabIds: ['tab-admin-guests'],
      header: {
        title: 'Cơ Sở Dữ Liệu Khách Mời & Doanh Nghiệp',
        subtitle: 'CSDL danh bạ dùng chung 5 nhóm đối tượng chuẩn hóa phục vụ tra cứu và tự động gợi ý.',
        badge: 'Master Directory',
      },
    },
  ],
  subTabs: [],
  routes: [{ dir: '(app)/admin/directory', permission: 'directory.admin' }],
  tables: ['sce_tcsk_master_contacts'],
  legacyBlobKeys: ['masterGuestDb'],
});
