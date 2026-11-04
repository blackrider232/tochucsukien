export type DbErrorKind =
  /** expectedVersion did not match: someone else saved first. */
  | 'conflict'
  /** Row absent or hidden by RLS. Never distinguish the two to the client. */
  | 'not_found'
  | 'forbidden'
  /** Unique or check constraint, carries the constraint name for a Vietnamese message. */
  | 'constraint'
  | 'unavailable';
export class DbError extends Error {
  constructor(
    readonly kind: DbErrorKind,
    readonly detail?: { table?: string; constraint?: string },
  ) {
    super(kind);
  }
}
