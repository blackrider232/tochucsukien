// The report screens' data: the event's plan, roster and booths read through
// the upstream adapters, reports' own rows, and the actor's permissions on
// this event (UI hiding only; the commands and RLS check again).

import type { RequestContext } from '@/core/auth';
import { todayVN } from '@/core/dates';
import { can } from '@/core/permissions';
import type { SceEvent } from '@/features/progress';
import type { DailyReportId } from '@/core/brand';
import { dailyReportState, dashboardFigures, encodeFigures, workdaysToEvent } from '../domain/figures';
import { previewReport, signerTitle, type IssuedReport } from '../domain/report';
import type { GroupProgress, ReportsScreenData } from '../domain/screen';
import { readClippings, readDailyReport, readDailyReports, readPackages, readPressReleases } from './reads';
import { missingSources, sourcesOf } from './upstream';

export async function reportsScreen(ctx: RequestContext, event: SceEvent): Promise<ReportsScreenData> {
  const today = todayVN(ctx.now);
  const [sources, clippings, packages, pressReleases, reports] = await Promise.all([
    sourcesOf(ctx, event.id), readClippings(ctx, event.id), readPackages(ctx, event.id), readPressReleases(ctx, event.id), readDailyReports(ctx, event.id),
  ]);
  const { plan, roster, booths } = sources;
  const ready = plan.ready && plan.value !== null && roster.ready && booths.ready;
  const figures = ready
    ? dashboardFigures({ plan: plan.value!, roster: roster.value, booths: booths.value, packages, clippings: clippings.length }, ctx.calendar, ctx.settings, today)
    : null;
  const groups: GroupProgress[] = plan.ready && plan.value
    ? plan.value.groups.map((g) => {
        const done = g.steps.filter((s) => s.completedAt !== null).length;
        return { id: g.id, name: g.name, done, total: g.steps.length, percent: g.steps.length === 0 ? 0 : Math.round((100 * done) / g.steps.length) };
      })
    : [];
  const scope = { departments: [event.department, ...event.supportingDepartments] };
  return {
    event: { id: event.id, name: event.name, eventDate: event.eventDate, eventTime: event.eventTime, location: event.location, department: event.department, targetGuests: event.targetGuests },
    today,
    now: ctx.now,
    state: dailyReportState(ctx.calendar, event, today, ctx.settings),
    figures,
    missing: missingSources(sources),
    groups,
    clippings,
    packages,
    pressReleases,
    reports,
    issuedToday: reports.find((r) => r.reportDate === today) ?? null,
    signatoryTitle: signerTitle(event.department),
    can: { write: can(ctx.actor, 'reports.write', scope), issue: can(ctx.actor, 'reports.issue', scope) },
  };
}

/** The print page's report: an issued snapshot by id, or today's figures as a preview; null when the id is not this event's. */
export async function printableReport(ctx: RequestContext, event: SceEvent, reportId: DailyReportId | null): Promise<{ report: IssuedReport; preview: boolean } | { missing: ReadonlyArray<string> } | null> {
  if (reportId) {
    const report = await readDailyReport(ctx, event.id, reportId);
    return report ? { report, preview: false } : null;
  }
  const screen = await reportsScreen(ctx, event);
  if (!screen.figures) return { missing: screen.missing };
  return {
    report: previewReport({
      eventId: event.id, eventName: event.name, eventDate: event.eventDate, today: screen.today, workdaysToEvent: workdaysToEvent(ctx.calendar, event.eventDate, screen.today),
      department: event.department, figures: encodeFigures(screen.figures), now: ctx.now,
    }),
    preview: true,
  };
}
