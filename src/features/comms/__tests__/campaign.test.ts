import { describe, expect, it, vi } from 'vitest';
import { newId, type CampaignId, type Email } from '@/core/brand';
import { CLAIM_LEASE_MS, CLAIM_RENEW_MS, CLAIM_STALE_MS, runCampaign, type CampaignApi } from '../domain/campaign';
import { fromManual, type Recipient } from '../domain/compose';

const CAMPAIGN = '0b0e0b0e-0000-5000-8000-000000000001' as CampaignId;
const people = (n: number): Recipient[] => Array.from({ length: n }, (_, i) => fromManual({ email: `p${i}@x.vn` as Email, name: `Người ${i}`, organization: '' }));

/** A fake server: holds what it claimed, renews on request, and lets a test take claims away. */
function fakeApi() {
  const held = new Set<string>();
  const api = {
    claim: vi.fn<CampaignApi['claim']>(async (chunk) => {
      for (const r of chunk) held.add(r.email);
      return { campaignId: CAMPAIGN, claimed: chunk.map((r) => r.email), alreadySent: [], inFlight: [], ownInFlight: [], unclear: [] };
    }),
    record: vi.fn<CampaignApi['record']>(async (_c, _t, o, next) => {
      held.delete(o.recipient.email);
      return { nextHeld: next ? held.has(next) : null };
    }),
    release: vi.fn<CampaignApi['release']>(async () => undefined),
    renew: vi.fn<CampaignApi['renew']>(async () => [...held] as Email[]),
    markSending: vi.fn<CampaignApi['markSending']>(async (_c, _t, email) => held.has(email)),
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

describe('runCampaign stops before its claims could run out', () => {
  it('a renewal that keeps failing stops the run before the last good renewal is older than the lease allows', async () => {
    const { api } = fakeApi();
    api.renew.mockResolvedValue(null);
    let clock = 0;
    const sent: number[] = [];
    const report = await runCampaign({
      recipients: people(4),
      api,
      run: { token: newId<'CampaignRun'>(), takeOver: false },
      now: () => clock,
      signal: new AbortController().signal,
      sleep: async () => undefined,
      send: async () => {
        sent.push(clock);
        clock += 12 * 60_000;
        return { messageId: 'm' };
      },
    });
    // Claimed at 0 and never renewed: the message due at 24 minutes is not sent, the rest are freed.
    expect(sent).toEqual([0, 12 * 60_000]);
    expect(report).toMatchObject({ stoppedBy: 'claim_stale' });
    expect(report.skipped.map((s) => [s.recipient.email, s.reason])).toEqual([['p2@x.vn', 'claim_stale'], ['p3@x.vn', 'claim_stale']]);
    expect(api.release).toHaveBeenCalledWith(CAMPAIGN, expect.anything(), ['p2@x.vn', 'p3@x.vn']);
    expect(CLAIM_STALE_MS).toBeLessThan(CLAIM_LEASE_MS);
  });

  it('a renewal that works again in time keeps the run going', async () => {
    const { api } = fakeApi();
    api.renew.mockResolvedValueOnce(null);
    let clock = 0;
    const report = await runCampaign({
      recipients: people(4),
      api,
      run: { token: newId<'CampaignRun'>(), takeOver: false },
      now: () => clock,
      signal: new AbortController().signal,
      sleep: async () => undefined,
      send: async () => {
        clock += 9 * 60_000;
        return { messageId: 'm' };
      },
    });
    expect(report.sent).toHaveLength(4);
  });
});

describe('runCampaign marks each message as being sent before Gmail is asked', () => {
  const go = (api: CampaignApi, sent: string[]) =>
    runCampaign({
      recipients: people(3),
      api,
      run: { token: newId<'CampaignRun'>(), takeOver: false },
      signal: new AbortController().signal,
      sleep: async () => undefined,
      send: async (r) => {
        sent.push(r.email);
        return { messageId: 'm' };
      },
    });

  it('marks, then sends, one message at a time', async () => {
    const { api } = fakeApi();
    const order: string[] = [];
    api.markSending.mockImplementation(async (_c, _t, email) => {
      order.push(`mark ${email}`);
      return true;
    });
    const sent: string[] = [];
    const report = await go({ ...api, record: async (_c, _t, o, next) => (order.push(`record ${o.recipient.email}, mark ${next ?? '-'}`), { nextHeld: next ? true : null }) }, sent);
    expect(report.sent).toHaveLength(3);
    // The first message is marked on its own; each record marks the next, so a message costs one command.
    expect(order).toEqual(['mark p0@x.vn', 'record p0@x.vn, mark p1@x.vn', 'record p1@x.vn, mark p2@x.vn', 'record p2@x.vn, mark -']);
  });

  it('a next address the record could not mark is marked on its own; one the run lost stops it', async () => {
    const { api, held } = fakeApi();
    api.record.mockImplementationOnce(async (_c, _t, o) => (held.delete(o.recipient.email), { nextHeld: null }));
    api.record.mockImplementationOnce(async (_c, _t, o) => (held.delete(o.recipient.email), held.clear(), { nextHeld: false }));
    const sent: string[] = [];
    const report = await go(api, sent);
    expect(sent).toEqual(['p0@x.vn', 'p1@x.vn']);
    expect(api.markSending.mock.calls.map((c) => c[2])).toEqual(['p0@x.vn', 'p1@x.vn', 'p2@x.vn']);
    expect(report).toMatchObject({ stoppedBy: 'claim_lost' });
  });

  it('a claim no longer held stops the run before Gmail is asked', async () => {
    const { api, held } = fakeApi();
    // The record could not mark the next message, so the run marks it itself.
    api.record.mockImplementation(async (_c, _t, o) => (held.delete(o.recipient.email), { nextHeld: null }));
    api.markSending.mockImplementation(async (_c, _t, email) => email !== 'p1@x.vn' && held.has(email));
    const sent: string[] = [];
    const report = await go(api, sent);
    expect(sent).toEqual(['p0@x.vn']);
    expect(report).toMatchObject({ stoppedBy: 'claim_lost' });
    expect(api.release).toHaveBeenCalledWith(CAMPAIGN, expect.anything(), ['p1@x.vn', 'p2@x.vn']);
  });

  it('a mark that fails (network) stops the run unsent and frees the rest', async () => {
    const { api } = fakeApi();
    api.record.mockResolvedValue({ nextHeld: null });
    api.markSending.mockResolvedValueOnce(true).mockResolvedValueOnce(null);
    const sent: string[] = [];
    const report = await go(api, sent);
    expect(sent).toEqual(['p0@x.vn']);
    expect(report).toMatchObject({ stoppedBy: 'not_marked' });
    expect(report.skipped.map((s) => [s.recipient.email, s.reason])).toEqual([['p1@x.vn', 'not_marked'], ['p2@x.vn', 'not_marked']]);
  });
});
