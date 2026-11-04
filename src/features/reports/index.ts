// Public client-safe entry: the contract's types and the pure selectors other
// features use instead of re-deriving report figures.

export type * from './contract';
export { reportFigures, biddingTotals, savingsPercent, dailyReportState, milestoneLabel, formatPercent2, type DailyReportState, type DashboardFigures } from './domain/figures';
