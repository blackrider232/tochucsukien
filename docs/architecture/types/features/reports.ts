// Contract of feature `reports` (M6). Owns clippings, bidding packages, issued
// daily reports and press releases. Every figure is computed from the owners'
// read models; nothing is hard-coded (m6 BUG-02/03/05/07/08/38).

import type { BiddingPackageId, ClippingId, DailyReportId, EventId, Instant, IsoDate, PressReleaseId, SafeUrl, UserId, Vnd, Version } from '../core/brand';
import type { WorkCalendar } from '../core/dates';
import type { SystemSettings } from '../core/settings';
import type { DepartmentName } from '../core/vocab';
import type { EventPlan } from './progress';
import type { RosterEntry } from './guests';
import type { Booth } from './venue';

export type MediaType = 'Báo điện tử' | 'Truyền hình' | 'Báo in' | 'Cổng TTĐT' | 'Báo in & Điện tử';
export interface MediaClipping {
  id: ClippingId;
  eventId: EventId;
  outlet: string;
  title: string;
  publishedOn: IsoDate;
  mediaType: MediaType;
  url: SafeUrl | null;
  author: string;
  version: Version;
}

export type BiddingStatus = 'Đang thẩm định hồ sơ' | 'Đang thực hiện hợp đồng' | 'Đang nghiệm thu thanh lý' | 'Đã nghiệm thu thanh lý';
export interface BiddingPackage {
  id: BiddingPackageId;
  eventId: EventId;
  code: string;
  name: string;
  department: DepartmentName;
  budget: Vnd;
  winningPrice: Vnd | null;
  contractor: string | null;
  status: BiddingStatus;
  version: Version;
}

/** An issued report is an immutable snapshot of the figures on that date (m6 BUG-12/13). */
export interface DailyReport {
  id: DailyReportId;
  eventId: EventId;
  reportDate: IsoDate;
  workdaysToEvent: number;
  progressPercent: number;
  keyHighlight: string;
  blockers: string;
  signatory: string;
  documentNumber: string | null;
  figures: Readonly<Record<string, number>>;
  issuedAt: Instant;
  issuedBy: UserId;
}

export interface PressRelease {
  id: PressReleaseId;
  eventId: EventId;
  title: string;
  timing: 'before' | 'after';
  contact: string;
  content: string;
  version: Version;
}

export interface ReportFigures {
  progressPercent: number;
  overdueSteps: number;
  guestsInvited: number;
  guestsAttending: number;
  guestQuota: number;
  quotaReached: boolean;
  boothsConfirmed: number;
  boothsTotal: number;
  biddingBudget: Vnd;
  biddingWinning: Vnd;
  /** Signed; negative = overrun (m6 BUG-35). */
  biddingSavingsPercent: number | null;
}
export function reportFigures(
  input: { plan: EventPlan; roster: ReadonlyArray<RosterEntry>; booths: ReadonlyArray<Booth>; packages: ReadonlyArray<BiddingPackage> },
  cal: WorkCalendar,
  s: SystemSettings,
  today: IsoDate,
): ReportFigures {
  throw new Error('not implemented');
}

declare module '../core/permissions' {
  interface PermissionMap {
    'reports.read': true;
    'reports.write': true;
    'reports.issue': true;
  }
}
