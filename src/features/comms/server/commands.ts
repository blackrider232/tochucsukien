// Every write of the comms feature. Each mutation is audited by the pipeline
// with a summary counted from what it did; guest effects go through guests
// commands (ctx.call).

import type { CampaignId, Email, EventId, GuestId, MailboxId, RsvpResponseId, Version } from '@/core/brand';
import { defineCommands, type Sig } from '@/core/commands';
import type { SenderMailbox } from '../contract';
import type { ColumnMap } from '../domain/columns';
import type { DeliveryResult, FormConfig, MailboxDraft } from '../domain/schemas';
import { recordDeliveries } from './deliveries';
import type { SyncReport } from '../domain/sync-report';
import { resolveResponse, saveColumnMap, saveForm, syncFormWith } from './form';
import { deleteMailbox, restoreMailbox, saveMailbox } from './mailboxes';
import { defaultSheetSource, type SheetSource } from './sheet-source';
import type { ApplyStatus, FormRow } from './tables';

declare module '@/core/commands' {
  interface CommandMap {
    /** Create (version null) or update a sender mailbox; one default always. `promote` names the successor when the default is switched off. */
    'comms.saveMailbox': Sig<{ id: MailboxId; version: Version | null; draft: MailboxDraft; promote?: MailboxId | null }, SenderMailbox>;
    'comms.deleteMailbox': Sig<{ id: MailboxId; version: Version }, null>;
    /** The undo of comms.deleteMailbox: the same id, through the same rules as a save. */
    'comms.restoreMailbox': Sig<{ id: MailboxId; draft: MailboxDraft }, SenderMailbox>;
    'comms.saveForm': Sig<{ eventId: EventId; version: Version | null; config: FormConfig }, FormRow>;
    /** null returns to detecting the columns from the header row. */
    'comms.saveColumnMap': Sig<{ eventId: EventId; version: Version; columnMap: ColumnMap | null }, FormRow>;
    /** "Đồng bộ ngay" and the cron route. */
    'comms.syncForm': Sig<{ eventId: EventId }, SyncReport>;
    'comms.resolveResponse': Sig<
      {
        eventId: EventId;
        id: RsvpResponseId;
        version: Version;
        action: { kind: 'match'; guestId: GuestId } | { kind: 'create' } | { kind: 'dismiss' } | { kind: 'reopen' };
      },
      { applyStatus: ApplyStatus }
    >;
    /** Outcomes of real sends, recorded as Gmail answered them. */
    'comms.recordDeliveries': Sig<
      { eventId: EventId; campaignId: CampaignId; senderEmail: Email; subject: string; results: ReadonlyArray<DeliveryResult> },
      { recorded: number }
    >;
  }
}

/** What the commands reach outside the database. Tests pass fakes; `commands` gets the defaults. */
export interface CommsDeps {
  sheets: SheetSource;
}

export const createCommands = (deps: CommsDeps) =>
  defineCommands('comms', {
    saveMailbox,
    deleteMailbox,
    restoreMailbox,
    saveForm,
    saveColumnMap,
    syncForm: syncFormWith(deps.sheets),
    resolveResponse,
    recordDeliveries,
  });

export const commands = createCommands({ sheets: defaultSheetSource });
