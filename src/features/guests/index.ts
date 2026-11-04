// Public client-safe entry: the contract's types, the pure selectors other
// features must use instead of re-deriving, and the screens the routes render.

export type * from './contract';
export { guestKpis, guestIdentityKey, isNamecardGuest, isBanquetGuest, printSets, quotaProgress, filterGuests, type QuotaProgress, type GuestFilter } from './domain/roster';
/** Decision 2: the one invite quota, ceil(targetGuests * guestQuotaPercent / 100). */
export { guestQuota } from '@/core/settings';
export { GuestsPage } from './components/guests-page';
export { PrintStudio } from './components/print-studio';
export { PrintSheets } from './components/print-sheets';
export { themeOf, onlyGuest, type PrintKind } from './domain/print';
export { KPI_POPUPS, type GuestScreenData, type KpiPopup } from './domain/screen';
