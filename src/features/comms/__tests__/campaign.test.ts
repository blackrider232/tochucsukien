import { describe, expect, it, vi } from 'vitest';
import { newId, type CampaignId, type Email } from '@/core/brand';
import { CLAIM_LEASE_MS, CLAIM_RENEW_MS, runCampaign, type CampaignApi } from '../domain/campaign';
import { fromManual, type Recipient } from '../domain/compose';

const CAMPAIGN = '0b0e0b0e-0000-5000-8000-000000000001' as CampaignId;
const people = (n: number): Recipient[] => Array.from({ length: n }, (_, i) => fromManual({ email: `p${i}@x.vn` as Email, name: `Người ${i}`, organization: '' }));

/** A fake server: holds what it claimed, renews on request, and lets a test take claims away. */
function fakeApi() {
  const held = new Set<string>();
  const api = {
    claim: vi.fn<CampaignApi['claim']>(async (chunk) => {
      for (const r of chunk) held.add(r.email);
      return { campaignId: CAMPAIGN, claimed: chunk.map((r) => r.email), alreadySent: [], inFlight: [], ownInFlight: [] };
    }),
    record: vi.fn<CampaignApi['record']>(async (_c, _t, o) => {
      held.delete(o.recipient.email);
      return true;
    }),
    release: vi.fn<CampaignApi['release']>(async () => undefined),
    renew: vi.fn<CampaignApi['renew']>(async () => [...held] as Email[]),
  };
  return { api, held };
}

describe('runCampaign keeps its claims alive', () => {
  it('renews the run’s claims while a long run is still sending, well inside the lease', async () => {
    const { api } = fakeApi();
    let clock = 0;
    const report = await runCampaign({
      recipients: people(4),
      api,
      run: { token: newId<'CampaignRun'>(), takeOver: false },
      now: () => clock,
      signal: new AbortController().signal,
      sleep: async () => undefined,
      send: async () => {
        clock += 12 * 60_000;
        return { messageId: 'm' };
      },
    });
    expect(report.sent).toHaveLength(4);
    // Before the 2nd, 3rd and 4th message: each came 12 minutes after the last renewal.
    expect(api.renew).toHaveBeenCalledTimes(3);
    expect(CLAIM_RENEW_MS * 4).toBeLessThan(CLAIM_LEASE_MS);
  });

  it('stops without sending when the claims were taken over meanwhile', async () => {
    const { api, held } = fakeApi();
    let clock = 0;
    const sent: string[] = [];
    const report = await runCampaign({
      recipients: people(3),
      api,
      run: { token: newId<'CampaignRun'>(), takeOver: false },
      now: () => clock,
      signal: new AbortController().signal,
      sleep: async () => undefined,
      send: async (r) => {
        sent.push(r.email);
        clock += CLAIM_RENEW_MS;
        // Another run takes the rest over.
        held.clear();
        return { messageId: 'm' };
      },
    });
    expect(sent).toEqual(['p0@x.vn']);
    expect(report).toMatchObject({ stoppedBy: 'claim_lost' });
    expect(report.skipped.map((s) => [s.recipient.email, s.reason])).toEqual([['p1@x.vn', 'claim_lost'], ['p2@x.vn', 'claim_lost']]);
  });

  it('a renewal that fails (network) is tried again before the next message and does not stop the run', async () => {
    const { api } = fakeApi();
    api.renew.mockResolvedValueOnce(null);
    let clock = 0;
    const report = await runCampaign({
      recipients: people(3),
      api,
      run: { token: newId<'CampaignRun'>(), takeOver: false },
      now: () => clock,
      signal: new AbortController().signal,
      sleep: async () => undefined,
      send: async () => {
        clock += CLAIM_RENEW_MS;
        return { messageId: 'm' };
      },
    });
    expect(report.sent).toHaveLength(3);
    expect(api.renew).toHaveBeenCalledTimes(2);
  });
});
