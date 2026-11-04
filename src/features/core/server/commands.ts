// Every write of feature `core`. Profiles, backups and restore go through the
// 0003 SQL functions, which re-check core.users.manage / the backup permissions,
// keep one active admin and write their own audit row; the row returned here is
// the readable one (names, labels) the pipeline adds. Settings, holidays and the
// profile name go through 202611041000_core_admin_functions.sql.

import type { Profile } from '@/core/auth';
import { createAuthUser } from '@/core/auth/server';
import type { BackupId, Email, UserId } from '@/core/brand';
import { CommandError, defineCommands, type AuditEntry, type Inverse } from '@/core/commands';
import { fileDateStamp, formatVNDate, formatVNTime, type Holiday } from '@/core/dates';
import type { Schema } from '@/core/db';
import type { SettingsPatch, SystemSettings } from '@/core/settings';
import { ROLES, type DepartmentName, type Role } from '@/core/vocab';
import '../command-map';
import { HOLIDAY_KIND_LABELS, auditListSchema, backupNoteSchema, backupRefSchema, createUserSchema, holidaysReplaceSchema, profileNameSchema, setDepartmentSchema, setRoleSchema, setStatusSchema, settingsUpdateSchema } from '../domain/schemas';
import { SETTINGS_FIELDS, type SettingsField } from '../domain/labels';
import { listProfiles, readBackup, readProfile, toAuditRow } from './reads';

const CONFLICT = 'Dữ liệu đã được người khác cập nhật. Đang tải lại…';
const NO_ACCOUNT = 'Không tìm thấy tài khoản, hoặc bạn không có quyền xem.';
const NO_BACKUP = 'Không tìm thấy bản sao lưu.';

const audit = (action: string, summary: string, entity: string, entityId: string): AuditEntry => ({ action, summary, eventId: null, entity, entityId });
const who = (p: Profile) => `${p.fullname} <${p.email}>`;

function changedFields(before: SystemSettings, after: SettingsPatch): SettingsField[] {
  return (Object.keys(SETTINGS_FIELDS) as SettingsField[]).filter((k) => after[k] !== undefined && after[k] !== before[k]);
}
const shown = (field: SettingsField, value: unknown) => `${value ?? '(trống)'}${field.endsWith('Percent') ? '%' : ''}`;

function holidayDiff(previous: ReadonlyArray<Holiday>, next: ReadonlyArray<Holiday>): string {
  const key = (h: Holiday) => `${h.date}|${h.name}|${h.kind}`;
  const [before, after] = [new Set(previous.map(key)), new Set(next.map(key))];
  const line = (h: Holiday) => `${formatVNDate(h.date)} ${h.name}${h.kind === 'holiday' ? '' : ` (${HOLIDAY_KIND_LABELS[h.kind].toLowerCase()})`}`;
  const added = next.filter((h) => !before.has(key(h))).map(line);
  const removed = previous.filter((h) => !after.has(key(h))).map(line);
  return [added.length > 0 && `thêm ${added.join(', ')}`, removed.length > 0 && `bỏ ${removed.join(', ')}`].filter(Boolean).join('; ') || 'không thay đổi';
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
      const summary = fields.map((f) => `${SETTINGS_FIELDS[f].label}: ${shown(f, before[f])} → ${shown(f, after[f])}`).join('; ');
      const inverse: Inverse = {
        command: 'core.settings.update',
        input: { version: after.version, patch: Object.fromEntries(fields.map((f) => [f, before[f]])) as SettingsPatch },
        label: 'Hoàn tác cập nhật tham số hệ thống',
      };
      return { value: after, audit: audit('CẬP NHẬT THAM SỐ HỆ THỐNG', summary, 'settings', '1'), inverse };
    },
  },

  'holidays.replaceYear': {
    kind: 'mutation',
    input: holidaysReplaceSchema,
    authorize: { perm: 'core.holidays.edit', global: true },
    async run(ctx, { year, holidays }) {
      const previous = await ctx.db.rpc('sce_tcsk_replace_holidays', { year, holidays });
      const inverse: Inverse = { command: 'core.holidays.replaceYear', input: { year, holidays: previous }, label: `Hoàn tác ngày nghỉ năm ${year}` };
      return { value: null, audit: audit('CẬP NHẬT NGÀY NGHỈ LỄ', `Năm ${year}: ${holidayDiff(previous, holidays)}`, 'holidays', String(year)), inverse };
    },
  },

  'users.create': {
    kind: 'mutation',
    input: createUserSchema as Schema<{ email: Email; password: string; fullname: string; department: DepartmentName; role: Role }>,
    authorize: { perm: 'core.users.manage', global: true },
    async run(ctx, input) {
      const id: UserId = await createAuthUser(input);
      if (input.role !== 'user') await ctx.db.rpc('sce_tcsk_set_profile_role', { id, role: input.role });
      await ctx.db.rpc('sce_tcsk_set_profile_department', { id, department: input.department });
      await ctx.db.rpc('sce_tcsk_set_profile_status', { ids: [id], status: 'active' });
      const profile: Profile = (await readProfile(ctx, id)) ?? {
        id, email: input.email, fullname: input.fullname, role: input.role, department: input.department, status: 'active', createdAt: ctx.now, updatedAt: ctx.now,
      };
      return { value: profile, audit: audit('TẠO TÀI KHOẢN', `${input.fullname} <${input.email}>, ${ROLES[input.role].label}, ${input.department}`, 'profile', id) };
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
      return { value: after, audit: audit('PHÂN QUYỀN TÀI KHOẢN', `${who(before)}: ${ROLES[before.role].label} → ${ROLES[role].label}`, 'profile', id), inverse };
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
      return { value: after, audit: audit('CHUYỂN PHÒNG BAN', `${who(before)}: ${before.department ?? '(chưa có)'} → ${department}`, 'profile', id), inverse };
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
      const verb = (p: Profile) => (status === 'locked' ? 'Khóa' : p.status === 'pending' ? 'Duyệt' : 'Mở khóa');
      const summary = before.map((p) => `${verb(p)} ${who(p)}`).join('; ');
      const reverse = status === 'locked' ? 'active' : 'locked';
      // Approving a pending account has no inverse: there is no command back to "Chờ duyệt".
      const inverse: Inverse | undefined = before.every((p) => p.status === reverse)
        ? { command: 'core.users.setStatus', input: { ids, status: reverse }, label: status === 'locked' ? 'Hoàn tác khóa tài khoản' : 'Hoàn tác mở khóa tài khoản' }
        : undefined;
      return { value: changed, audit: audit(status === 'locked' ? 'KHÓA TÀI KHOẢN' : 'DUYỆT/MỞ KHÓA TÀI KHOẢN', summary, 'profile', ids.join(',')), inverse };
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
      return { value: after, audit: audit('CẬP NHẬT HỒ SƠ', `Tên hiển thị: "${before}" → "${after.fullname}"`, 'profile', after.id), inverse };
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
      return { value: created, audit: audit('TẠO BẢN SAO LƯU', `Bản #${id}: ${note}`, 'backup', String(id)) };
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
      const when = formatVNTime(backup.createdAt, { withDate: true });
      return { value: null, audit: audit('KHÔI PHỤC SAO LƯU', `Khôi phục từ bản #${id} (${when}): ${backup.note}`, 'backup', String(id)) };
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
