import { notFound } from 'next/navigation';
import { requestContext } from '@/core/auth/server';
import { parseUuid } from '@/core/brand';
import { FormPage } from '@/features/comms';
import { formScreenData } from '@/features/comms/server';

export default async function GoogleFormRoute({ params }: { params: Promise<{ eventId: string }> }) {
  const id = parseUuid<'Event'>((await params).eventId);
  const ctx = await requestContext();
  const data = id ? await formScreenData(ctx, id) : null;
  if (!data) notFound();
  return <FormPage data={data} />;
}
