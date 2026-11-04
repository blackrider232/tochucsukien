import { notFound } from 'next/navigation';
import { requestContext } from '@/core/auth/server';
import { parseUuid } from '@/core/brand';
import { readEvent } from '@/features/progress/server';
import { BoothsView } from '@/features/venue';
import { boothsScreen } from '@/features/venue/server';

export default async function BoothsListPage({ params }: { params: Promise<{ eventId: string }> }) {
  const id = parseUuid<'Event'>((await params).eventId);
  const ctx = await requestContext();
  const event = id ? await readEvent(ctx, id) : null;
  if (!event) notFound();
  return <BoothsView data={await boothsScreen(ctx, event)} tab="list" />;
}
