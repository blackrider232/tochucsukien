import type { Metadata } from 'next';
import { requestContext } from '@/core/auth/server';
import { can } from '@/core/permissions';
import { UsersScreen } from '@/features/core';
import { listProfiles } from '@/features/core/server';

export const metadata: Metadata = { title: 'Tài khoản' };

export default async function UsersPage() {
  const ctx = await requestContext();
  const profiles = await listProfiles(ctx);
  const canManage = can(ctx.actor, 'core.users.manage');
  const { profile } = ctx.actor;
  return <UsersScreen profiles={profiles} canManage={canManage} selfId={profile.id} scopedTo={profile.role === 'dept_leader' ? profile.department : null} />;
}
