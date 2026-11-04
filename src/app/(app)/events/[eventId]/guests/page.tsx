import { notFound } from 'next/navigation';
import { requestContext } from '@/core/auth/server';
import { parseUuid } from '@/core/brand';
import { GuestsPage, KPI_POPUPS, type KpiPopup } from '@/features/guests';
import { guestScreenData } from '@/features/guests/server';

export default async function GuestListPage({ params, searchParams }: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const id = parseUuid<'Event'>((await params).eventId);
  const ctx = await requestContext();
  const data = id ? await guestScreenData(ctx, id) : null;
  if (!data) notFound();
  const popup = (await searchParams).popup;
  return <GuestsPage data={data} initialPopup={KPI_POPUPS.includes(popup as KpiPopup) ? (popup as KpiPopup) : null} />;
}
