// One run of a campaign, as the browser runs it: claim the addresses under
// the run's token, send to the claimed ones through the dispatcher, record
// each outcome on its claim, and release the claims the run did not use.
// A long run renews its claims well inside the lease, so its unsent tail is
// never taken for a dead run's; if they were taken anyway, it stops.
// Pure: the commands and the transport are passed in, so tests run exactly
// this with the fakes.

import type { CampaignId, Email } from '@/core/brand';
import type { Recipient } from './compose';
import { dispatch, TransportError, type DispatchOptions, type DispatchOutcome, type DispatchReport } from './dispatcher';
import { MAX_CLAIM_BATCH, type RunToken } from './schemas';

/** A claim untouched this long belongs to a run that died, and any run may take it over. */
export const CLAIM_LEASE_MS = 30 * 60_000;
/** A live run renews its claims this often, before its next message. */
export const CLAIM_RENEW_MS = 5 * 60_000;

export interface ClaimResult {
  campaignId: CampaignId;
  claimed: ReadonlyArray<Email>;
  alreadySent: ReadonlyArray<Email>;
  inFlight: ReadonlyArray<Email>;
  ownInFlight: ReadonlyArray<Email>;
}

/** Which run this is. A new token per run; `takeOver` claims what another run of the same officer still holds. */
export interface RunClaim {
  token: RunToken;
  takeOver: boolean;
}

export interface CampaignApi {
  /** comms.startCampaign for one chunk; null when it failed (the caller has shown why). */
  claim(chunk: ReadonlyArray<Recipient>, run: RunClaim): Promise<ClaimResult | null>;
  /** comms.recordDeliveries for one outcome; false when it failed. */
  record(campaignId: CampaignId, token: RunToken, outcome: DispatchOutcome<Recipient>): Promise<boolean>;
  /** comms.releaseDeliveries; a failure leaves the rows "Đang gửi" in the log and is not fatal. */
  release(campaignId: CampaignId, token: RunToken, emails: ReadonlyArray<Email>): Promise<void>;
  /** comms.renewClaims: the addresses this run still holds, or null when the renewal failed. */
  renew(campaignId: CampaignId, token: RunToken): Promise<ReadonlyArray<Email> | null>;
}

export interface CampaignReport extends DispatchReport<Recipient> {
  campaignId: CampaignId | null;
  /** Already received this message: not sent again. */
  alreadySent: ReadonlyArray<Recipient>;
  /** Held by another officer's run in progress: not sent. */
  inFlight: ReadonlyArray<Recipient>;
  /** Held by another run of this officer (another tab, or the page before a reload): not sent unless taken over. */
  ownInFlight: ReadonlyArray<Recipient>;
  /** The claim failed, so nothing was sent. */
  claimFailed: boolean;
}

export async function runCampaign(
  o: { recipients: ReadonlyArray<Recipient>; api: CampaignApi; run: RunClaim; now?: () => number } & Omit<DispatchOptions<Recipient>, 'recipients' | 'record'>,
): Promise<CampaignReport> {
  const empty = { sent: [], failed: [], skipped: [], unrecorded: [], stoppedBy: null, alreadySent: [], inFlight: [], ownInFlight: [] };
  if (o.recipients.length === 0) return { ...empty, campaignId: null, claimFailed: false };
  const token = o.run.token;
  const release = async (cid: CampaignId, emails: ReadonlyArray<Email>) => {
    for (let i = 0; i < emails.length; i += MAX_CLAIM_BATCH) await o.api.release(cid, token, emails.slice(i, i + MAX_CLAIM_BATCH)).catch(() => undefined);
  };
  let campaignId: CampaignId | null = null;
  const claimed = new Set<string>();
  const alreadySent = new Set<string>();
  const inFlight = new Set<string>();
  const ownInFlight = new Set<string>();
  for (let i = 0; i < o.recipients.length; i += MAX_CLAIM_BATCH) {
    const r = await o.api.claim(o.recipients.slice(i, i + MAX_CLAIM_BATCH), o.run);
    if (!r || (campaignId !== null && r.campaignId !== campaignId)) {
      if (campaignId && claimed.size > 0) await release(campaignId, [...claimed] as Email[]);
      return { ...empty, campaignId, claimFailed: true };
    }
    campaignId = r.campaignId;
    for (const e of r.claimed) claimed.add(e);
    for (const e of r.alreadySent) alreadySent.add(e);
    for (const e of r.inFlight) inFlight.add(e);
    for (const e of r.ownInFlight) ownInFlight.add(e);
  }
  const id = campaignId!;
  const toSend = o.recipients.filter((r) => claimed.has(r.email));
  const now = o.now ?? Date.now;
  let renewedAt = now();
  const report = await dispatch({
    ...o,
    recipients: toSend,
    async send(r) {
      if (now() - renewedAt >= CLAIM_RENEW_MS) {
        const held = await o.api.renew(id, token).catch(() => null);
        // A failed renewal leaves the lease running; the next message tries again.
        if (held) {
          renewedAt = now();
          if (!held.includes(r.email)) throw new TransportError({ kind: 'claim_lost', message: 'Một phiên gửi khác đã tiếp quản những người nhận còn lại.' });
        }
      }
      return o.send(r);
    },
    async record(outcome) {
      if (!(await o.api.record(id, token, outcome))) throw new Error('record');
    },
  });
  await release(id, report.skipped.map((s) => s.recipient.email));
  return {
    ...report,
    campaignId: id,
    alreadySent: o.recipients.filter((r) => alreadySent.has(r.email)),
    inFlight: o.recipients.filter((r) => inFlight.has(r.email)),
    ownInFlight: o.recipients.filter((r) => ownInFlight.has(r.email)),
    claimFailed: false,
  };
}
