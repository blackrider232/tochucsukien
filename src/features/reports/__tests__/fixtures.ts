// Plain builders for the upstream read models reportFigures consumes, so a
// worked example states only the fields it is about.

import type { BiddingPackageId, BoothId, EventId, GroupId, GuestId, HHmm, Instant, IsoDate, StepId, Vnd, Version } from '@/core/brand';
import type { CheckinCode } from '@/core/checkin-code';
import { buildWorkCalendar, type Holiday } from '@/core/dates';
import { DEFAULT_SETTINGS, type SystemSettings } from '@/core/settings';
import type { GuestGroup, RsvpStatus } from '@/core/vocab';
import type { RosterEntry } from '@/features/guests';
import type { EventPlan, SceEvent, Step } from '@/features/progress';
import type { Booth, BoothStatus } from '@/features/venue';
import type { BiddingPackage } from '../contract';

export const d = (s: string) => s as IsoDate;
export const vnd = (n: number) => n as Vnd;
export const SETTINGS: SystemSettings = { ...DEFAULT_SETTINGS, version: 1 as Version };
export const EVENT_ID = 'e0000000-0000-4000-8000-000000000001' as EventId;
export const AT = '2026-11-02T01:00:00.000Z' as Instant;

/** 2026 holidays that fall on working days (decision 1): 30/04 and 01/05 are Thursday and Friday, 02/09 is a Wednesday. */
export const HOLIDAYS: ReadonlyArray<Holiday> = [
  { date: d('2026-01-01'), name: 'Tết Dương lịch', kind: 'holiday' },
  { date: d('2026-04-30'), name: 'Ngày Giải phóng miền Nam', kind: 'holiday' },
  { date: d('2026-05-01'), name: 'Ngày Quốc tế Lao động', kind: 'holiday' },
  { date: d('2026-09-02'), name: 'Quốc khánh', kind: 'holiday' },
];
export const weekendsOnly = buildWorkCalendar([]);
export const withHolidays = buildWorkCalendar(HOLIDAYS);

let n = 0;
const uuid = (prefix: string) => `${prefix}0000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

export function event(over: Partial<SceEvent> = {}): SceEvent {
  return {
    id: EVENT_ID, name: 'Hội nghị Xúc tiến Đầu tư 2026', type: 'hoi_nghi', eventDate: d('2026-12-15'), eventTime: '08:30' as HHmm, location: 'Hà Nội',
    department: 'Phòng Xúc tiến đầu tư', supportingDepartments: [], leadPerson: '', budget: null, targetGuests: 150, status: 'preparing', note: '',
    deletedAt: null, version: 1 as Version, createdAt: AT, createdBy: null, updatedAt: AT, ...over,
  };
}

/** A calendar-day step due `offsetDays` before T0; done when `done`. */
export function step(offsetDays: number, done = false): Step {
  return {
    id: uuid('a') as StepId, eventId: EVENT_ID, groupId: 'b0000000-0000-4000-8000-000000000001' as GroupId, name: `Bước T-${offsetDays}`, requirement: '',
    offsetDays, dayType: 'calendar', targetPhase: 'before', completedAt: done ? AT : null, completedBy: done ? 'Cán bộ' : null, assignee: '', templateKey: '',
    subTasks: [], links: [], sort: 0, version: 1 as Version,
  };
}

export function plan(steps: ReadonlyArray<Step>, over: Partial<SceEvent> = {}): EventPlan {
  return {
    event: event(over),
    groups: [{ id: 'b0000000-0000-4000-8000-000000000001' as GroupId, eventId: EVENT_ID, phase: 'phase_prepare', name: 'Nhóm 1', leadPerson: '', note: '', sort: 0, version: 1 as Version, steps }],
  };
}

export function guest(rsvpStatus: RsvpStatus, group: GuestGroup = 'DoanhNghiep'): RosterEntry {
  return {
    id: uuid('c') as GuestId, eventId: EVENT_ID, name: 'Khách', group, title: '', organization: '', phone: '', email: null, sendMethod: 'direct',
    inviteStatus: 'sent', rsvpStatus, rsvpSource: 'manual', rsvpAt: null, substituteName: rsvpStatus === 'substituted' ? 'Người thay' : '', hasBanquet: false,
    notes: '', checkinCode: 'ABC123' as CheckinCode, masterContactId: null, version: 1 as Version, createdAt: AT, createdBy: null, updatedAt: AT,
    seatCode: null, checkedInAt: null, giftGivenAt: null,
  };
}

export const guests = (count: number, rsvp: RsvpStatus = 'pending') => Array.from({ length: count }, () => guest(rsvp));

export function booth(status: BoothStatus): Booth {
  return { id: uuid('d') as BoothId, eventId: EVENT_ID, code: `A${n}`, size: '3x3', company: status === 'available' ? '' : 'Công ty', products: '', subsidyPercent: 0, status, contact: '', staff: '', version: 1 as Version };
}

export function pkg(budget: number, winningPrice: number | null, code = `TB-2026-${String(++n).padStart(3, '0')}`): BiddingPackage {
  return {
    id: uuid('f') as BiddingPackageId, eventId: EVENT_ID, code, name: 'Gói thầu', department: 'Phòng Hành chính - Tổ chức', budget: vnd(budget),
    winningPrice: winningPrice === null ? null : vnd(winningPrice), contractor: null, status: 'Đang thực hiện hợp đồng', version: 1 as Version,
  };
}
