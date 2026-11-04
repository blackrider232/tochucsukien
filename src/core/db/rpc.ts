// The allowlist of SQL functions (RpcMap) with their argument and result
// mapping. A name missing here cannot be called, whatever the caller casts.

import { z } from 'zod';
import type { EventId, Instant } from '@/core/brand';
import { parseProfileRow } from '@/core/auth/profile';
import { parseInstant } from '@/core/dates';
import { parseSettingsRow, type SettingsPatch } from '@/core/settings';
import type { AuditLogRow, BackupRow, RpcMap } from './index';

interface RpcSpec<K extends keyof RpcMap> {
  args(a: RpcMap[K]['args']): Record<string, unknown>;
  result(data: unknown): RpcMap[K]['result'];
}

const none = () => undefined;

const SETTINGS_COLUMNS: { readonly [K in keyof SettingsPatch]-?: string } = {
  agencyName: 'agency_name',
  agencyShortName: 'agency_short_name',
  parentAgency: 'parent_agency',
  dailyReportThresholdDays: 'daily_report_threshold_days',
  fieldPresenceHours: 'field_presence_hours',
  guestQuotaPercent: 'guest_quota_percent',
  badgeQuotaPercent: 'badge_quota_percent',
  googleClientId: 'google_client_id',
};

export function settingsPatchColumns(patch: SettingsPatch): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(patch)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [SETTINGS_COLUMNS[k as keyof SettingsPatch], v]),
  );
}

const instant = z.string().transform((v) => (parseInstant(v) ?? v) as Instant);

const backupRow = z.object({
  id: z.coerce.number(),
  note: z.string().nullable(),
  kind: z.enum(['manual', 'auto', 'pre_migration']),
  format: z.coerce.number().pipe(z.union([z.literal(1), z.literal(2)])),
  created_by_email: z.string().nullable(),
  created_at: instant,
});
export function parseBackupRow(row: unknown): BackupRow {
  const r = backupRow.parse(row);
  return { id: r.id, note: r.note ?? '', kind: r.kind, format: r.format, createdByEmail: r.created_by_email, createdAt: r.created_at };
}

const auditRow = z.object({
  id: z.coerce.number(),
  created_at: instant,
  actor_email: z.string().nullable(),
  action: z.string(),
  summary: z.string().nullable(),
  event_id: z.string().nullable(),
  entity: z.string().nullable(),
  entity_id: z.string().nullable(),
});
export function parseAuditRow(row: unknown): AuditLogRow {
  const r = auditRow.parse(row);
  return {
    id: r.id, at: r.created_at, actorEmail: r.actor_email, action: r.action, summary: r.summary ?? '',
    eventId: r.event_id as EventId | null, entity: r.entity, entityId: r.entity_id,
  };
}

const list = <T>(parse: (row: unknown) => T) => (d: unknown): T[] => (Array.isArray(d) ? d.map(parse) : []);

export const RPC_ALLOWLIST: { readonly [K in keyof RpcMap]: RpcSpec<K> } = {
  sce_tcsk_write_audit: {
    args: (a) => ({ action: a.action, summary: a.summary, event_id: a.eventId, entity: a.entity, entity_id: a.entityId }),
    result: none,
  },
  sce_tcsk_create_backup: { args: (a) => ({ note: a.note, kind: a.kind }), result: (d) => ({ id: Number(d) }) },
  sce_tcsk_restore_backup: { args: (a) => ({ id: a.id }), result: none },
  sce_tcsk_set_profile_role: { args: (a) => ({ id: a.id, role: a.role }), result: none },
  sce_tcsk_set_profile_department: { args: (a) => ({ id: a.id, department: a.department }), result: none },
  sce_tcsk_set_profile_status: { args: (a) => ({ ids: a.ids, status: a.status }), result: (d) => Number(d) },
  sce_tcsk_ensure_profile: { args: () => ({}), result: none },
  sce_tcsk_update_settings: {
    args: (a) => ({ expected_version: a.expectedVersion, patch: settingsPatchColumns(a.patch) }),
    result: (d) => (d ? parseSettingsRow(d) : null),
  },
  sce_tcsk_replace_holidays: {
    args: (a) => ({ year: a.year, holidays: a.holidays.map((h) => ({ date: h.date, name: h.name, kind: h.kind })) }),
    result: (d) => Number(d),
  },
  sce_tcsk_update_profile_name: { args: (a) => ({ new_fullname: a.fullname }), result: parseProfileRow },
  sce_tcsk_list_profiles: { args: () => ({}), result: list(parseProfileRow) },
  sce_tcsk_list_backups: { args: (a) => ({ lim: a.limit }), result: list(parseBackupRow) },
  sce_tcsk_backup_data: { args: (a) => ({ id: a.id }), result: (d) => d },
  sce_tcsk_list_audit: {
    args: (a) => ({
      before_id: a.beforeId ?? null, lim: a.limit, filter_action: a.action ?? null, filter_entity: a.entity ?? null,
      filter_actor: a.actor ?? null, filter_event: a.eventId ?? null, from_date: a.from ?? null, to_date: a.to ?? null,
    }),
    result: list(parseAuditRow),
  },
};
