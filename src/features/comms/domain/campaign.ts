// One run of a campaign, as the browser runs it: claim the addresses, send
// to the claimed ones through the dispatcher, record each outcome on its
// claim, and release the claims the run did not use. Pure: the commands and
// the transport are passed in, so tests run exactly this with the fakes.

import type { CampaignId, Email } from '@/core/brand';
import type { Recipient } from './compose';
import { dispatch, type DispatchOptions, type DispatchOutcome, type DispatchReport } from './dispatcher';
import { MAX_CLAIM_BATCH } from './schemas';

export interface ClaimResult {
  campaignId: CampaignId;
  claimed: ReadonlyArray<Email>;
  alreadySent: ReadonlyArray<Email>;
  inFlight: ReadonlyArray<Email>;
}

export interface CampaignApi {
  /** comms.startCampaign for one chunk; null when it failed (the caller has shown why). */
  claim(chunk: ReadonlyArray<Recipient>): Promise<ClaimResult | null>;
  /** comms.recordDeliveries for one outcome; false when it failed. */
  record(campaignId: CampaignId, outcome: DispatchOutcome<Recipient>): Promise<boolean>;
  /** comms.releaseDeliveries; a failure leaves the rows "Đang gửi" in the log and is not fatal. */
  release(campaignId: CampaignId, emails: ReadonlyArray<Email>): Promise<void>;
}

export interface CampaignReport extends DispatchReport<Recipient> {
  campaignId: CampaignId | null;
  /** Already received this message: not sent again. */
  alreadySent: ReadonlyArray<Recipient>;
  /** Held by another officer's run in progress: not sent. */
  inFlight: ReadonlyArray<Recipient>;
  /** The claim failed, so nothing was sent. */
  claimFailed: boolean;
}

export async function runCampaign(
  o: { recipients: ReadonlyArray<Recipient>; api: CampaignApi } & Omit<DispatchOptions<Recipient>, 'recipients' | 'record'>,
): Promise<CampaignReport> {
  const empty = { sent: [], failed: [], skipped: [], unrecorded: [], stoppedBy: null };
  if (o.recipients.length === 0) return { ...empty, campaignId: null, alreadySent: [], inFlight: [], claimFailed: false };
  const release = async (cid: CampaignId, emails: ReadonlyArray<Email>) => {
    for (let i = 0; i < emails.length; i += MAX_CLAIM_BATCH) await o.api.release(cid, emails.slice(i, i + MAX_CLAIM_BATCH)).catch(() => undefined);
  };
  let campaignId: CampaignId | null = null;
  const claimed = new Set<string>();
  const alreadySent = new Set<string>();
  const inFlight = new Set<string>();
  for (let i = 0; i < o.recipients.length; i += MAX_CLAIM_BATCH) {
    const r = await o.api.claim(o.recipients.slice(i, i + MAX_CLAIM_BATCH));
    if (!r || (campaignId !== null && r.campaignId !== campaignId)) {
      if (campaignId && claimed.size > 0) await release(campaignId, [...claimed] as Email[]);
      return { ...empty, campaignId, alreadySent: [], inFlight: [], claimFailed: true };
    }
    campaignId = r.campaignId;
    for (const e of r.claimed) claimed.add(e);
    for (const e of r.alreadySent) alreadySent.add(e);
    for (const e of r.inFlight) inFlight.add(e);
  }
  const id = campaignId!;
  const toSend = o.recipients.filter((r) => claimed.has(r.email));
  const report = await dispatch({
    ...o,
    recipients: toSend,
    async record(outcome) {
      if (!(await o.api.record(id, outcome))) throw new Error('record');
    },
  });
  await release(id, report.skipped.map((s) => s.recipient.email));
  return {
    ...report,
    campaignId: id,
    alreadySent: o.recipients.filter((r) => alreadySent.has(r.email)),
    inFlight: o.recipients.filter((r) => inFlight.has(r.email)),
    claimFailed: false,
  };
}
