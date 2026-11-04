// Session, profile and the per-request context. Role and status come only from
// sce_tcsk_profiles, written only by the auth trigger and by admin commands.
// No email pattern, no user_metadata role, no "demo mode" (core B1/B2/B14).

import type { Email, Instant, UserId } from './brand';
import type { WorkCalendar } from './dates';
import type { SystemSettings } from './settings';
import type { DepartmentName, Role } from './vocab';
import type { Db } from './db';

export type ProfileStatus = 'pending' | 'active' | 'locked';

export interface Profile {
  id: UserId;
  email: Email;
  fullname: string;
  role: Role;
  /** null only for accounts not yet assigned (admin-created leader without dept). */
  department: DepartmentName | null;
  status: ProfileStatus;
  createdAt: Instant;
  updatedAt: Instant;
}

export type Aal = 'aal1' | 'aal2';

/** The authenticated, active, assurance-satisfied caller. Nothing else can hold a Db. */
export interface Actor {
  readonly profile: Profile;
  readonly aal: Aal;
  readonly hasVerifiedTotp: boolean;
}

/**
 * Where an unfinished session must go. Computed by one pure function, used by
 * the proxy (UX redirect) and by requestContext() (enforcement).
 */
export type Gate =
  | { kind: 'ok' }
  | { kind: 'login' }
  | { kind: 'pending' }
  | { kind: 'locked' }
  | { kind: 'mfa_challenge' }
  | { kind: 'mfa_enroll' };

export function gateFor(input: {
  hasSession: boolean;
  profile: Profile | null;
  aal: Aal | null;
  hasVerifiedTotp: boolean;
}): Gate {
  // TODO: no session -> login; no profile or pending -> pending; locked -> locked;
  // ROLES[role].requiresMfa && !hasVerifiedTotp -> mfa_enroll;
  // hasVerifiedTotp && aal !== 'aal2' -> mfa_challenge; else ok.
  throw new Error('not implemented');
}

/**
 * Per-request, server-only. Built once per request with React cache().
 * Redirects (never returns) when gateFor() is not ok. This is the only source
 * of a Db, so a page that forgot a guard still cannot read data.
 */
export interface RequestContext {
  readonly actor: Actor;
  readonly db: Db;
  readonly settings: SystemSettings;
  readonly calendar: WorkCalendar;
  readonly now: Instant;
}
export function requestContext(): Promise<RequestContext> {
  throw new Error('not implemented');
}

/** Client mirror of the non-secret parts, provided by the (app) layout. */
export interface AppContextValue {
  profile: Profile;
  settings: SystemSettings;
  holidays: ReadonlyArray<import('./dates').Holiday>;
}
export function useAppContext(): AppContextValue {
  throw new Error('not implemented');
}
