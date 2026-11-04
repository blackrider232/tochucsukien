// Public client-safe entry: the contract's types, the one client-id rule,
// and the types the routes and the cron route pass around.

export type * from './contract';
export { resolveGoogleClientId } from './domain/client-id';
export type { SyncReport } from './domain/sync-report';
