// Shared chrome this feature fills: the mailboxes section of /admin/settings.

import { requestContext } from '@/core/auth/server';
import { defineSlots } from '@/core/registry';
import { MailboxesAdmin } from './components/mailboxes-admin';
import { mailboxesScreenData } from './server/screen-data';

async function MailboxesSection() {
  const ctx = await requestContext();
  return <MailboxesAdmin data={await mailboxesScreenData(ctx)} />;
}

export const commsSlots = defineSlots('comms', {
  settingsSections: [{ id: 'mailboxes', order: 50, permission: 'comms.mailboxes.admin', render: MailboxesSection }],
});
