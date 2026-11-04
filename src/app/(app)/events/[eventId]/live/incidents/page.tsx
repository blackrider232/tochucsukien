import { notFound } from 'next/navigation';
import { requestContext } from '@/core/auth/server';
import { parseUuid } from '@/core/brand';
import { LiveScreen } from '@/features/live';
import { liveScreen } from '@/features/live/server';
import { readEvent } from '@/features/progress/server';

export default async function LiveIncidentsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const id = parseUuid<'Event'>((await params).eventId);
  const ctx = await requestContext();
  const event = id ? await readEvent(ctx, id) : null;
  if (!event) notFound();
  return <LiveScreen data={await liveScreen(ctx, event)} tab="incidents" />;
}
