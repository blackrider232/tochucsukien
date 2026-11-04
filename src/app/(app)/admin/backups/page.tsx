import type { Metadata } from 'next';
import { requestContext } from '@/core/auth/server';
import { can } from '@/core/permissions';
import { BackupsScreen } from '@/features/core';
import { listBackups } from '@/features/core/server';

export const metadata: Metadata = { title: 'Sao lưu & phục hồi' };

export default async function BackupsPage() {
  const ctx = await requestContext();
  return <BackupsScreen backups={await listBackups(ctx)} canRestore={can(ctx.actor, 'core.backups.restore')} />;
}
