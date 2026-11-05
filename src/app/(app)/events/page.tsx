import { requestContext } from '@/core/auth/server';
import { EventsDashboard, type KpiPopup } from '@/features/progress';
import { listEventPlans, screenData } from '@/features/progress/server';
import { listTemplates } from '@/features/templates/server';

const POPUPS: ReadonlyArray<KpiPopup> = ['daily', 'all', 'completed', 'overdue'];

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ popup?: string }> }) {
  const [ctx, { popup }] = await Promise.all([requestContext(), searchParams]);
  const [plans, templates] = await Promise.all([listEventPlans(ctx), listTemplates(ctx)]);
  const data = screenData(ctx, plans, templates);
  const initialPopup = POPUPS.find((p) => p === popup) ?? null;
  // Keyed so the top-bar bell (?popup=daily) opens the pop-up even when the dashboard is already mounted.
  return <EventsDashboard key={initialPopup ?? ''} data={data} initialPopup={initialPopup} />;
}
