// Shared chrome core fills: the count of accounts waiting for approval, shown
// only to whoever can approve them (core B38).

import { Badge } from '@/components/ui';
import { requestContext } from '@/core/auth/server';
import { can } from '@/core/permissions';
import { defineSlots } from '@/core/registry';
import { listProfiles } from './server/reads';

async function PendingAccounts() {
  const ctx = await requestContext();
  if (!can(ctx.actor, 'core.users.manage')) return null;
  const n = (await listProfiles(ctx)).filter((p) => p.status === 'pending').length;
  if (n === 0) return null;
  return (
    <Badge tone="amber">
      {n}
      <span className="sr-only"> tài khoản chờ duyệt</span>
    </Badge>
  );
}

export const coreSlots = defineSlots('core', {
  navBadges: { users: PendingAccounts },
});
