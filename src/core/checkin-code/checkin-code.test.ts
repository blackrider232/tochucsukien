import { describe, expect, it } from 'vitest';
import type { EventId, GuestId, Instant, UserId, Version } from '@/core/brand';
import { encodeCheckinPayload, legacyScanKey, parseCheckinCode, parseScannedCode, type CheckinCode } from '@/core/checkin-code';
import type { RosterEntry } from '@/features/guests';
import { matchScan } from '@/features/live';

const EVENT = '6f1c2a3e-1111-4a1b-9c2d-000000000001' as EventId;
const OTHER_EVENT = '6f1c2a3e-1111-4a1b-9c2d-000000000002' as EventId;
const G1 = '7a2b3c4d-2222-4b2c-8d3e-000000000001' as GuestId;
const G2 = '7a2b3c4d-2222-4b2c-8d3e-000000000002' as GuestId;
const G3 = '7a2b3c4d-2222-4b2c-8d3e-000000000003' as GuestId;

function guest(id: GuestId, over: Partial<RosterEntry> = {}): RosterEntry {
  return {
    id, eventId: EVENT, name: 'Khách', group: 'DoanhNghiep', title: '', organization: '', phone: '', email: null,
    sendMethod: 'direct', inviteStatus: 'sent', rsvpStatus: 'confirmed', rsvpSource: 'manual', rsvpAt: null,
    substituteName: '', hasBanquet: false, notes: '', checkinCode: 'A1B2C3' as CheckinCode, masterContactId: null,
    version: 1 as Version, createdAt: '2026-11-01T00:00:00.000Z' as Instant, createdBy: null as UserId | null,
    updatedAt: '2026-11-01T00:00:00.000Z' as Instant, seatCode: null, checkedInAt: null, giftGivenAt: null,
    ...over,
  };
}

describe('parseScannedCode', () => {
  it('round-trips the one generated payload', () => {
    const payload = encodeCheckinPayload(EVENT, G1);
    expect(payload).toBe(`SCE-CHK:${EVENT}:${G1}`);
    expect(parseScannedCode(payload)).toEqual({ kind: 'canonical', eventId: EVENT, guestId: G1 });
    expect(parseScannedCode(`  sce-chk:${EVENT.toUpperCase()}:${G1}\n`)).toEqual({ kind: 'canonical', eventId: EVENT, guestId: G1 });
  });

  it('accepts pre-cutover badge payloads as legacy', () => {
    expect(parseScannedCode('SCE-CHK:evt_1700000000000:gst_vip_01')).toEqual({ kind: 'legacy', legacyEventId: 'evt_1700000000000', legacyGuestId: 'gst_vip_01' });
  });

  it('accepts the legacy emailed PNG payload, whose name may contain colons (m4a B13)', () => {
    expect(parseScannedCode('SCE-CHECKIN:gst_dn_02:Ông A: Giám đốc:evt_17')).toEqual({ kind: 'legacy', legacyEventId: 'evt_17', legacyGuestId: 'gst_dn_02' });
  });

  it('reads printed human codes with Crockford tolerance', () => {
    expect(parseScannedCode('a1b2c3')).toEqual({ kind: 'human', code: 'A1B2C3' });
    expect(parseCheckinCode('OIL-23K')).toBe('01123K');
    expect(parseCheckinCode('ABCDEU')).toBeNull();
  });

  it('reads phone numbers only at full length', () => {
    expect(parseScannedCode('0913.210.001')).toEqual({ kind: 'phone', digits: '0913210001' });
    expect(parseScannedCode('+84 913 210 001')).toEqual({ kind: 'phone', digits: '0913210001' });
    expect(parseScannedCode('01')).toEqual({ kind: 'invalid', raw: '01' });
  });

  it.each(['', 'SCE-CHK:', 'SCE-CHK:a:b:c', 'SCE-CHECKIN:x:y', 'hello world', 'https://evil.example'])('rejects %j', (raw) => {
    expect(parseScannedCode(raw).kind).toBe('invalid');
  });
});

describe('matchScan outcomes (m5 BUG-06/07/08)', () => {
  const roster = [
    guest(G1, { name: 'Nguyễn Văn A', phone: '0913.210.001', checkinCode: 'K7M2PQ' as CheckinCode }),
    guest(G2, { checkedInAt: '2026-12-15T01:05:00.000Z' as Instant, checkinCode: 'R4T6VW' as CheckinCode, phone: '0988 000 111' }),
    guest(G3, { phone: '0988000111', checkinCode: 'X8Y9Z0' as CheckinCode }),
  ];
  const legacy = new Map<string, GuestId>([[legacyScanKey('evt_17', 'gst_vip_01'), G1]]);
  const scan = (raw: string) => matchScan(parseScannedCode(raw), EVENT, roster, legacy);

  it('checks in a canonical badge of this event', () => {
    expect(scan(encodeCheckinPayload(EVENT, G1))).toEqual({ kind: 'ok', guest: roster[0] });
  });

  it('a second scan reports already, never toggles off (BUG-08)', () => {
    expect(scan(encodeCheckinPayload(EVENT, G2))).toEqual({ kind: 'already', guest: roster[1], at: '2026-12-15T01:05:00.000Z' });
  });

  it('a badge from another event is refused (BUG-07)', () => {
    expect(scan(encodeCheckinPayload(OTHER_EVENT, G1))).toEqual({ kind: 'other_event', eventName: null });
    expect(scan('SCE-CHK:evt_99:gst_vip_01')).toEqual({ kind: 'other_event', eventName: null });
  });

  it('resolves legacy badges through the event-qualified legacy id map', () => {
    expect(scan('SCE-CHK:evt_17:gst_vip_01')).toEqual({ kind: 'ok', guest: roster[0] });
    expect(scan('SCE-CHECKIN:gst_vip_01:Nguyễn Văn A:evt_17')).toEqual({ kind: 'ok', guest: roster[0] });
    expect(scan('SCE-CHK:evt_17:gst_vip_09')).toEqual({ kind: 'not_found' });
  });

  it('matches human codes exactly', () => {
    expect(scan('k7m2pq')).toEqual({ kind: 'ok', guest: roster[0] });
    expect(scan('K7M2PR')).toEqual({ kind: 'not_found' });
  });

  it('matches normalized phones exactly and refuses to guess between two guests (BUG-06)', () => {
    expect(scan('+84 913 210 001')).toEqual({ kind: 'ok', guest: roster[0] });
    expect(scan('0988000111')).toEqual({ kind: 'ambiguous', candidates: [roster[1], roster[2]] });
    expect(scan('0913210002')).toEqual({ kind: 'not_found' });
  });

  it('short numeric codes never match a guest by suffix (BUG-06)', () => {
    expect(scan('1')).toEqual({ kind: 'not_found' });
  });
});
