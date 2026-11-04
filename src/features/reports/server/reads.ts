// Server reads. RLS decides what the actor sees; these only shape the rows.

import type { RequestContext } from '@/core/auth';
import type { DailyReportId, EventId } from '@/core/brand';
import type { BiddingPackage, MediaClipping, PressRelease } from '../contract';
import type { IssuedReport } from '../domain/report';
import { clippingsTable, dailyReportsTable, packagesTable, pressReleasesTable, type ClippingRow, type DailyReportRow, type PackageRow, type PressReleaseRow } from './tables';

export const toClipping = ({ id, eventId, outlet, title, publishedOn, mediaType, url, author, version }: ClippingRow): MediaClipping =>
  ({ id, eventId, outlet, title, publishedOn, mediaType, url, author, version });
export const toPackage = ({ id, eventId, code, name, department, budget, winningPrice, contractor, status, version }: PackageRow): BiddingPackage =>
  ({ id, eventId, code, name, department, budget, winningPrice, contractor, status, version });
export const toPressRelease = ({ id, eventId, title, timing, contact, content, version }: PressReleaseRow): PressRelease => ({ id, eventId, title, timing, contact, content, version });
export const toReport = (r: DailyReportRow): IssuedReport => ({
  id: r.id, eventId: r.eventId, reportDate: r.reportDate, workdaysToEvent: r.workdaysToEvent, progressPercent: r.progressPercent, keyHighlight: r.keyHighlight,
  blockers: r.blockers, signatory: r.signatory, signatoryTitle: r.signatoryTitle, documentNumber: r.documentNumber, figures: r.figures, eventName: r.eventName,
  eventDate: r.eventDate, issuedAt: r.issuedAt, issuedBy: r.issuedBy,
});

export async function readClippings(ctx: RequestContext, eventId: EventId): Promise<ReadonlyArray<MediaClipping>> {
  return (await ctx.db.table(clippingsTable).list({ eventId })).map(toClipping);
}
export async function readPackages(ctx: RequestContext, eventId: EventId): Promise<ReadonlyArray<BiddingPackage>> {
  return (await ctx.db.table(packagesTable).list({ eventId })).map(toPackage);
}
export async function readPressReleases(ctx: RequestContext, eventId: EventId): Promise<ReadonlyArray<PressRelease>> {
  return (await ctx.db.table(pressReleasesTable).list({ eventId })).map(toPressRelease);
}
/** Newest first. */
export async function readDailyReports(ctx: RequestContext, eventId: EventId): Promise<ReadonlyArray<IssuedReport>> {
  return (await ctx.db.table(dailyReportsTable).list({ eventId })).map(toReport);
}
/** null when absent, of another event, or not visible to the actor. */
export async function readDailyReport(ctx: RequestContext, eventId: EventId, id: DailyReportId): Promise<IssuedReport | null> {
  const row = await ctx.db.table(dailyReportsTable).get(id);
  return row && row.eventId === eventId ? toReport(row) : null;
}
