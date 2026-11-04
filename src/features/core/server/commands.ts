// Every write of feature `core`. Each goes through one SQL function that
// re-checks the permission and writes the one audit row of the change, with
// names and labels (0003, 202611041000 and 202611041100_core_audit_in_functions.sql),
// so a mutation returns audit: 'sql' and the pipeline adds nothing.

import type { Profile } from '@/core/auth';
import { createAuthUser } from '@/core/auth/server';
import type { BackupId, Email, UserId } from '@/core/brand';
import { CommandError, defineCommands, type CommandContext, type Inverse } from '@/core/commands';
import { fileDateStamp, type Holiday } from '@/core/dates';
import type { Schema } from '@/core/db';
import type { SettingsPatch, SystemSettings } from '@/core/settings';
import { ROLES, type DepartmentName, type Role } from '@/core/vocab';
import { auditListSchema, backupNoteSchema, backupRefSchema, createUserSchema, holidaysReplaceSchema, holidaysSaveSchema, profileNameSchema, setDepartmentSchema, setRoleSchema, setStatusSchema, settingsUpdateSchema } from '../domain/schemas';
import { SETTINGS_FIELDS, type SettingsField } from '../domain/labels';
import { listProfiles, readBackup, readProfile, toAuditRow } from './reads';

const CONFLICT = 'Dữ liệu đã được người khác cập nhật. Đang tải lại…';
const NO_ACCOUNT = 'Không tìm thấy tài khoản, hoặc bạn không có quyền xem.';
const NO_BACKUP = 'Không tìm thấy bản sao lưu.';

function changedFields(before: SystemSettings, after: SettingsPatch): SettingsField[] {
  return (Object.keys(SETTINGS_FIELDS) as SettingsField[]).filter((k) => after[k] !== undefined && after[k] !== before[k]);
}

async function saveYear(ctx: CommandContext, year: number, expected: ReadonlyArray<Holiday>, holidays: ReadonlyArray<Holiday>, stale: string) {
  const previous = await ctx.db.rpc('sce_tcsk_replace_holidays', { year, expected, holidays });
  if (!previous) throw new CommandError('conflict', stale);
  const inverse: Inverse = { command: 'core.holidays.saveYear', input: { year, expected: holidays, holidays: previous }, label: `Hoàn tác ngày nghỉ năm ${year}` };
  return { value: null, audit: 'sql' as const, inverse };
}

async function profileOrFail(ctx: Parameters<typeof readProfile>[0], id: UserId): Promise<Profile> {
  const p = await readProfile(ctx, id);
  if (!p) throw new CommandError('not_found', NO_ACCOUNT);
  return p;
}

export const commands = defineCommands('core', {
  'settings.update': {
    kind: 'mutation',
    input: settingsUpdateSchema,
    authorize: { perm: 'core.settings.edit', global: true },
    async run(ctx, { version, patch }) {
      const before = ctx.settings;
      const fields = changedFields(before, patch);
      if (fields.length === 0) throw new CommandError('invalid', 'Chưa có thay đổi nào để lưu.');
      const changes = Object.fromEntries(fields.map((f) => [f, patch[f]])) as SettingsPatch;
      const after = await ctx.db.rpc('sce_tcsk_update_settings', { expectedVersion: version, patch: changes });
      if (!after) throw new CommandError('conflict', CONFLICT);
      const inverse: Inverse = {
        command: 'core.settings.update',
        input: { version: after.version, patch: Object.fromEntries(fields.map((f) => [f, before[f]])) as SettingsPatch },
        label: 'Hoàn tác cập nhật tham số hệ thống',
      };
      return { value: after, audit: 'sql', inverse };
    },
  },

  'holidays.replaceYear': {
    kind: 'mutation',
    input: holidaysReplaceSchema,
    authorize: { perm: 'core.holidays.edit', global: true },
    run: (ctx, { year, holidays }) => saveYear(ctx, year, [], holidays, `Năm ${year} đã có ngày nghỉ. Sửa danh sách tại trang Tham số hệ thống.`),
  },

  'holidays.saveYear': {
    kind: 'mutation',
    input: holidaysSaveSchema,
    authorize: { perm: 'core.holidays.edit', global: true },
    run: (ctx, { year, expected, holidays }) => saveYear(ctx, year, expected, holidays, `Ngày nghỉ năm ${year} vừa được người khác thay đổi. Đang tải lại danh sách mới…`),
  },

  'users.create': {
    kind: 'mutation',
    input: createUserSchema as Schema<{ email: Email; password: string; fullname: string; department: DepartmentName; role: Role }>,
    authorize: { perm: 'core.users.manage', global: true },
    async run(ctx, input) {
      const id: UserId = await createAuthUser(input);
      await ctx.db.rpc('sce_tcsk_admit_profile', { id, role: input.role, department: input.department });
      const profile: Profile = (await readProfile(ctx, id)) ?? {
        id, email: input.email, fullname: input.fullname, role: input.role, department: input.department, status: 'active', createdAt: ctx.now, updatedAt: ctx.now,
      };
      return { value: profile, audit: 'sql' };
    },
  },

  'users.setRole': {
    kind: 'mutation',
    input: setRoleSchema,
    authorize: { perm: 'core.users.manage', global: true },
    async run(ctx, { id, role }) {
      const before = await profileOrFail(ctx, id);
      if (before.role === role) throw new CommandError('invalid', `${before.fullname} đã có vai trò ${ROLES[role].label}.`);
      await ctx.db.rpc('sce_tcsk_set_profile_role', { id, role });
      const after = await profileOrFail(ctx, id);
      const inverse: Inverse = { command: 'core.users.setRole', input: { id, role: before.role }, label: 'Hoàn tác phân quyền' };
      return { value: after, audit: 'sql', inverse };
    },
  },

  'users.setDepartment': {
    kind: 'mutation',
    input: setDepartmentSchema,
    authorize: { perm: 'core.users.manage', global: true },
    async run(ctx, { id, department }) {
      const before = await profileOrFail(ctx, id);
      if (before.department === department) throw new CommandError('invalid', `${before.fullname} đã thuộc ${department}.`);
      await ctx.db.rpc('sce_tcsk_set_profile_department', { id, department });
      const after = await profileOrFail(ctx, id);
      const inverse: Inverse | undefined = before.department
        ? { command: 'core.users.setDepartment', input: { id, department: before.department }, label: 'Hoàn tác chuyển phòng ban' }
        : undefined;
      return { value: after, audit: 'sql', inverse };
    },
  },

  'users.setStatus': {
    kind: 'mutation',
    input: setStatusSchema,
    authorize: { perm: 'core.users.manage', global: true },
    async run(ctx, { ids, status }) {
      const all = await listProfiles(ctx);
      const targets = ids.map((id) => all.find((p) => p.id === id));
      if (targets.some((t) => !t)) throw new CommandError('not_found', NO_ACCOUNT);
      const before = targets as Profile[];
      const changed = await ctx.db.rpc('sce_tcsk_set_profile_status', { ids, status });
      const reverse = status === 'locked' ? 'active' : 'locked';
      // Approving a pending account has no inverse: there is no command back to "Chờ duyệt".
      const inverse: Inverse | undefined = before.every((p) => p.status === reverse)
        ? { command: 'core.users.setStatus', input: { ids, status: reverse }, label: status === 'locked' ? 'Hoàn tác khóa tài khoản' : 'Hoàn tác mở khóa tài khoản' }
        : undefined;
      return { value: changed, audit: 'sql', inverse };
    },
  },

  'profile.updateName': {
    kind: 'mutation',
    input: profileNameSchema,
    authorize: { perm: 'core.profile.edit', global: true },
    async run(ctx, { fullname }) {
      const before = ctx.actor.profile.fullname;
      if (before === fullname) throw new CommandError('invalid', 'Tên hiển thị chưa thay đổi.');
      const after = await ctx.db.rpc('sce_tcsk_update_profile_name', { fullname });
      const inverse: Inverse = { command: 'core.profile.updateName', input: { fullname: before }, label: 'Hoàn tác đổi tên hiển thị' };
      return { value: after, audit: 'sql', inverse };
    },
  },

  'backups.create': {
    kind: 'mutation',
    input: backupNoteSchema,
    authorize: { perm: 'core.backups.create', global: true },
    async run(ctx, { note }) {
      const { id } = await ctx.db.rpc('sce_tcsk_create_backup', { note, kind: 'manual' });
      const created = await readBackup(ctx, id as BackupId);
      if (!created) throw new CommandError('not_found', NO_BACKUP);
      return { value: created, audit: 'sql' };
    },
  },

  'backups.restore': {
    kind: 'mutation',
    input: backupRefSchema,
    authorize: { perm: 'core.backups.restore', global: true },
    async run(ctx, { id }) {
      const backup = await readBackup(ctx, id);
      if (!backup) throw new CommandError('not_found', NO_BACKUP);
      if (backup.format !== 2) {
        throw new CommandError('invalid', `Bản #${id} là dữ liệu của phiên bản cũ. Khôi phục bản này bằng công cụ chuyển dữ liệu (scripts/import-legacy.ts), không khôi phục tại đây.`);
      }
      await ctx.db.rpc('sce_tcsk_restore_backup', { id });
      return { value: null, audit: 'sql' };
    },
  },

  'backups.download': {
    kind: 'query',
    input: backupRefSchema,
    authorize: { perm: 'core.backups.create', global: true },
    async run(ctx, { id }) {
      const data = await ctx.db.rpc('sce_tcsk_backup_data', { id });
      return { value: { fileName: `SCE_Event_Backup_${fileDateStamp(ctx.now)}_${id}.json`, data }, audit: null };
    },
  },

  'audit.list': {
    kind: 'query',
    input: auditListSchema,
    authorize: { perm: 'core.audit.read', global: true },
    async run(ctx, { before, limit, action, from, to }) {
      const rows = await ctx.db.rpc('sce_tcsk_list_audit', { beforeId: before, limit, action, from, to });
      return { value: rows.map(toAuditRow), audit: null };
    },
  },
});
