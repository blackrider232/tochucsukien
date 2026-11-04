import { notFound } from 'next/navigation';
import { requestContext } from '@/core/auth/server';
import { parseUuid } from '@/core/brand';
import { readEvent } from '@/features/progress/server';
import { SeatingView } from '@/features/venue';
import { seatingScreen } from '@/features/venue/server';

export default async function SeatingPage({ params }: { params: Promise<{ eventId: string }> }) {
  const id = parseUuid<'Event'>((await params).eventId);
  const ctx = await requestContext();
  const event = id ? await readEvent(ctx, id) : null;
  if (!event) notFound();
  return <SeatingView data={await seatingScreen(ctx, event)} />;
}
