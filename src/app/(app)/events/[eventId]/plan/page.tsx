import { notFound } from 'next/navigation';
import { requestContext } from '@/core/auth/server';
import { parseUuid } from '@/core/brand';
import { PlanView } from '@/features/progress';
import { readEventPlan, screenData } from '@/features/progress/server';
import { listTemplates } from '@/features/templates/server';

export default async function PlanPage({ params }: { params: Promise<{ eventId: string }> }) {
  const id = parseUuid<'Event'>((await params).eventId);
  const ctx = await requestContext();
  const plan = id ? await readEventPlan(ctx, id) : null;
  if (!plan) notFound();
  return <PlanView data={screenData(ctx, [plan], await listTemplates(ctx))} />;
}
