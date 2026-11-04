import { requestContext } from '@/core/auth/server';
import { AdminHalls } from '@/features/venue';
import { hallTemplateUsage, listHallTemplates } from '@/features/venue/server';

export default async function AdminHallsPage() {
  const ctx = await requestContext();
  const [templates, usage] = await Promise.all([listHallTemplates(ctx), hallTemplateUsage(ctx)]);
  return <AdminHalls templates={templates} usage={Object.fromEntries(usage)} />;
}
