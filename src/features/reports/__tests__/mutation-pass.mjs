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
  ['window by own off-by-one rule', F, "kind: isInDailyReportWindow(cal, event, today, s) ? 'active' : 'not_yet'", "kind: workdays < s.dailyReportThresholdDays ? 'active' : 'not_yet'"],
  ['milestone in calendar days', F, 'return `T-${state.workdays}`;', 'return `T-${state.calendarDays}`;'],
  ['quotaReached encoded inverted', F, 'out.quotaReached = f.quotaReached ? 1 : 0;', 'out.quotaReached = f.quotaReached ? 0 : 1;'],
  ['issue needs only reports.write', K, "perm: 'reports.issue'", "perm: 'reports.write'"],
  ['edits need only reports.read', K, "perm: 'reports.write'", "perm: 'reports.read'"],
  ['issue not idempotent', I, 'if (earlier) return repeat(earlier);', ''],
  ['race not recovered', I, "e.kind === 'constraint'", "e.kind === 'conflict'"],
  ['report date in UTC', I, 'const today = todayVN(ctx.now);', 'const today = ctx.now.slice(0, 10) as ReturnType<typeof todayVN>;'],
  ['issuer from nothing', I, 'issuedBy: ctx.actor.profile.id,', 'issuedBy: null as never,'],
  ['UI shows issue to writers', S, "issue: can(ctx.actor, 'reports.issue', scope)", "issue: can(ctx.actor, 'reports.write', scope)"],
  ['code uniqueness case-sensitive', C, '=== key);', '=== code.trim());'],
  ['chuyên viên may issue', M, "'reports.issue': { label: 'Ban hành báo cáo hàng ngày', scope: 'event', grants: { admin: 'all', leader: 'all', dept_leader: 'department', user: 'none' } }", "'reports.issue': { label: 'Ban hành báo cáo hàng ngày', scope: 'event', grants: { admin: 'all', leader: 'all', dept_leader: 'department', user: 'department' } }"],
  ['quota missed worded as reached', R, 'const outcome = f.quotaReached', 'const outcome = true'],
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
