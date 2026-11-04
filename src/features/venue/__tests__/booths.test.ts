import { describe, expect, it } from 'vitest';
import type { BoothId, BoothShiftId, EventId, IsoDate, Version } from '@/core/brand';
import type { Booth, BoothShift } from '../contract';
import { boothKpis, boothsByRow, confirmedCompanies, filterBooths, NO_BOOTH_FILTER, officersOnDuty, selfFunded, shiftState } from '../domain/booths';
import { boothDraftSchema } from '../domain/schemas';

const E = 'e0000000-0000-4000-8000-000000000001' as EventId;
let n = 0;
const booth = (code: string, over: Partial<Booth> = {}): Booth => ({
  id: `b0000000-0000-4000-8000-${String(++n).padStart(12, '0')}` as BoothId, eventId: E, code, size: '01 gian tiêu chuẩn (9m²)',
  company: `Công ty ${code}`, products: '', subsidyPercent: 50, status: 'confirmed', contact: '', staff: '', version: 1 as Version, ...over,
});

describe('booth KPIs (m4b §3.7, BUG-18)', () => {
  it('counts the booths as they are: no floor of 24, reviewing is not "còn trống", empty booths get no subsidy', () => {
    const booths = [
      booth('A01'), booth('A02', { subsidyPercent: 100 }), booth('A03', { status: 'reviewing' }),
      booth('B01', { status: 'available', company: '', subsidyPercent: 100 }), booth('B02', { subsidyPercent: 0 }),
    ];
    expect(boothKpis(booths)).toEqual({ total: 5, confirmed: 3, reviewing: 1, available: 1, fullSubsidy: 1, halfSubsidy: 2 });
    expect(selfFunded(booths)).toBe(1);
    expect(boothKpis([])).toEqual({ total: 0, confirmed: 0, reviewing: 0, available: 0, fullSubsidy: 0, halfSubsidy: 0 });
  });

  it('counts each confirmed company once, ignoring case and diacritics, and officers from real shifts only', () => {
    const booths = [booth('A01', { company: 'HTX Bát Tràng' }), booth('A02', { company: 'htx bat trang ' }), booth('A03', { company: 'Khác', status: 'reviewing' })];
    expect(confirmedCompanies(booths)).toBe(1);
    const shift = (officerName: string): BoothShift => ({
      id: 'c0000000-0000-4000-8000-000000000001' as BoothShiftId, eventId: E, shiftDate: '2026-12-01' as IsoDate, shiftLabel: 'Sáng', officerName,
      officerUserId: null, department: 'Phòng Phát triển doanh nghiệp', phone: '', zone: '', version: 1 as Version,
    });
    expect(officersOnDuty([])).toBe(0);
    expect(officersOnDuty([shift('Lê Thị Mai'), shift('le thi mai'), shift('Trần B')])).toBe(2);
  });
});

describe('booth list and floorplan', () => {
  it('groups by row and sorts by number, not insertion order (m4b BUG-36)', () => {
    const rows = boothsByRow([booth('B02'), booth('A10'), booth('A02'), booth('B01')]);
    expect(rows.map((r) => [r.row, r.booths.map((b) => b.code)])).toEqual([['A', ['A02', 'A10']], ['B', ['B01', 'B02']]]);
  });

  it('searches without diacritics and filters by subsidy and status (m4b BUG-26)', () => {
    const booths = [booth('A01', { company: 'Gốm Bát Tràng', subsidyPercent: 100 }), booth('A02', { company: 'Lụa Vạn Phúc', status: 'reviewing' })];
    expect(filterBooths(booths, { ...NO_BOOTH_FILTER, q: 'bat trang' }).map((b) => b.code)).toEqual(['A01']);
    expect(filterBooths(booths, { ...NO_BOOTH_FILTER, subsidy: '50' }).map((b) => b.code)).toEqual(['A02']);
    expect(filterBooths(booths, { ...NO_BOOTH_FILTER, status: 'reviewing' }).map((b) => b.code)).toEqual(['A02']);
  });

  it('computes the shift state from the date (m4b BUG-19)', () => {
    const today = '2026-12-02' as IsoDate;
    expect(['2026-12-01', '2026-12-02', '2026-12-03'].map((d) => shiftState({ shiftDate: d as IsoDate }, today))).toEqual(['done', 'today', 'upcoming']);
  });
});

describe('booth draft schema', () => {
  const base = { code: 'a01', size: '', company: '', products: '', subsidyPercent: '50', status: 'available', contact: '', staff: '' };
  it('needs a company unless the booth is still empty (m4b BUG-21), uppercases the code and defaults the size', () => {
    expect(boothDraftSchema.parse(base)).toMatchObject({ code: 'A01', size: '01 gian tiêu chuẩn (9m²)', subsidyPercent: 50, company: '' });
    const r = boothDraftSchema.safeParse({ ...base, status: 'confirmed' });
    expect(r.error?.issues.map((i) => [i.path.join('.'), i.message])).toEqual([['company', 'Nhập tên doanh nghiệp, trừ khi gian còn trống']]);
  });

  it('refuses codes that are not row letters and a number, and subsidies other than 0, 50 and 100', () => {
    for (const code of ['A1', '01A', 'A-01', "A01');alert(1)//", '<b>A01']) expect(boothDraftSchema.safeParse({ ...base, code }).success).toBe(false);
    expect(boothDraftSchema.safeParse({ ...base, subsidyPercent: '30' }).success).toBe(false);
  });
});
