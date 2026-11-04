/** What a form sync did, counted from what actually happened to each row. */
export type SyncReport =
  | { status: 'ok'; rows: number; fresh: number; applied: number; stale: number; noAnswer: number; review: number; created: number; failed: number; failures: ReadonlyArray<string> }
  | { status: 'error'; message: string };
