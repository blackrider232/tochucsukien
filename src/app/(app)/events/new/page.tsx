import { redirect } from 'next/navigation';
import { requestContext } from '@/core/auth/server';
import { NewEvent } from '@/features/progress';
import { screenData } from '@/features/progress/server';

export default async function NewEventPage() {
  const { createDepartments, today } = screenData(await requestContext(), []);
  if (createDepartments.length === 0) redirect('/events?denied=1');
  return <NewEvent departments={createDepartments} today={today} />;
}
