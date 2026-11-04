// SCE_DEV_MEMORY=1 only (docs/rewrite/dev-runtime.md): one fake sender mailbox
// and a form link on progress's dev event. No responses and no delivery rows:
// those come only from a sync and a send (decisions 13 and 16).

import type { EventId, MailboxId, SafeUrl } from '@/core/brand';
import type { DevSeed } from '@/core/dev/runtime';
import { formsTable, mailboxesTable } from './tables';

/** The sheet id the dev fixture server answers for (SCE_DEV_SHEET_ORIGIN). */
export const DEV_SHEET_ID = '1DevSheetFixture00000000000000000000';

export const devSeed: DevSeed = async (db, { id }) => {
  await db.table(mailboxesTable).insert({
    id: id('Mailbox', 'comms-dev') as MailboxId,
    legacyId: null,
    displayName: 'Hòm thư Ban Tổ chức (thử nghiệm)',
    email: 'ban.to.chuc@example.com' as never,
    clientId: null,
    isDefault: true,
  });
  await db.table(formsTable).insert({
    eventId: id('Event', 'progress-dev') as EventId,
    formUrl: 'https://forms.gle/devFormExample' as SafeUrl,
    sheetCsvUrl: `https://docs.google.com/spreadsheets/d/${DEV_SHEET_ID}/export?format=csv` as SafeUrl,
    autoSync: false,
    autoAddNewGuests: false,
    columnMap: null,
    lastSyncAt: null,
    lastAttemptAt: null,
    lastSyncError: null,
    sheetHeaders: [],
  });
};
