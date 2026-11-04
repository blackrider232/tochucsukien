import type { Metadata } from 'next';
import { renderSettingsSections } from '@/components/shell/load-shell';
import { requestContext } from '@/core/auth/server';
import { todayVN } from '@/core/dates';
import { can, type Permission } from '@/core/permissions';
import { DepartmentsCard, HolidaysEditor, SettingsForm, SettingsOverview, type AdminShortcut } from '@/features/core';
import { listProfiles } from '@/features/core/server';

export const metadata: Metadata = { title: 'Cài đặt hệ thống' };

const SHORTCUTS: ReadonlyArray<AdminShortcut & { permission: Permission }> = [
  { href: '/admin/users', label: 'Tài khoản & phân quyền', icon: 'user-cog', permission: 'core.users.read' },
  { href: '/admin/backups', label: 'Sao lưu & phục hồi', icon: 'cloud', permission: 'core.backups.create' },
  { href: '/admin/audit', label: 'Nhật ký kiểm toán', icon: 'list-check', permission: 'core.audit.read' },
  { href: '/admin/directory', label: 'CSDL khách & doanh nghiệp', icon: 'contact', permission: 'directory.admin' },
  { href: '/admin/templates', label: 'Quản trị biểu mẫu', icon: 'layout-template', permission: 'templates.admin' },
  { href: '/admin/halls', label: 'Hội trường mẫu', icon: 'building', permission: 'venue.halls.admin' },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const [ctx, { year: rawYear }] = await Promise.all([requestContext(), searchParams]);
  const profiles = await listProfiles(ctx);
  const thisYear = Number(todayVN(ctx.now).slice(0, 4));
  const years = [thisYear - 1, thisYear, thisYear + 1, thisYear + 2];
  const year = years.find((y) => String(y) === rawYear) ?? thisYear;
  return (
    <div className="space-y-4">
      <SettingsOverview
        settings={ctx.settings}
        accounts={profiles.length}
        activeAccounts={profiles.filter((p) => p.status === 'active').length}
        shortcuts={SHORTCUTS.filter((s) => can(ctx.actor, s.permission))}
      />
      <SettingsForm key={ctx.settings.version} settings={ctx.settings} />
      <HolidaysEditor year={year} years={years} canEdit={can(ctx.actor, 'core.holidays.edit')} />
      <DepartmentsCard />
      {renderSettingsSections(ctx)}
    </div>
  );
}
