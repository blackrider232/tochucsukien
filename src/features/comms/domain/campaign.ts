// One run of a campaign, as the browser runs it: claim the addresses under
// the run's token, mark each claim 'sending' just before its message goes to
// Gmail, send through the dispatcher, record each outcome on its claim, and
// release the claims the run did not use.
// A long run renews its claims well inside the lease, so its unsent tail is
// never taken for a dead run's; if they were taken anyway, or renewals keep
// failing until the claims could run out, it stops.
// Pure: the commands and the transport are passed in, so tests run exactly
// this with the fakes.

import type { CampaignId, Email } from '@/core/brand';
import type { Recipient } from './compose';
import { dispatch, TransportError, type DispatchOptions, type DispatchOutcome, type DispatchReport } from './dispatcher';
import { MAX_CLAIM_BATCH, type RunToken } from './schemas';

/** A claim untouched this long belongs to a run that died, and any run may take it over. */
export const CLAIM_LEASE_MS = 30 * 60_000;
/**
 * The lease compares the command's clock (the app server's) with the row's updated_at (the database's): a claim is
 * taken for a dead run's only this much after the lease, so a server clock a little ahead never ends a live claim.
 */
export const CLAIM_SKEW_MS = 2 * 60_000;
/** A live run renews its claims this often, before its next message. */
export const CLAIM_RENEW_MS = 5 * 60_000;
/**
 * A run whose last good renewal is this old sends nothing more: renewals keep failing, and its unsent claims must not
 * run out while it still sends. The margin covers a message's own retries and a clock that runs apart from the server's.
 */
export const CLAIM_STALE_MS = CLAIM_LEASE_MS - 10 * 60_000;

export interface ClaimResult {
  campaignId: CampaignId;
  claimed: ReadonlyArray<Email>;
  alreadySent: ReadonlyArray<Email>;
  inFlight: ReadonlyArray<Email>;
  ownInFlight: ReadonlyArray<Email>;
  unclear: ReadonlyArray<Email>;
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
  /** comms.markSending: true when marked, false when this run no longer holds the claim, null when it failed. */
  markSending(campaignId: CampaignId, token: RunToken, email: Email): Promise<boolean | null>;
}

export interface CampaignReport extends DispatchReport<Recipient> {
  campaignId: CampaignId | null;
  /** Already received this message: not sent again. */
  alreadySent: ReadonlyArray<Recipient>;
  /** Held by another officer's run in progress: not sent. */
  inFlight: ReadonlyArray<Recipient>;
  /** Held by another run of this officer (another tab, or the page before a reload): not sent unless taken over. */
  ownInFlight: ReadonlyArray<Recipient>;
  /** An earlier send of this message lost Gmail's answer: maybe received. Not sent until an officer marks it not sent. */
  unclear: ReadonlyArray<Recipient>;
  /** The claim failed, so nothing was sent. */
  claimFailed: boolean;
}

export async function runCampaign(
  o: { recipients: ReadonlyArray<Recipient>; api: CampaignApi; run: RunClaim; now?: () => number } & Omit<DispatchOptions<Recipient>, 'recipients' | 'record'>,
): Promise<CampaignReport> {
  const empty = { sent: [], failed: [], unknown: [], skipped: [], unrecorded: [], stoppedBy: null, alreadySent: [], inFlight: [], ownInFlight: [], unclear: [] };
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
  const unclear = new Set<string>();
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
    for (const e of r.unclear) unclear.add(e);
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
        // A failed renewal leaves the lease running; the next message tries again, until the claims are too old.
        if (held) {
          renewedAt = now();
          if (!held.includes(r.email)) throw new TransportError({ kind: 'claim_lost', message: 'Một phiên gửi khác đã tiếp quản những người nhận còn lại.' });
        }
      }
      if (now() - renewedAt >= CLAIM_STALE_MS) throw new TransportError({ kind: 'claim_stale', message: 'Không gia hạn được giữ chỗ người nhận.' });
      // Marked before Gmail is asked: a run that dies past this point leaves no claim another run would send again.
      const marked = await o.api.markSending(id, token, r.email).catch(() => null);
      if (marked === false) throw new TransportError({ kind: 'claim_lost', message: 'Một phiên gửi khác đã tiếp quản những người nhận còn lại.' });
      if (marked === null) throw new TransportError({ kind: 'not_marked', message: 'Không đánh dấu được thư là đang gửi.' });
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
    unclear: o.recipients.filter((r) => unclear.has(r.email)),
    claimFailed: false,
  };
}
