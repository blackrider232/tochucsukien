// Public client-safe entry: the contract's types, the pure selectors other
// features must use instead of re-deriving, and the screens the routes render.

export type * from './contract';
export { deadlineOf, stepState, eventProgress, eventCountdown, isInDailyReportWindow, isPlanComplete, offsetLabel } from './domain/schedule';
export { EventsDashboard } from './components/events-dashboard';
export { NewEvent } from './components/new-event';
export { PlanView } from './components/plan-view';
export { PrintPlan, PrintSummary } from './components/print-plan';
export type { PlanScreenData, EventPerms } from './components/plan-context';
export type { KpiPopup } from './components/kpi-dialogs';
