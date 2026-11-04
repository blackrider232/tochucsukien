// Public client-safe entry: the contract's types, the pure selectors other
// features use instead of re-deriving report figures, and the screens the
// routes render.

export type * from './contract';
export { reportFigures, biddingTotals, savingsPercent, dailyReportState, milestoneLabel, formatPercent2, type DailyReportState, type DashboardFigures } from './domain/figures';
export { ReportsScreen, type ReportsTab } from './components/reports-screen';
export { PrintDailyReport } from './components/print-daily-report';
