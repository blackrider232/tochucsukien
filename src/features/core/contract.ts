// Feature `core` (foundation): accounts, settings, holidays, backups, audit.
// Its manifest (./manifest.ts) doubles as the reference every module manifest copies.

import type { BackupId, Email, Instant, IsoDate, UserId, Version } from '@/core/brand';
import type { Holiday } from '@/core/dates';
import type { ProfileStatus, Profile } from '@/core/auth';
import type { SettingsPatch, SystemSettings } from '@/core/settings';
import type { DepartmentName, Role } from '@/core/vocab';
import type { Sig } from '@/core/commands';

export interface BackupSummary {
  id: BackupId;
  kind: 'manual' | 'auto' | 'pre_migration';
  /** 1 = legacy whole blob (restore via import script), 2 = normalized snapshot. */
  format: 1 | 2;
  note: string;
  createdAt: Instant;
  createdByEmail: string | null;
}
export interface AuditRow {
  id: number;
  at: Instant;
  actorEmail: string | null;
  action: string;
  summary: string;
  eventId: string | null;
}

declare module '@/core/commands' {
  interface CommandMap {
    'core.settings.update': Sig<{ version: Version; patch: SettingsPatch }, SystemSettings>;
    'core.holidays.replaceYear': Sig<{ year: number; holidays: ReadonlyArray<Holiday> }, null>;
    /** Service-role auth.admin.createUser on the server; the admin's session is untouched (core B8). */
    'core.users.create': Sig<{ email: Email; password: string; fullname: string; department: DepartmentName; role: Role }, Profile>;
    'core.users.setRole': Sig<{ id: UserId; role: Role }, Profile>;
    'core.users.setDepartment': Sig<{ id: UserId; department: DepartmentName }, Profile>;
    'core.users.setStatus': Sig<{ ids: ReadonlyArray<UserId>; status: Exclude<ProfileStatus, 'pending'> }, number>;
    'core.profile.updateName': Sig<{ fullname: string }, Profile>;
    'core.backups.create': Sig<{ note: string }, BackupSummary>;
    'core.backups.restore': Sig<{ id: BackupId }, null>;
    'core.audit.list': Sig<{ before?: number; limit: number; action?: string; from?: IsoDate; to?: IsoDate }, ReadonlyArray<AuditRow>>;
  }
}
declare module '@/core/permissions' {
  interface PermissionMap {
    'core.settings.edit': true;
    'core.users.read': true;
    'core.users.manage': true;
    'core.backups.create': true;
    'core.backups.restore': true;
    'core.audit.read': true;
    'core.holidays.edit': true;
  }
}
