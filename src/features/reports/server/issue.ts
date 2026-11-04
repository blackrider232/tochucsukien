// Issuing the daily report (m6 BUG-07/12/13, decision 17). The figures are
// computed here from the owners' read models at the moment of issue and frozen
// into the row; the person issuing writes only the narrative, the signer's
// name and the document number. One report per event and VN day: a repeat,
// a retry or a second desk racing the first all converge on the first report.

import { z } from 'zod';
import type { EventId } from '@/core/brand';
import type { CommandContext } from '@/core/commands';
import { formatVNDate, formatVNTime, todayVN } from '@/core/dates';
import { DbError } from '@/core/db';
import { dashboardFigures, encodeFigures, workdaysToEvent } from '../domain/figures';
import { signerTitle, snapshotMilestone, type IssuedReport } from '../domain/report';
import { eventIdSchema, issueFields, reportIdSchema } from '../domain/schemas';
import { asSchema, audit, issueReports, type Spec } from './command-kit';
import { toPackage, toReport } from './reads';
import { clippingsTable, dailyReportsTable, packagesTable } from './tables';
import { requireSources } from './upstream';

const ACTION = 'PHÁT HÀNH BÁO CÁO HÀNG NGÀY';

async function issuedOn(ctx: CommandContext, eventId: EventId, day: ReturnType<typeof todayVN>): Promise<IssuedReport | null> {
  const [row] = await ctx.db.table(dailyReportsTable).list({ eventId, reportDate: day });
  return row ? toReport(row) : null;
}

const repeat = (report: IssuedReport) => ({
  value: { already: true, report },
  audit: audit(
    ACTION,
    `Báo cáo ngày ${formatVNDate(report.reportDate)} đã phát hành lúc ${formatVNTime(report.issuedAt)}; không phát hành lại, số liệu giữ nguyên`,
    report.eventId, 'daily_report', report.id,
  ),
});

export const issueDailyReport: Spec<'reports.issueDailyReport'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, id: reportIdSchema, draft: issueFields })),
  authorize: issueReports,
  async run(ctx, { eventId, id, draft }) {
    const today = todayVN(ctx.now);
    const earlier = await issuedOn(ctx, eventId, today);
    if (earlier) return repeat(earlier);

    const { plan, roster, booths } = await requireSources(ctx, eventId);
    const [packages, clippings] = await Promise.all([ctx.db.table(packagesTable).list({ eventId }), ctx.db.table(clippingsTable).list({ eventId })]);
    const figures = dashboardFigures({ plan, roster, booths, packages: packages.map(toPackage), clippings: clippings.length }, ctx.calendar, ctx.settings, today);
    const event = plan.event;
    let row;
    try {
      row = await ctx.db.table(dailyReportsTable).insert({
        id, eventId, legacyId: null, reportDate: today, workdaysToEvent: workdaysToEvent(ctx.calendar, event.eventDate, today),
        progressPercent: figures.progressPercent, keyHighlight: draft.keyHighlight, blockers: draft.blockers, signatory: draft.signatory,
        signatoryTitle: signerTitle(event.department), documentNumber: draft.documentNumber, figures: encodeFigures(figures),
        eventName: event.name, eventDate: event.eventDate, issuedAt: ctx.now, issuedBy: ctx.actor.profile.id,
      });
    } catch (e) {
      // Another desk issued today's report between our read and this insert: theirs stands.
      const raced = e instanceof DbError && e.kind === 'constraint' ? await issuedOn(ctx, eventId, today) : null;
      if (raced) return repeat(raced);
      throw e;
    }
    const report = toReport(row);
    return {
      value: { already: false, report },
      audit: audit(
        ACTION,
        `Phát hành báo cáo ngày ${formatVNDate(today)} (${snapshotMilestone(report)}): tiến độ ${figures.progressPercent}%, ${figures.overdueSteps} bước quá hạn, ` +
          `${figures.guestsInvited}/${figures.guestQuota} thư mời, ${figures.guestsAttending} đại biểu tham dự; người ký ${report.signatoryTitle} ${report.signatory}`,
        eventId, 'daily_report', id,
      ),
    };
  },
};
