// RBAC. Each feature declares its permissions in its manifest; the union is
// the matrix. scripts/gen-permissions-sql.ts turns that union into the seed of
// sce_tcsk_role_permissions, and RLS calls tcsk.has_perm() against that table.
// So TypeScript and Postgres read ONE matrix; `npm run check:contract` fails if
// the generated SQL is stale.

import type { Actor } from '@/core/auth';
import type { DepartmentName, Role } from '@/core/vocab';

/**
 * all        = every resource
 * department = resources whose departments include the actor's department
 *              (an event: lead department or a supporting department;
 *               a profile: its department)
 * none       = denied
 */
export type Grant = 'all' | 'department' | 'none';

export interface PermissionDef {
  label: string;
  /** 'event' permissions are checked against an event; 'global' against nothing or a profile. */
  scope: 'event' | 'global';
  grants: { readonly [R in Role]: Grant };
  /** Require AAL2 even for roles where TOTP is optional (e.g. backups.restore). */
  requiresAal2?: true;
}

/**
 * Augmented by each feature manifest file:
 *   declare module '@/core/permissions' { interface PermissionMap { 'guests.read': true } }
 * Keys must start with the declaring feature's key (checked by check:contract).
 */
export interface PermissionMap {}
export type Permission = keyof PermissionMap;

export interface ScopedResource {
  departments: ReadonlyArray<DepartmentName>;
}

/** Pure. Mirrors tcsk.has_perm(); the server checks it again and RLS checks it a third time. */
export function can(actor: Actor, perm: Permission, resource?: ScopedResource): boolean {
  throw new Error('not implemented');
}

/** Merged matrix from every manifest, for the users screen and the SQL generator. */
export function permissionMatrix(): ReadonlyMap<Permission, PermissionDef> {
  throw new Error('not implemented');
}
