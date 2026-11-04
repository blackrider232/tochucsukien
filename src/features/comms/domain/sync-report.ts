/**
 * What a form sync did, counted from what actually happened to each row. dateOrderUnclear: the sheet's rows could not
 * tell day/month from month/day, so its answers wait for review.
 */
export type SyncReport =
  | { status: 'ok'; rows: number; fresh: number; applied: number; stale: number; noAnswer: number; review: number; created: number; failed: number; failures: ReadonlyArray<string>; dateOrderUnclear: boolean }
  | { status: 'error'; message: string };
