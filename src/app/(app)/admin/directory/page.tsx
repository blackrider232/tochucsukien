import { requestContext } from '@/core/auth/server';
import { can } from '@/core/permissions';
import { DirectoryScreen } from '@/features/directory';
import { listContacts } from '@/features/directory/server';
import { listEvents } from '@/features/progress/server';

export default async function DirectoryPage() {
  const ctx = await requestContext();
  const [contacts, events] = await Promise.all([listContacts(ctx), listEvents(ctx)]);
  return (
    <DirectoryScreen
      contacts={contacts}
      canAdmin={can(ctx.actor, 'directory.admin')}
      events={events.map((e) => ({ id: e.id, name: e.name }))}
    />
  );
}
