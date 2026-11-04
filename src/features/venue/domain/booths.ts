// Fair booths (Phụ lục III) and the SCE duty shifts. One registry per enum, one
// KPI formula set (m4b §3.7), pure filters.

import type { IsoDate } from '@/core/brand';
import { foldVi, matchesQuery } from '@/core/text';
import type { EnumRegistry } from '@/core/vocab';
import type { Booth, BoothKpis, BoothShift, BoothStatus, SubsidyPercent } from '../contract';

/** One label per status for tile, table, form and export (m4b BUG-23, BUG-31). */
export const BOOTH_STATUS: EnumRegistry<BoothStatus> = {
  confirmed: { label: 'Đã giao doanh nghiệp', short: 'Đã giao DN', tone: 'emerald' },
  reviewing: { label: 'Đang thẩm định', short: 'Thẩm định', tone: 'amber' },
  available: { label: 'Gian còn trống', short: 'Gian trống', tone: 'slate' },
};
export const BOOTH_STATUS_VALUES = ['confirmed', 'reviewing', 'available'] as const satisfies ReadonlyArray<BoothStatus>;

export type SubsidyKey = `${SubsidyPercent}`;
export const SUBSIDY: EnumRegistry<SubsidyKey> = {
  '50': { label: 'Hỗ trợ 50% chi phí gian hàng (Quy định TP)', short: 'Hỗ trợ 50%', tone: 'emerald' },
  '100': { label: 'Hỗ trợ 100% chi phí gian hàng (Đặc biệt)', short: 'Hỗ trợ 100%', tone: 'purple' },
  '0': { label: 'Doanh nghiệp tự túc kinh phí', short: 'Tự túc', tone: 'slate' },
};
export const SUBSIDY_VALUES = [50, 100, 0] as const satisfies ReadonlyArray<SubsidyPercent>;
export const subsidyKey = (p: SubsidyPercent) => String(p) as SubsidyKey;

export const BOOTH_CODE_PATTERN = /^[A-Z]{1,2}[0-9]{2,3}$/;
export const DEFAULT_BOOTH_SIZE = '01 gian tiêu chuẩn (9m²)';

/** Dãy (row letters) and position of a booth code: 'A01' is row A, number 1. */
export function boothRow(code: string): { row: string; number: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(code);
  return m ? { row: m[1]!, number: Number(m[2]) } : { row: code, number: 0 };
}

/** Booths grouped by row, rows and positions in order (m4b BUG-36). */
export function boothsByRow<B extends Pick<Booth, 'code'>>(booths: ReadonlyArray<B>): ReadonlyArray<{ row: string; booths: ReadonlyArray<B> }> {
  const sorted = booths.toSorted((a, b) => {
    const [x, y] = [boothRow(a.code), boothRow(b.code)];
    return x.row.localeCompare(y.row) || x.number - y.number;
  });
  return [...Map.groupBy(sorted, (b) => boothRow(b.code).row)].map(([row, list]) => ({ row, booths: list }));
}

/** Every number is counted from the booths as they are: no floors, no fixed totals (m4b BUG-18). */
export function boothKpis(booths: ReadonlyArray<Booth>): BoothKpis {
  const count = (f: (b: Booth) => boolean) => booths.filter(f).length;
  const placed = (b: Booth) => b.status !== 'available';
  return {
    total: booths.length,
    confirmed: count((b) => b.status === 'confirmed'),
    reviewing: count((b) => b.status === 'reviewing'),
    available: count((b) => b.status === 'available'),
    fullSubsidy: count((b) => placed(b) && b.subsidyPercent === 100),
    halfSubsidy: count((b) => placed(b) && b.subsidyPercent === 50),
  };
}

const distinct = (values: ReadonlyArray<string>) => new Set(values.map((v) => foldVi(v.trim())).filter(Boolean)).size;

/** Companies that hold a confirmed booth, counted once each however it is spelled. */
export const confirmedCompanies = (booths: ReadonlyArray<Booth>) => distinct(booths.filter((b) => b.status === 'confirmed').map((b) => b.company));
export const selfFunded = (booths: ReadonlyArray<Booth>) => booths.filter((b) => b.status !== 'available' && b.subsidyPercent === 0).length;
/** Officers with at least one persisted shift (m4b BUG-19). */
export const officersOnDuty = (shifts: ReadonlyArray<BoothShift>) => distinct(shifts.map((s) => s.officerName));

export interface BoothFilter {
  q: string;
  subsidy: SubsidyKey | 'all';
  status: BoothStatus | 'all';
}
export const NO_BOOTH_FILTER: BoothFilter = { q: '', subsidy: 'all', status: 'all' };

/** Diacritic-insensitive search over code, company, products, contact and staff (m4b BUG-26). */
export function filterBooths<B extends Booth>(booths: ReadonlyArray<B>, f: BoothFilter): ReadonlyArray<B> {
  return booths.filter((b) =>
    (f.subsidy === 'all' || subsidyKey(b.subsidyPercent) === f.subsidy)
    && (f.status === 'all' || b.status === f.status)
    && matchesQuery(f.q, b.code, b.company, b.products, b.contact, b.staff));
}

export type ShiftState = 'done' | 'today' | 'upcoming';
/** Computed from the date, never typed in (m4b BUG-19). */
export const SHIFT_STATE: EnumRegistry<ShiftState> = {
  done: { label: 'Đã trực', short: 'Đã trực', tone: 'slate' },
  today: { label: 'Trực hôm nay', short: 'Hôm nay', tone: 'emerald' },
  upcoming: { label: 'Đã phân công', short: 'Đã phân công', tone: 'blue' },
};
export function shiftState(shift: Pick<BoothShift, 'shiftDate'>, today: IsoDate): ShiftState {
  return shift.shiftDate < today ? 'done' : shift.shiftDate === today ? 'today' : 'upcoming';
}
export function shiftsInOrder<S extends Pick<BoothShift, 'shiftDate' | 'shiftLabel'>>(shifts: ReadonlyArray<S>): ReadonlyArray<S> {
  return shifts.toSorted((a, b) => a.shiftDate.localeCompare(b.shiftDate) || a.shiftLabel.localeCompare(b.shiftLabel));
}
