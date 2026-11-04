// Test fixtures shared by core tests. Not imported by app code.

import type { Email, Instant, UserId } from '@/core/brand';
import type { Aal, Actor, Profile, ProfileStatus } from '@/core/auth';
import type { DepartmentName, Role } from '@/core/vocab';

export const XTDT: DepartmentName = 'Phòng Xúc tiến đầu tư';
export const PTDN: DepartmentName = 'Phòng Phát triển doanh nghiệp';

let n = 0;
export function testActor(
  role: Role,
  department: DepartmentName | null,
  opts: { aal?: Aal; status?: ProfileStatus; hasVerifiedTotp?: boolean; id?: string } = {},
): Actor {
  n += 1;
  const profile: Profile = {
    id: (opts.id ?? `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`) as UserId,
    email: `user${n}@sce.vn` as Email,
    fullname: `Cán bộ ${n}`,
    role,
    department,
    status: opts.status ?? 'active',
    createdAt: '2026-01-01T00:00:00.000Z' as Instant,
    updatedAt: '2026-01-01T00:00:00.000Z' as Instant,
  };
  const requiresMfa = role === 'admin' || role === 'leader';
  return { profile, aal: opts.aal ?? (requiresMfa ? 'aal2' : 'aal1'), hasVerifiedTotp: opts.hasVerifiedTotp ?? requiresMfa };
}
