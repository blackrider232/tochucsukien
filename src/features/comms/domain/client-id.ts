import type { SystemSettings } from '@/core/settings';
import type { SenderMailbox } from '../contract';

/** The one client-id resolution (m4c B57): the mailbox's own, else the deployment's. null: sending is not set up. */
export function resolveGoogleClientId(mailbox: Pick<SenderMailbox, 'clientId'> | null, s: Pick<SystemSettings, 'googleClientId'>): string | null {
  return mailbox?.clientId?.trim() || s.googleClientId?.trim() || null;
}
