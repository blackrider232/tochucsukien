// Shared chrome progress fills: the daily-report bell in the top bar and the
// "In kế hoạch" action on every event page.

import { Badge, IconButton, PrintLink } from '@/components/ui';
import { requestContext } from '@/core/auth/server';
import type { EventId } from '@/core/brand';
import { todayVN } from '@/core/dates';
import { defineSlots } from '@/core/registry';
import { isInDailyReportWindow } from './domain/schedule';
import { listEvents } from './server/reads';

async function DailyReportBell() {
  const ctx = await requestContext();
  const today = todayVN(ctx.now);
  const n = (await listEvents(ctx)).filter((e) => isInDailyReportWindow(ctx.calendar, e, today, ctx.settings)).length;
  return (
    <span className="inline-flex items-center gap-1">
      <IconButton icon="bell" tone={n > 0 ? 'rose' : undefined} label={`Báo Cáo Hàng Ngày: ${n} sự kiện`} href="/events?popup=daily" />
      {n > 0 && <Badge tone="rose" pulse>{n}</Badge>}
    </span>
  );
}

function PrintPlanAction({ eventId }: { eventId: EventId }) {
  return <PrintLink href={`/events/${eventId}/plan/print`} label="In kế hoạch" />;
}

export const progressSlots = defineSlots('progress', {
  topBarBadge: DailyReportBell,
  eventActions: [{ id: 'print-plan', order: 10, permission: 'progress.read', render: PrintPlanAction }],
});
