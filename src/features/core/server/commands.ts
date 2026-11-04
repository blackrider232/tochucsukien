// Commands of feature `core` implemented by the foundation. The rest of the
// core verbs (settings, holidays, profile name, backups, audit list) are not
// implemented yet and answer "chưa sẵn sàng" through dispatch.

import { z } from 'zod';
import type { Email, UserId } from '@/core/brand';
import type { Profile } from '@/core/auth';
import { createAuthUser } from '@/core/auth/server';
import type { CommandsOf } from '@/core/commands';
import { parseEmail } from '@/core/text';
import { DEPARTMENTS, type DepartmentName, type Role } from '@/core/vocab';

const departmentNames = DEPARTMENTS.map((d) => d.name) as [DepartmentName, ...DepartmentName[]];

const createUserInput = z.object({
  email: z.string().transform((v, ctx) => parseEmail(v) ?? (ctx.addIssue({ code: 'custom', message: 'Email không hợp lệ' }), z.NEVER)),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
  fullname: z.string().trim().min(1, 'Nhập họ tên'),
  department: z.enum(departmentNames),
  role: z.enum(['admin', 'leader', 'dept_leader', 'user'] satisfies Role[]),
});

export const coreCommands: Partial<CommandsOf<'core'>> = {
  'users.create': {
    kind: 'mutation',
    input: createUserInput as z.ZodType<{ email: Email; password: string; fullname: string; department: DepartmentName; role: Role }>,
    authorize: { perm: 'core.users.manage', global: true },
    async run(ctx, input) {
      const id: UserId = await createAuthUser(input);
      if (input.role !== 'user') await ctx.db.rpc('sce_tcsk_set_profile_role', { id, role: input.role });
      await ctx.db.rpc('sce_tcsk_set_profile_department', { id, department: input.department });
      await ctx.db.rpc('sce_tcsk_set_profile_status', { ids: [id], status: 'active' });
      const profile: Profile = { id, email: input.email, fullname: input.fullname, role: input.role, department: input.department, status: 'active', createdAt: ctx.now, updatedAt: ctx.now };
      return { value: profile, audit: { action: 'TẠO TÀI KHOẢN', summary: `${input.fullname} <${input.email}>`, eventId: null, entity: 'profile', entityId: id } };
    },
  },
};
