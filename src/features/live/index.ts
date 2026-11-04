// Public client-safe entry: the contract's types and pure functions, the
// selectors other features may read (KPIs, the 2-hour rule), and the screens
// the routes render.

export type * from './contract';
export { matchScan } from './contract';
export { dutyRequiredAt, dutyStatus, DUTY_DESKS, type DutyState } from './domain/duty';
export { liveKpis, type LiveKpis } from './domain/desk';
export { incidentCode, INCIDENT_STATUS, URGENCY } from './domain/incidents';
export type { LiveScreenData, LiveTab } from './domain/screen';
export { LiveScreen } from './components/live-screen';
export { CarPassPrint } from './components/car-pass-print';
