// Every number a report shows, computed from the owners' read models and
// nothing else (m6 BUG-02/03/05/07/08/14/35/38/40). Progress, the invite quota
// and booth counts come from the progress, guests and venue selectors, so a
// report cannot disagree with the screen that owns the number.

import type { IsoDate, Vnd } from '@/core/brand';
import { addCalendarDays, calendarDaysBetween, workdaysBetween, type WorkCalendar } from '@/core/dates';
import type { SystemSettings } from '@/core/settings';
import { guestKpis, quotaProgress, type RosterEntry } from '@/features/guests';
import { eventProgress, type EventPlan, type SceEvent } from '@/features/progress';
import { boothKpis, type Booth } from '@/features/venue';
import type * as C from '../contract';
import type { BiddingPackage, ReportFigures } from '../contract';

export interface FigureInput {
  plan: EventPlan;
  roster: ReadonlyArray<RosterEntry>;
  booths: ReadonlyArray<Booth>;
  packages: ReadonlyArray<BiddingPackage>;
}

/** The contract's figures plus the counts the screens and the printed report spell out. */
export interface DashboardFigures extends ReportFigures {
  stepsTotal: number;
  stepsDone: number;
  dueSoonSteps: number;
  guestTarget: number;
  guestsDeclined: number;
  boothsReviewing: number;
  packages: number;
  packagesAwarded: number;
  /** Dự toán of the awarded packages: the base of the savings rate. */
  biddingAwardedBudget: Vnd;
  clippings: number;
}

export interface BiddingTotals {
  packages: number;
  awarded: number;
  budget: Vnd;
  awardedBudget: Vnd;
  winning: Vnd;
  /** Signed: negative is an overrun (BUG-35). */
  savings: Vnd;
  savingsPercent: number | null;
}

/** Signed (budget - winning) / budget, two decimals; null when there is no budget to compare with. */
export function savingsPercent(budget: number, winning: number): number | null {
  if (budget <= 0) return null;
  return Math.round(((budget - winning) / budget) * 10_000) / 100;
}

/**
 * The dự toán counts every package. Savings compare only packages that have a
 * winning price, so a package still in tender neither inflates the rate to 100%
 * nor hides an overrun elsewhere.
 */
export function biddingTotals(packages: ReadonlyArray<BiddingPackage>): BiddingTotals {
  const awarded = packages.filter((p) => p.winningPrice !== null);
  const sum = (xs: ReadonlyArray<number>) => xs.reduce((a, b) => a + b, 0) as Vnd;
  const awardedBudget = sum(awarded.map((p) => p.budget));
  const winning = sum(awarded.map((p) => p.winningPrice ?? 0));
  return {
    packages: packages.length,
    awarded: awarded.length,
    budget: sum(packages.map((p) => p.budget)),
    awardedBudget,
    winning,
    savings: (awardedBudget - winning) as Vnd,
    savingsPercent: awarded.length === 0 ? null : savingsPercent(awardedBudget, winning),
  };
}

function detailedFigures({ plan, roster, booths, packages }: FigureInput, cal: WorkCalendar, s: SystemSettings, today: IsoDate): Omit<DashboardFigures, 'clippings'> {
  const progress = eventProgress(cal, plan, today);
  const guests = guestKpis(roster, plan.event.targetGuests);
  const quota = quotaProgress(guests.total, plan.event.targetGuests, s);
  const boothCounts = boothKpis(booths);
  const bidding = biddingTotals(packages);
  return {
    progressPercent: progress.percent,
    overdueSteps: progress.overdue,
    guestsInvited: guests.total,
    guestsAttending: guests.attending,
    guestQuota: quota.quota,
    quotaReached: quota.reached,
    boothsConfirmed: boothCounts.confirmed,
    boothsTotal: boothCounts.total,
    biddingBudget: bidding.budget,
    biddingWinning: bidding.winning,
    biddingSavingsPercent: bidding.savingsPercent,
    stepsTotal: progress.total,
    stepsDone: progress.done,
    dueSoonSteps: progress.dueSoon,
    guestTarget: plan.event.targetGuests,
    guestsDeclined: guests.declined,
    boothsReviewing: boothCounts.reviewing,
    packages: bidding.packages,
    packagesAwarded: bidding.awarded,
    biddingAwardedBudget: bidding.awardedBudget,
  };
}

export const reportFigures: typeof C.reportFigures = (input, cal, s, today) => {
  const f = detailedFigures(input, cal, s, today);
  return {
    progressPercent: f.progressPercent, overdueSteps: f.overdueSteps, guestsInvited: f.guestsInvited, guestsAttending: f.guestsAttending, guestQuota: f.guestQuota,
    quotaReached: f.quotaReached, boothsConfirmed: f.boothsConfirmed, boothsTotal: f.boothsTotal, biddingBudget: f.biddingBudget, biddingWinning: f.biddingWinning,
    biddingSavingsPercent: f.biddingSavingsPercent,
  };
};

export function dashboardFigures(input: FigureInput & { clippings: number }, cal: WorkCalendar, s: SystemSettings, today: IsoDate): DashboardFigures {
  return { ...detailedFigures(input, cal, s, today), clippings: input.clippings };
}

/** Two decimals with the Vietnamese comma, sign kept: the one savings formatter (BUG-35). */
export function formatPercent2(value: number | null): string {
  if (value === null) return 'Chưa có';
  const [int, frac] = Math.abs(value).toFixed(2).split('.');
  return `${value < 0 ? '-' : ''}${int},${frac}%`;
}

/**
 * Where the event stands against the daily-report rule (m6 §3.2): active from
 * the settings' threshold of working days before T0 until the eve, counted as
 * the milestone counts them, so the state and its T-n label cannot disagree.
 */
export type DailyReportState =
  | { kind: 'not_yet'; workdays: number; calendarDays: number }
  | { kind: 'active'; workdays: number; calendarDays: number }
  | { kind: 'event_day' }
  | { kind: 'past'; calendarDays: number };

export function dailyReportState(cal: WorkCalendar, event: SceEvent, today: IsoDate, s: SystemSettings): DailyReportState {
  const calendarDays = calendarDaysBetween(today, event.eventDate);
  if (calendarDays === 0) return { kind: 'event_day' };
  if (calendarDays < 0) return { kind: 'past', calendarDays: -calendarDays };
  const workdays = workdaysToEvent(cal, event.eventDate, today);
  return { kind: workdays <= s.dailyReportThresholdDays ? 'active' : 'not_yet', workdays, calendarDays };
}

/** 'T-3' (working days), 'T0', 'T+2' (calendar days after). */
export function milestoneLabel(state: DailyReportState): string {
  switch (state.kind) {
    case 'event_day':
      return 'T0';
    case 'past':
      return `T+${state.calendarDays}`;
    default:
      return `T-${state.workdays}`;
  }
}

/**
 * Signed working days in [today, T0): the n of "T-n". On a working day it is
 * the n for which progress puts a T-n deadline on today (addWorkdays(T0, -n)),
 * whatever day T0 falls on; a weekend or holiday reads as the next working day.
 * The issue trigger (tcsk.reports_workdays_to_event) counts the same way.
 */
export function workdaysToEvent(cal: WorkCalendar, eventDate: IsoDate, today: IsoDate): number {
  return workdaysBetween(cal, addCalendarDays(today, -1), addCalendarDays(eventDate, -1));
}

// An issued report stores its figures as a flat jsonb of numbers: booleans as 0/1, a missing rate as an absent key.
const NUMBER_KEYS = [
  'progressPercent', 'overdueSteps', 'guestsInvited', 'guestsAttending', 'guestQuota', 'boothsConfirmed', 'boothsTotal', 'biddingBudget', 'biddingWinning',
  'stepsTotal', 'stepsDone', 'dueSoonSteps', 'guestTarget', 'guestsDeclined', 'boothsReviewing', 'packages', 'packagesAwarded', 'biddingAwardedBudget', 'clippings',
] as const satisfies ReadonlyArray<keyof DashboardFigures>;

export function encodeFigures(f: DashboardFigures): Readonly<Record<string, number>> {
  const out: Record<string, number> = Object.fromEntries(NUMBER_KEYS.map((k) => [k, f[k]]));
  out.quotaReached = f.quotaReached ? 1 : 0;
  if (f.biddingSavingsPercent !== null) out.biddingSavingsPercent = f.biddingSavingsPercent;
  return out;
}

export function decodeFigures(stored: Readonly<Record<string, number>>): DashboardFigures {
  const num = (k: string) => (typeof stored[k] === 'number' && Number.isFinite(stored[k]) ? stored[k] : 0);
  const base = Object.fromEntries(NUMBER_KEYS.map((k) => [k, num(k)])) as Record<(typeof NUMBER_KEYS)[number], number>;
  return {
    ...base,
    biddingBudget: base.biddingBudget as Vnd,
    biddingWinning: base.biddingWinning as Vnd,
    biddingAwardedBudget: base.biddingAwardedBudget as Vnd,
    quotaReached: num('quotaReached') === 1,
    biddingSavingsPercent: typeof stored.biddingSavingsPercent === 'number' ? stored.biddingSavingsPercent : null,
  };
}
