import { notFound } from 'next/navigation';
import { requestContext } from '@/core/auth/server';
import { parseUuid } from '@/core/brand';
import { InvitationsPage } from '@/features/comms';
import { invitationScreenData } from '@/features/comms/server';

export default async function InvitationsRoute({ params, searchParams }: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const id = parseUuid<'Event'>((await params).eventId);
  const retry = (await searchParams).retry;
  const ctx = await requestContext();
  const data = id ? await invitationScreenData(ctx, id, typeof retry === 'string' ? retry : null) : null;
  if (!data) notFound();
  return <InvitationsPage key={data.retry?.campaignId ?? 'new'} data={data} />;
}
