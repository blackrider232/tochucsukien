import { redirect } from 'next/navigation';

// An event opens on its plan.
export default async function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  redirect(`/events/${(await params).eventId}/plan`);
}
