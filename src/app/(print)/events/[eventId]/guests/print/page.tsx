import { notFound } from 'next/navigation';
import { requestContext } from '@/core/auth/server';
import { parseUuid } from '@/core/brand';
import { orgIdentity } from '@/core/settings';
import { PrintSheets, onlyGuest, printSets, themeOf } from '@/features/guests';
import { guestScreenData } from '@/features/guests/server';

// ?kind=namecards|badges, optional &guest=<id> for one, &theme=<id>, &noprint=1 to preview before printing.
export default async function GuestPrintPage({ params, searchParams }: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const id = parseUuid<'Event'>((await params).eventId);
  const ctx = await requestContext();
  const data = id ? await guestScreenData(ctx, id) : null;
  if (!data) notFound();
  const q = await searchParams;
  const kind = q.kind === 'badges' ? 'badges' : 'namecards';
  const guestId = parseUuid<'Guest'>(q.guest);
  const vip = new Set(data.vipSeats);
  const set = printSets(data.roster, (code) => vip.has(code))[kind];
  return (
    <PrintSheets
      kind={kind}
      themeId={themeOf(kind, q.theme).id}
      eventId={data.event.id}
      eventName={data.event.name}
      org={orgIdentity(ctx.settings)}
      guests={onlyGuest(set, guestId)}
      guestId={guestId}
    />
  );
}
