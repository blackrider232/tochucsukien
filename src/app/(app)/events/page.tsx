import { requestContext } from '@/core/auth/server';
import { EventsDashboard, type KpiPopup } from '@/features/progress';
import { listEventPlans, screenData } from '@/features/progress/server';

const POPUPS: ReadonlyArray<KpiPopup> = ['daily', 'all', 'completed', 'overdue'];

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ popup?: string }> }) {
  const [ctx, { popup }] = await Promise.all([requestContext(), searchParams]);
  const data = screenData(ctx, await listEventPlans(ctx));
  const initialPopup = POPUPS.find((p) => p === popup) ?? null;
  // Keyed so the top-bar bell (?popup=daily) opens the pop-up even when the dashboard is already mounted.
  return <EventsDashboard key={initialPopup ?? ''} data={data} initialPopup={initialPopup} />;
}
