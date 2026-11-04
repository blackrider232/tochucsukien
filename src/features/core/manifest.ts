// Pure data, safe to import from the proxy. Read by the registry (sidebar,
// top bar, route guard, legacy tab redirects) and by the permission matrix.

import { defineFeature } from '@/core/registry';

export const coreManifest = defineFeature({
  key: 'core',
  worker: 'foundation',
  permissions: {
    'core.settings.edit': { label: 'Sửa tham số hệ thống', scope: 'global', grants: { admin: 'all', leader: 'all', dept_leader: 'none', user: 'none' } },
    'core.users.read': { label: 'Xem danh sách tài khoản', scope: 'global', grants: { admin: 'all', leader: 'all', dept_leader: 'department', user: 'none' } },
    'core.users.manage': { label: 'Duyệt, khóa, phân quyền, tạo tài khoản', scope: 'global', grants: { admin: 'all', leader: 'none', dept_leader: 'none', user: 'none' } },
    'core.backups.create': { label: 'Tạo và tải bản sao lưu', scope: 'global', grants: { admin: 'all', leader: 'all', dept_leader: 'none', user: 'none' } },
    'core.backups.restore': { label: 'Khôi phục bản sao lưu', scope: 'global', grants: { admin: 'all', leader: 'none', dept_leader: 'none', user: 'none' }, requiresAal2: true },
    'core.audit.read': { label: 'Xem nhật ký kiểm toán', scope: 'global', grants: { admin: 'all', leader: 'all', dept_leader: 'none', user: 'none' } },
    'core.holidays.edit': { label: 'Quản lý ngày nghỉ lễ', scope: 'global', grants: { admin: 'all', leader: 'all', dept_leader: 'none', user: 'none' } },
  },
  nav: [
    {
      id: 'admin', section: 'admin', order: 10, label: 'Cài đặt', icon: 'settings', accent: 'slate',
      tooltip: 'Cài đặt: Quản lý phòng ban, tham số định mức, sao lưu & nhật ký',
      href: { kind: 'static', path: '/admin/settings' }, permission: 'core.settings.edit', legacyTabIds: ['tab-admin', 'tab-settings', 'tab-module1'],
      header: { title: 'Cài Đặt Hệ Thống & Tham Số Định Mức', subtitle: 'Quản lý phòng ban, tham số định mức, sao lưu dữ liệu và nhật ký kiểm toán.', badge: 'Hệ Thống SCE' },
    },
    {
      id: 'users', section: 'admin', order: 20, label: 'Tài khoản', icon: 'user-cog', accent: 'cyan',
      tooltip: 'Tài khoản: Tạo lập & phê duyệt tài khoản cán bộ',
      href: { kind: 'static', path: '/admin/users' }, permission: 'core.users.read', legacyTabIds: ['tab-users'],
      header: { title: 'Quản Lý Tài Khoản & Phân Quyền', subtitle: 'Tạo lập tài khoản, phê duyệt cán bộ và quản trị ma trận phân quyền RBAC 4 phòng ban.', badge: '4 Phòng Ban' },
    },
  ],
  subTabs: [],
  routes: [
    { dir: '(app)/admin/settings', permission: 'core.settings.edit' },
    { dir: '(app)/admin/users', permission: 'core.users.read' },
    { dir: '(app)/admin/backups', permission: 'core.backups.create' },
    { dir: '(app)/admin/audit', permission: 'core.audit.read' },
  ],
  tables: ['sce_tcsk_profiles', 'sce_tcsk_system_settings', 'sce_tcsk_holidays', 'sce_tcsk_departments', 'sce_tcsk_role_permissions', 'sce_tcsk_backups', 'sce_tcsk_audit_logs', 'sce_tcsk_app_data'],
  legacyBlobKeys: ['systemSettings', 'departments'],
});
