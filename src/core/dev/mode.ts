// Dev-only in-memory runtime switch and the dev identity. Pure, so the proxy
// and client components can read it. The data side is src/core/dev/runtime.ts.

import type { Email, Instant, UserId } from '@/core/brand';
import type { Actor, ProfileStatus } from '@/core/auth';
import { DEPARTMENTS, ROLES, type DepartmentCode, type DepartmentName, type Role } from '@/core/vocab';

/**
 * Both conditions, read as literal process.env accesses so Next inlines them
 * into client bundles too (next.config passes SCE_DEV_MEMORY through). A
 * production build inlines NODE_ENV as 'production', so this is false there.
 */
export function devMemoryEnabled(): boolean {
  return process.env.SCE_DEV_MEMORY === '1' && process.env.NODE_ENV !== 'production';
}

export function assertDevMemory(): void {
  if (!devMemoryEnabled()) throw new Error('The dev memory runtime needs SCE_DEV_MEMORY=1 and NODE_ENV !== production');
}

export const DEV_ROLE_COOKIE = 'sce_dev_role';

export type DevRole = Role | 'pending' | 'locked';
export const DEV_ROLES: ReadonlyArray<DevRole> = ['admin', 'leader', 'dept_leader', 'user', 'pending', 'locked'];
export const DEV_ROLE_LABELS: { readonly [R in DevRole]: string } = {
  admin: ROLES.admin.short,
  leader: ROLES.leader.short,
  dept_leader: ROLES.dept_leader.short,
  user: ROLES.user.short,
  pending: 'Chờ duyệt',
  locked: 'Bị khóa',
};

export interface DevIdentity {
  role: DevRole;
  /** Only dept_leader, user, pending and locked pick one; the rest have a fixed department. */
  department: DepartmentName | null;
}

export const DEFAULT_DEV_DEPARTMENT: DepartmentName = 'Phòng Xúc tiến đầu tư';
const FIXED_DEPARTMENT: Partial<Record<DevRole, DepartmentName | null>> = { admin: null, leader: 'Ban Giám đốc' };

export const choosesDepartment = (role: DevRole) => !(role in FIXED_DEPARTMENT);

export function devIdentity(role: DevRole, department?: DepartmentName | null): DevIdentity {
  const fixed = FIXED_DEPARTMENT[role];
  return { role, department: fixed !== undefined ? fixed : (department ?? DEFAULT_DEV_DEPARTMENT) };
}

/** Cookie value 'user' or 'user:PTDN'. Anything unreadable is admin. */
export function parseDevRole(value: string | undefined): DevIdentity {
  const [rawRole, code] = (value ?? '').split(':');
  const role = DEV_ROLES.find((r) => r === rawRole) ?? 'admin';
  const dept = DEPARTMENTS.find((d) => d.code === (code as DepartmentCode))?.name;
  return devIdentity(role, dept);
}

export function formatDevRole(identity: DevIdentity): string {
  if (!choosesDepartment(identity.role) || !identity.department) return identity.role;
  return `${identity.role}:${DEPARTMENTS.find((d) => d.name === identity.department)!.code}`;
}

/** One stable profile per identity, so created_by and audit rows survive a role switch and a reset. */
export function devActor(identity: DevIdentity): Actor {
  const roleIndex = DEV_ROLES.indexOf(identity.role) + 1;
  const deptIndex = identity.department ? DEPARTMENTS.findIndex((d) => d.name === identity.department) + 1 : 0;
  const role: Role = identity.role === 'pending' || identity.role === 'locked' ? 'user' : identity.role;
  const status: ProfileStatus = identity.role === 'pending' ? 'pending' : identity.role === 'locked' ? 'locked' : 'active';
  const requiresMfa = ROLES[role].requiresMfa;
  return {
    profile: {
      id: `d0000000-0000-4000-8000-0000000000${roleIndex}${deptIndex}` as UserId,
      email: `${formatDevRole(identity).replace(':', '.').toLowerCase()}@dev.sce.local` as Email,
      fullname: `Dev ${DEV_ROLE_LABELS[identity.role]}${choosesDepartment(identity.role) ? ` (${DEPARTMENTS[deptIndex - 1]!.code})` : ''}`,
      role,
      department: identity.department,
      status,
      createdAt: '2026-01-01T00:00:00.000Z' as Instant,
      updatedAt: '2026-01-01T00:00:00.000Z' as Instant,
    },
    aal: requiresMfa ? 'aal2' : 'aal1',
    hasVerifiedTotp: requiresMfa,
  };
}
