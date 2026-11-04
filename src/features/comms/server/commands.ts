// Every write of the comms feature. Each mutation is audited by the pipeline
// with a summary counted from what it did; guest effects go through guests
// commands (ctx.call).

import type { CampaignId, Email, EventId, GuestId, MailboxId, RsvpResponseId, Version } from '@/core/brand';
import { defineCommands, type Sig } from '@/core/commands';
import type { SenderMailbox } from '../contract';
import type { AnswerLabels } from '../domain/answers';
import type { ColumnMap } from '../domain/columns';
import type { DeliveryResult, FormConfig, MailboxDraft, RunToken } from '../domain/schemas';
import { markNotSent, markSending, recordDeliveries, releaseDeliveries, renewClaims, startCampaign } from './deliveries';
import type { SyncReport } from '../domain/sync-report';
import { resolveResponse, saveAnswerLabels, saveColumnMap, saveForm, syncFormWith } from './form';
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
    /** The Form's RSVP choices and what each means; an answer that is exactly one of them is applied as that. */
    'comms.saveAnswerLabels': Sig<{ eventId: EventId; version: Version; labels: AnswerLabels }, FormRow>;
    /** "Đồng bộ ngay" and the cron route. */
    'comms.syncForm': Sig<{ eventId: EventId }, SyncReport>;
    'comms.resolveResponse': Sig<
      {
        eventId: EventId;
        id: RsvpResponseId;
        version: Version;
        /** `answer`: a person read an answer waiting for review and decided it; applied at the response's own time. */
        action: { kind: 'match'; guestId: GuestId } | { kind: 'create' } | { kind: 'dismiss' } | { kind: 'reopen' } | { kind: 'answer'; status: 'confirmed' | 'declined' };
      },
      { applyStatus: ApplyStatus }
    >;
    /**
     * Claims each address for one message before it is sent, for the run `runToken` names. The campaign id comes from
     * the subject and body templates, so the same message composed again is the same campaign, and an address that
     * already received it is refused. A fresh claim of another run is left alone: `inFlight` when another officer
     * holds it, `ownInFlight` when another run of this officer does, which `takeOver` claims for this run instead.
     * `unclear` addresses had a send whose answer was lost, or a dead run's message in flight (which the claim turns
     * unknown); they wait for comms.markNotSent.
     */
    'comms.startCampaign': Sig<
      {
        eventId: EventId; senderEmail: Email; subject: string; body: string; attachQr: boolean; runToken: RunToken; takeOver: boolean;
        recipients: ReadonlyArray<{ guestId: GuestId | null; email: Email; recipientName: string }>;
      },
      { campaignId: CampaignId; claimed: ReadonlyArray<Email>; alreadySent: ReadonlyArray<Email>; inFlight: ReadonlyArray<Email>; ownInFlight: ReadonlyArray<Email>; unclear: ReadonlyArray<Email> }
    >;
    /** Outcomes of real sends, recorded as Gmail answered them, each on the claim this run holds. */
    'comms.recordDeliveries': Sig<
      { eventId: EventId; campaignId: CampaignId; runToken: RunToken; senderEmail: Email; subject: string; results: ReadonlyArray<DeliveryResult> },
      { recorded: number; notInvited: number }
    >;
    /** After a check of Gmail's Sent folder: messages whose answer was lost did not go, and may be sent again. */
    'comms.markNotSent': Sig<{ eventId: EventId; campaignId: CampaignId; emails: ReadonlyArray<Email> }, { marked: number }>;
    /** A live run's heartbeat: keeps its claims from looking like a dead run's, and names those it still holds. */
    'comms.renewClaims': Sig<{ eventId: EventId; campaignId: CampaignId; runToken: RunToken }, { held: ReadonlyArray<Email> }>;
    /** Marks this run's claim of one address as being sent, just before the message goes to Gmail; `held` false when the run lost it. */
    'comms.markSending': Sig<{ eventId: EventId; campaignId: CampaignId; runToken: RunToken; email: Email }, { held: boolean }>;
    /** Frees the claims a stopped run did not use. */
    'comms.releaseDeliveries': Sig<{ eventId: EventId; campaignId: CampaignId; runToken: RunToken; emails: ReadonlyArray<Email> }, { released: number }>;
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
    saveAnswerLabels,
    syncForm: syncFormWith(deps.sheets),
    resolveResponse,
    startCampaign,
    recordDeliveries,
    renewClaims,
    markSending,
    releaseDeliveries,
    markNotSent,
  });

export const commands = createCommands({ sheets: defaultSheetSource });
