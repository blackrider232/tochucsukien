// What the report screens get from the server: one shape for every sub-tab,
// built per request in server/screen-data.ts.

import type { EventId, HHmm, Instant, IsoDate } from '@/core/brand';
import type { DepartmentName } from '@/core/vocab';
import type { BiddingPackage, MediaClipping, PressRelease } from '../contract';
import type { DailyReportState, DashboardFigures } from './figures';
import type { IssuedReport } from './report';

export interface GroupProgress {
  id: string;
  name: string;
  done: number;
  total: number;
  percent: number;
}

export interface ReportsScreenData {
  event: { id: EventId; name: string; eventDate: IsoDate; eventTime: HHmm; location: string; department: DepartmentName; targetGuests: number };
  today: IsoDate;
  now: Instant;
  state: DailyReportState;
  /** null while a summarised module is not ready; `missing` names it. */
  figures: DashboardFigures | null;
  missing: ReadonlyArray<string>;
  groups: ReadonlyArray<GroupProgress>;
  clippings: ReadonlyArray<MediaClipping>;
  packages: ReadonlyArray<BiddingPackage>;
  pressReleases: ReadonlyArray<PressRelease>;
  /** Newest first. */
  reports: ReadonlyArray<IssuedReport>;
  issuedToday: IssuedReport | null;
  signatoryTitle: string;
  can: { write: boolean; issue: boolean };
}
