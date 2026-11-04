import { notFound } from 'next/navigation';
import { requestContext } from '@/core/auth/server';
import { parseUuid } from '@/core/brand';
import { DeliveryLog } from '@/features/comms';
import { deliveryLogData } from '@/features/comms/server';

export default async function DeliveryLogRoute({ params }: { params: Promise<{ eventId: string }> }) {
  const id = parseUuid<'Event'>((await params).eventId);
  const ctx = await requestContext();
  const data = id ? await deliveryLogData(ctx, id) : null;
  if (!data) notFound();
  return <DeliveryLog data={data} />;
}
