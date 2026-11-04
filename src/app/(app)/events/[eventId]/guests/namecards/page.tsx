import { notFound } from 'next/navigation';
import { requestContext } from '@/core/auth/server';
import { parseUuid } from '@/core/brand';
import { PrintStudio } from '@/features/guests';
import { guestScreenData } from '@/features/guests/server';

export default async function NamecardsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const id = parseUuid<'Event'>((await params).eventId);
  const ctx = await requestContext();
  const data = id ? await guestScreenData(ctx, id) : null;
  if (!data) notFound();
  return <PrintStudio data={data} />;
}
