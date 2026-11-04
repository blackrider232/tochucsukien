import { notFound } from 'next/navigation';
import { requestContext } from '@/core/auth/server';
import { parseUuid } from '@/core/brand';
import { devMemoryEnabled } from '@/core/dev/mode';
import { readEvent } from '@/features/progress/server';
import { SeatingView } from '@/features/venue';
import { seatingHarness } from '@/features/venue/server';

// Dev memory runtime only: the seating screen with fixture guests until feature guests lands. A 404 everywhere else.
export default async function SeatingHarnessPage({ params }: { params: Promise<{ eventId: string }> }) {
  if (!devMemoryEnabled()) notFound();
  const id = parseUuid<'Event'>((await params).eventId);
  const ctx = await requestContext();
  const event = id ? await readEvent(ctx, id) : null;
  if (!event) notFound();
  return <SeatingView data={await seatingHarness(ctx, event)} />;
}
