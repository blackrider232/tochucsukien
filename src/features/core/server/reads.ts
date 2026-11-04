// Server reads of feature `core`. The SQL functions run as the caller, so RLS
// decides what comes back: a dept_leader lists its own department, a user only
// itself; backups and audit rows need core.backups.create / core.audit.read.

import type { Profile, RequestContext } from '@/core/auth';
import type { BackupId, EventId, IsoDate } from '@/core/brand';
import type { AuditLogRow, BackupRow } from '@/core/db';
import type { AuditRow, BackupSummary } from '../contract';
import { AUDIT_PAGE } from '../domain/schemas';

export function listProfiles(ctx: RequestContext): Promise<Profile[]> {
  return ctx.db.rpc('sce_tcsk_list_profiles', {});
}

export async function readProfile(ctx: RequestContext, id: Profile['id']): Promise<Profile | null> {
  return (await listProfiles(ctx)).find((p) => p.id === id) ?? null;
}

const toSummary = (b: BackupRow): BackupSummary => ({ ...b, id: b.id as BackupId });

export async function listBackups(ctx: RequestContext, limit = 50): Promise<BackupSummary[]> {
  return (await ctx.db.rpc('sce_tcsk_list_backups', { limit })).map(toSummary);
}

export async function readBackup(ctx: RequestContext, id: BackupId): Promise<BackupSummary | null> {
  return (await listBackups(ctx, 200)).find((b) => b.id === id) ?? null;
}

export interface AuditFilter {
  action?: string;
  entity?: string;
  actor?: string;
  eventId?: EventId;
  from?: IsoDate;
  to?: IsoDate;
}
/** An audit row with the entity it touched, for the viewer. */
export interface AuditEntry extends AuditRow {
  entity: string | null;
  entityId: string | null;
}
export interface AuditPage {
  rows: AuditEntry[];
  /** Pass as `before` for the next (older) page; null on the last page. */
  nextBefore: number | null;
}

export const toAuditRow = ({ entity: _entity, entityId: _entityId, ...row }: AuditLogRow): AuditRow => row;

/** One page, newest first. Asks for one row more than the page to know whether an older page exists. */
export async function readAuditPage(ctx: RequestContext, filter: AuditFilter, before?: number, pageSize = AUDIT_PAGE): Promise<AuditPage> {
  const rows = await ctx.db.rpc('sce_tcsk_list_audit', { ...filter, beforeId: before, limit: pageSize + 1 });
  const page = rows.slice(0, pageSize);
  return { rows: page, nextBefore: rows.length > pageSize ? (page.at(-1)?.id ?? null) : null };
}

export function auditFacets(ctx: RequestContext): Promise<{ actions: string[]; entities: string[] }> {
  return ctx.db.rpc('sce_tcsk_audit_facets', {});
}
