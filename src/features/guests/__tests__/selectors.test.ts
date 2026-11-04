import { describe, expect, it } from 'vitest';
import type { SeatCode, Version } from '@/core/brand';
import { DEFAULT_SETTINGS, type SystemSettings } from '@/core/settings';
import { filterGuests, guestIdentityKey, guestKpis, guestQuota, isNamecardGuest, printSets, quotaProgress } from '..';
import { NO_FILTER, rsvpTransition, sameGuest } from '../domain/roster';
import { entry } from './roster-fixture';

const settings = (guestQuotaPercent = 130): SystemSettings => ({ ...DEFAULT_SETTINGS, guestQuotaPercent, version: 1 as Version });

describe('invite quota (decision 2): ceil(targetGuests x percent / 100), one selector', () => {
  it.each([
    [150, 130, 195],
    [100, 130, 130],
    [1, 130, 2],
    [7, 130, 10],
    [33, 130, 43],
    [3, 125, 4],
    [10, 100, 10],
    [0, 130, 0],
    [200, 200, 400],
  ])('%i guests at %i%% -> %i', (target, percent, quota) => {
    expect(guestQuota(target, settings(percent))).toBe(quota);
  });

  it('reports reached, missing, surplus and percent against the quota', () => {
    expect(quotaProgress(100, 100, settings())).toMatchObject({ quota: 130, reached: false, missing: 30, surplus: 0, percent: 77, target: 100, percentOfTarget: 130 });
    expect(quotaProgress(140, 100, settings())).toMatchObject({ quota: 130, reached: true, missing: 0, surplus: 10, percent: 108 });
    expect(quotaProgress(0, 0, settings())).toMatchObject({ quota: 0, reached: true, percent: 0 });
  });
});

describe('guest KPIs', () => {
  const roster = [
    entry({ rsvpStatus: 'confirmed', hasBanquet: true, seatCode: 'A-01' }),
    entry({ rsvpStatus: 'substituted', hasBanquet: true }),
    entry({ rsvpStatus: 'declined', hasBanquet: true, seatCode: 'A-02' }),
    entry({ rsvpStatus: 'pending' }),
    entry({ rsvpStatus: 'pending', hasBanquet: true }),
  ];

  it('attending is confirmed + substituted; banquet excludes declined (m4a B39); seated counts the joined seat (B43)', () => {
    expect(guestKpis(roster, 150)).toEqual({ total: 5, target: 150, attending: 2, declined: 1, substituted: 1, pending: 2, banquet: 3, seated: 2 });
    expect(guestKpis([], 0)).toEqual({ total: 0, target: 0, attending: 0, declined: 0, substituted: 0, pending: 0, banquet: 0, seated: 0 });
  });
});

describe('print sets (m4a B38, m4b BUG-32)', () => {
  const vipZone = (code: SeatCode) => code.startsWith('V-');

  it('VIP group or a VIP-zone seat gets a tent, everyone else a badge, nobody both, decliners neither', () => {
    const vip = entry({ group: 'VIP' });
    const inVipZone = entry({ group: 'DoanhNghiep', seatCode: 'V-01' });
    const rowA = entry({ group: 'SoNganh', seatCode: 'A-01' });
    const declinedVip = entry({ group: 'VIP', rsvpStatus: 'declined' });
    const press = entry({ group: 'BaoChi' });
    expect(isNamecardGuest(inVipZone, vipZone)).toBe(true);
    expect(isNamecardGuest(rowA, vipZone)).toBe(false);
    const sets = printSets([vip, inVipZone, rowA, declinedVip, press], vipZone);
    expect(sets.namecards.map((g) => g.id)).toEqual([vip.id, inVipZone.id]);
    expect(sets.badges.map((g) => g.id)).toEqual([rowA.id, press.id]);
  });
});

describe('identity and dedupe (m4a B41)', () => {
  it('guestIdentityKey: folded email, else phone digits, else folded name and organization', () => {
    expect(guestIdentityKey({ name: 'A', organization: 'B', email: 'X@Y.vn' as never, phone: '0912 345 678' })).toBe('email:x@y.vn');
    expect(guestIdentityKey({ name: 'A', organization: 'B', email: null, phone: '+84 912.345.678' })).toBe('phone:0912345678');
    expect(guestIdentityKey({ name: ' Nguyễn  Văn An ', organization: 'Sở Tài Chính', email: null, phone: '' })).toBe('name:nguyen van an|so tai chinh');
  });

  it('sameGuest compares the first identity both records carry', () => {
    const base = { name: 'Nguyễn Văn An', organization: 'Sở Tài chính', email: null, phone: '' };
    expect(sameGuest(base, { ...base, name: 'NGUYEN VAN AN', phone: '0912.345.678' })).toBe(true);
    expect(sameGuest({ ...base, email: 'a@x.vn' as never }, { ...base, email: 'b@x.vn' as never })).toBe(false);
    expect(sameGuest({ ...base, phone: '0912345678' }, { ...base, phone: '0912345679' })).toBe(false);
  });
});

describe('one search and filter for every list (m4a B45)', () => {
  const roster = [
    entry({ name: 'Nguyễn Văn Bình', organization: 'Tập đoàn FPT', group: 'DoanhNghiep', rsvpStatus: 'confirmed' }),
    entry({ name: 'Trần Thị Hoa', title: 'Phó Giám đốc', organization: 'Sở Ngoại vụ', group: 'SoNganh', email: 'hoa@hanoi.gov.vn', seatCode: 'B-02' }),
    entry({ name: 'Lê Văn Cường', rsvpStatus: 'substituted', substituteName: 'Vũ Đăng' }),
  ];
  const names = (f: Partial<typeof NO_FILTER>) => filterGuests(roster, { ...NO_FILTER, ...f }).map((g) => g.name);

  it('is tone-insensitive and matches name, title, organization, email, substitute and seat', () => {
    expect(names({ q: 'binh fpt' })).toEqual(['Nguyễn Văn Bình']);
    expect(names({ q: 'pho giam doc' })).toEqual(['Trần Thị Hoa']);
    expect(names({ q: 'hanoi.gov' })).toEqual(['Trần Thị Hoa']);
    expect(names({ q: 'vu dang' })).toEqual(['Lê Văn Cường']);
    expect(names({ q: 'B-02' })).toEqual(['Trần Thị Hoa']);
  });

  it('filters by group and RSVP; pending matches every unanswered guest', () => {
    expect(names({ group: 'SoNganh' })).toEqual(['Trần Thị Hoa']);
    expect(names({ rsvp: 'pending' })).toEqual(['Trần Thị Hoa']);
    expect(names({ rsvp: 'confirmed', group: 'SoNganh' })).toEqual([]);
  });
});

describe('rsvpTransition (m4a B18)', () => {
  it('releases the seat on decline and drops the substitute when leaving substituted', () => {
    expect(rsvpTransition({ rsvpStatus: 'substituted', substituteName: 'X' }, { rsvpStatus: 'declined' })).toEqual({ patch: { rsvpStatus: 'declined', substituteName: '' }, statusChanged: true, releasesSeat: true });
    expect(rsvpTransition({ rsvpStatus: 'pending', substituteName: '' }, { notes: 'n' })).toEqual({ patch: { notes: 'n' }, statusChanged: false, releasesSeat: false });
  });
});
