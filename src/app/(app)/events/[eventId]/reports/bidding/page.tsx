import { notFound } from 'next/navigation';
import { requestContext } from '@/core/auth/server';
import { parseUuid } from '@/core/brand';
import { ReportsScreen } from '@/features/reports';
import { reportsScreen } from '@/features/reports/server';
import { readEvent } from '@/features/progress/server';

export default async function ReportsBiddingPage({ params }: { params: Promise<{ eventId: string }> }) {
  const id = parseUuid<'Event'>((await params).eventId);
  const ctx = await requestContext();
  const event = id ? await readEvent(ctx, id) : null;
  if (!event) notFound();
  return <ReportsScreen data={await reportsScreen(ctx, event)} tab="bidding" />;
}
