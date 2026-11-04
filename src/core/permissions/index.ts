// RBAC. Each feature declares its permissions in its manifest; the union is
// the matrix. scripts/gen-permissions-sql.ts turns that union into the seed of
// sce_tcsk_role_permissions, and RLS calls tcsk.has_perm() against that table.
// So TypeScript and Postgres read ONE matrix; `npm run check:contract` fails if
// the generated SQL is stale.

import type { Actor } from '@/core/auth';
import { registry } from '@/core/registry';
import { ROLES, type DepartmentName, type Role } from '@/core/vocab';

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
  const def = permissionMatrix().get(perm);
  if (!def || actor.profile.status !== 'active' || !aalOk(actor)) return false;
  switch (grantOf(actor, def)) {
    case 'all':
      return true;
    case 'none':
      return false;
    case 'department': {
      const dept = actor.profile.department;
      if (dept === null) return false;
      return resource ? resource.departments.includes(dept) : true;
    }
  }
}

/** tcsk.grant_for(): the role's grant, or 'none' when the permission needs AAL2 and the session lacks it. */
export function grantOf(actor: Actor, def: PermissionDef): Grant {
  return def.requiresAal2 && actor.aal !== 'aal2' ? 'none' : def.grants[actor.profile.role];
}

/** tcsk.aal_ok(): AAL2 when TOTP is verified or the role requires it, AAL1 otherwise. */
export function aalOk(actor: Actor): boolean {
  if (actor.aal === 'aal2') return true;
  return !actor.hasVerifiedTotp && !ROLES[actor.profile.role].requiresMfa;
}

let matrix: ReadonlyMap<Permission, PermissionDef> | null = null;

/** Merged matrix from every manifest, for the users screen and the SQL generator. */
export function permissionMatrix(): ReadonlyMap<Permission, PermissionDef> {
  matrix ??= mergePermissions(registry.manifests);
  return matrix;
}

/** Manifest order, then declaration order within a manifest. A key declared twice is a contract violation. */
export function mergePermissions(
  manifests: ReadonlyArray<{ key: string; permissions: Readonly<Record<string, PermissionDef>> }>,
): ReadonlyMap<Permission, PermissionDef> {
  const merged = new Map<Permission, PermissionDef>();
  for (const m of manifests) {
    for (const [key, def] of Object.entries(m.permissions)) {
      if (merged.has(key as Permission)) throw new Error(`permission ${key} declared twice`);
      merged.set(key as Permission, def);
    }
  }
  return merged;
}
