import { requestContext } from '@/core/auth/server';
import { todayVN } from '@/core/dates';
import { PrintSummary } from '@/features/progress';
import { listEventPlans } from '@/features/progress/server';

export default async function PrintSummaryPage() {
  const ctx = await requestContext();
  return <PrintSummary plans={await listEventPlans(ctx)} today={todayVN(ctx.now)} />;
}
