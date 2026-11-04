// Applies one mutation at a time to the reports sources, runs the reports
// tests, and restores the file. Usage: node src/features/reports/__tests__/mutation-pass.mjs .
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
const F = 'src/features/reports/domain/figures.ts';
const K = 'src/features/reports/server/command-kit.ts';
const I = 'src/features/reports/server/issue.ts';
const S = 'src/features/reports/server/screen-data.ts';
const C = 'src/features/reports/server/commands.ts';
const M = 'src/features/reports/manifest.ts';
const R = 'src/features/reports/domain/report.ts';
const RD = 'src/features/reports/server/reads.ts';
const SCR = 'src/features/reports/components/reports-screen.tsx';
const DT = 'src/features/reports/components/daily-tab.tsx';
const BID = 'src/features/reports/components/bidding-tab.tsx';
const PR = 'src/features/reports/components/print-daily-report.tsx';
const SQL_DERIVED = 'supabase/migrations/202611041410_reports_issue_derived.sql';
const SQL_LEAD = 'supabase/migrations/202611041420_reports_issue_lead_department.sql';
const SQL_CODE = 'supabase/migrations/202611041430_reports_package_code_folded.sql';
const SQL_VNDAY = 'supabase/migrations/202611041450_reports_vn_day.sql';
const SQL_FOLD = 'supabase/migrations/202611041460_reports_package_code_fold_spaces.sql';
const AG = 'src/features/reports/domain/agency-name.ts';
const WORD = 'src/features/reports/domain/word.ts';

const mutations = [
  ['savings sign flipped', F, '((budget - winning) / budget)', '((winning - budget) / budget)'],
  ['savings floor instead of round', F, 'Math.round(((budget - winning) / budget) * 10_000)', 'Math.floor(((budget - winning) / budget) * 10_000)'],
  ['savings zero budget allowed', F, 'if (budget <= 0) return null;', 'if (budget < 0) return null;'],
  ['savings counts unawarded packages', F, 'packages.filter((p) => p.winningPrice !== null)', 'packages.filter(() => true)'],
  ['savings clamped at zero (legacy BUG-35)', F, 'savings: (awardedBudget - winning) as Vnd,', 'savings: Math.max(0, awardedBudget - winning) as Vnd,'],
  ['quota against attending, not invitations', F, 'quotaProgress(guests.total,', 'quotaProgress(guests.attending,'],
  ['attending = every guest', F, 'guestsAttending: guests.attending,', 'guestsAttending: guests.total,'],
  ['overdue = due soon', F, 'overdueSteps: progress.overdue,', 'overdueSteps: progress.dueSoon,'],
  ['event day off by one', F, "if (calendarDays === 0) return { kind: 'event_day' };", "if (calendarDays === 1) return { kind: 'event_day' };"],
  ['window off by one', F, "kind: workdays <= s.dailyReportThresholdDays ? 'active' : 'not_yet'", "kind: workdays < s.dailyReportThresholdDays ? 'active' : 'not_yet'"],
  ['T-n counted over (today, T0] (M4)', F, 'workdaysBetween(cal, addCalendarDays(today, -1), addCalendarDays(eventDate, -1))', 'workdaysBetween(cal, today, eventDate)'],
  ['milestone in calendar days', F, 'return `T-${state.workdays}`;', 'return `T-${state.calendarDays}`;'],
  ['quotaReached encoded inverted', F, 'out.quotaReached = f.quotaReached ? 1 : 0;', 'out.quotaReached = f.quotaReached ? 0 : 1;'],
  ['issue needs only reports.write', K, "perm: 'reports.issue'", "perm: 'reports.write'"],
  ['edits need only reports.read', K, "perm: 'reports.write'", "perm: 'reports.read'"],
  ['issue not idempotent', I, 'if (earlier) return repeat(earlier);', ''],
  ['race not recovered', I, "e.kind === 'constraint'", "e.kind === 'conflict'"],
  ['retry by id not recognised (L7)', I, 'if (same?.eventId === eventId) return toReport(same);', ''],
  ['audit dated from ctx.now, not the stored day (L6)', I, '`Phát hành báo cáo ngày ${formatVNDate(report.reportDate)}', '`Phát hành báo cáo ngày ${formatVNDate(today)}'],
  ['report date in UTC', I, 'const today = todayVN(ctx.now);', 'const today = ctx.now.slice(0, 10) as ReturnType<typeof todayVN>;'],
  ['issuer from nothing', I, 'issuedBy: ctx.actor.profile.id,', 'issuedBy: null as never,'],
  ['UI shows issue to writers', S, "issue: can(ctx.actor, 'reports.issue', issueScope(event))", "issue: can(ctx.actor, 'reports.write', issueScope(event))"],
  ['UI offers issue to supporting departments (M2)', S, "issue: can(ctx.actor, 'reports.issue', issueScope(event))", "issue: can(ctx.actor, 'reports.issue', scope)"],
  ['command lets supporting departments issue (M2)', K, 'issueScope(await readEvent(ctx, i.eventId))', '({ departments: [...((e) => (e ? [e.department, ...e.supportingDepartments] : []))(await readEvent(ctx, i.eventId))] })'],
  ['code uniqueness case-sensitive', C, '=== key);', '=== code.trim());'],
  ['chuyên viên may issue', M, "'reports.issue': { label: 'Ban hành báo cáo hàng ngày', scope: 'event', grants: { admin: 'all', leader: 'all', dept_leader: 'department', user: 'none' } }", "'reports.issue': { label: 'Ban hành báo cáo hàng ngày', scope: 'event', grants: { admin: 'all', leader: 'all', dept_leader: 'department', user: 'department' } }"],
  ['quota missed worded as reached', R, 'const outcome = f.quotaReached', 'const outcome = true'],
  ['next-day race recovery dropped (L6)', I, '[addCalendarDays(today, 1), today, addCalendarDays(today, -1)]', '[today, addCalendarDays(today, -1)]'],
  ['readDailyReport ignores the event (L12)', RD, 'return row && row.eventId === eventId ? toReport(row) : null;', 'return row ? toReport(row) : null;'],
  ['snapshot milestone from the stored working days only', R, "'workdaysToEvent'>): string {\n  const days = r.eventDate ? calendarDaysBetween(r.reportDate, r.eventDate) : r.workdaysToEvent;", "'workdaysToEvent'>): string {\n  const days = r.workdaysToEvent;"],
  ['past starts a day late', F, "if (calendarDays < 0) return { kind: 'past'", "if (calendarDays < -1) return { kind: 'past'"],
  ['updatePackage skips the code check', C, 'NO_PACKAGE);\n    await assertCodeFree(ctx, eventId, id, draft.code);', 'NO_PACKAGE);'],
  ['issued print takes the live event name', S, 'return report ? { report, preview: false } : null;', 'return report ? { report: { ...report, eventName: event.name }, preview: false } : null;'],
  ['issued Word export takes the live event name', DT, 'onClick={() => toWord(issuedToday)}', 'onClick={() => toWord({ ...issuedToday, eventName: data.event.name })}'],
  ['bidding caption on the full dự toán (M3)', SCR, 'trên dự toán ${formatVnd(f.biddingAwardedBudget', 'trên dự toán ${formatVnd(f.biddingBudget'],
  ['Chưa đến hạn counts the overdue steps (BUG-06)', SCR, '${f.stepsTotal - f.stepsDone - f.overdueSteps}', '${f.stepsTotal - f.stepsDone}'],
  ['quota percent as quota ÷ target (L9)', R, "f.guestQuotaPercent > 0 ? `, tức ${f.guestQuotaPercent}%` : ''", "f.guestTarget > 0 ? `, tức ${Math.round((f.guestQuota / f.guestTarget) * 100)}%` : ''"],
  ['target 0 worded as a reached quota (L9)', R, 'if (f.guestTarget <= 0) return', 'if (f.guestTarget < 0) return'],
  ['Kính gửi in letterhead capitals (L9)', R, '`${agencyName(org.parentAgency)};`', '`${org.parentAgency};`'],
  ['an unlisted agency name cased by a guess', AG, 'return KNOWN_AGENCIES[name.replace(/UỶ/g, \'ỦY\')] ?? name;', 'return KNOWN_AGENCIES[name.replace(/UỶ/g, \'ỦY\')] ?? name.charAt(0) + name.slice(1).toLowerCase();'],
  ['export footer with the raw signed rate (L10)', BID, 'footer: { lines: [biddingTotalsSentence(totals)] },', 'footer: { lines: [`tiết kiệm ${formatPercent2(totals.savingsPercent)}`] },'],
  ['export cell a raw number (L10)', BID, 'value: (p) => exportedSaving(p) }', 'value: (p) => (p.winningPrice === null ? null : savingsPercent(p.budget, p.winningPrice)) }'],
  ['print body at 13 pt (L8)', PR, 'font-size: ${ND30_PT.body}pt;', 'font-size: 13pt;'],
  ['trigger keeps the forged event name (H1)', SQL_VNDAY, '  new.event_name := ev.name;\n', ''],
  ['trigger keeps the forged T-n (H1)', SQL_VNDAY, '  new.workdays_to_event := tcsk.reports_workdays_to_event(ev.event_date, today);\n', ''],
  ['SQL T-n over (today, T0] (H1, M4)', SQL_DERIVED, 'generate_series(least(today, event_date), greatest(today, event_date) - 1,', 'generate_series(least(today, event_date) + 1, greatest(today, event_date),'],
  ['insert policy back to lead + supporting (M2)', SQL_LEAD, 'with check (tcsk.reports_can_issue(event_id))', "with check (tcsk.has_event_perm('reports.issue', event_id))"],
  ['trigger takes the UTC day', SQL_VNDAY, 'today date := tcsk.reports_vn_day(now());', "today date := (now() at time zone 'UTC')::date;"],
  ['trigger ignores sce.restoring (restore round trip)', SQL_VNDAY, " or coalesce(current_setting('sce.restoring', true), '') = 'on'", ''],
  ['insert rule allows a soft-deleted event', SQL_LEAD, '       and e.deleted_at is null\n', ''],
  ['race path without the conflict kind', I, "(e.kind === 'constraint' || e.kind === 'conflict')", "(e.kind === 'constraint')"],
  ['a report id of another event returned as this one', I, 'if (same?.eventId === eventId) return toReport(same);', 'if (same) return toReport(same);'],
  ['race lookup without yesterday (app clock ahead)', I, 'addCalendarDays(today, 1), today, addCalendarDays(today, -1)]', 'addCalendarDays(today, 1), today]'],
  ['a tiny overrun rounds to -0', F, 'if (rate !== 0 || budget === winning) return rate;', 'return rate;'],
  ['print header keeps the kit size', PR, '.nd30-report header { font-size: ${ND30_PT.header}pt; }', ''],
  ['print signature keeps the kit size', PR, '.nd30-report footer { font-size: ${ND30_PT.signer}pt; }', ''],
  ['Word letterhead at 12 pt', WORD, 'vertical-align:top;font-size:${ND30_PT.header}pt;">\n<p style="${P}">${org.parentAgency}', 'vertical-align:top;font-size:12pt;">\n<p style="${P}">${org.parentAgency}'],
  ['code fold keeps a non-breaking space', SQL_FOLD, ' \\u00a0\\u1680', ' \\u1680'],
  ['code index on lower(code) only (L11)', SQL_CODE, '(event_id, tcsk.reports_code_key(code));', '(event_id, lower(code));'],
];

const results = [];
for (const [name, file, from, to] of mutations) {
  const path = join(root, file);
  const original = readFileSync(path, 'utf8');
  if (!original.includes(from)) {
    results.push({ name, result: 'NOT APPLIED (pattern missing)' });
    continue;
  }
  writeFileSync(path, original.replace(from, to));
  let result;
  try {
    execSync('pnpm vitest run src/features/reports', { cwd: root, stdio: 'pipe', timeout: 300_000 });
    result = 'SURVIVED';
  } catch (e) {
    const out = String(e.stdout ?? '');
    const failed = /Tests\s+(\d+) failed/.exec(out)?.[1] ?? '?';
    result = `killed (${failed} failing)`;
  } finally {
    writeFileSync(path, original);
  }
  results.push({ name, result });
  console.log(`${name}: ${result}`);
}
console.log(`${results.filter((r) => r.result.startsWith("killed")).length}/${results.length} killed`);
