import { notFound } from 'next/navigation';
import { requestContext } from '@/core/auth/server';
import { parseUuid } from '@/core/brand';
import { todayVN } from '@/core/dates';
import { PrintPlan } from '@/features/progress';
import { readEventPlan } from '@/features/progress/server';

export default async function PrintPlanPage({ params }: { params: Promise<{ eventId: string }> }) {
  const id = parseUuid<'Event'>((await params).eventId);
  const ctx = await requestContext();
  const plan = id ? await readEventPlan(ctx, id) : null;
  if (!plan) notFound();
  return <PrintPlan plan={plan} today={todayVN(ctx.now)} />;
}
