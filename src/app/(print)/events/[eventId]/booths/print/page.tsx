import { notFound } from 'next/navigation';
import { requestContext } from '@/core/auth/server';
import { parseUuid } from '@/core/brand';
import { readEvent } from '@/features/progress/server';
import { PrintBooths } from '@/features/venue';
import { boothsScreen } from '@/features/venue/server';

export default async function PrintBoothsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const id = parseUuid<'Event'>((await params).eventId);
  const ctx = await requestContext();
  const event = id ? await readEvent(ctx, id) : null;
  if (!event) notFound();
  return <PrintBooths data={await boothsScreen(ctx, event)} />;
}
