// Small pieces every comms command shares.

import type { z } from 'zod';
import type { EventId } from '@/core/brand';
import { CommandError, type AuditEntry, type CommandContext, type Inverse, type InputOf } from '@/core/commands';
import { DbError } from '@/core/db';
import type { Schema } from '@/core/db';

export const asSchema = <T>(s: z.ZodType): Schema<T> => s as unknown as Schema<T>;

export const inverse = <K extends Inverse['command']>(command: K, input: InputOf<K>, label: string) => ({ command, input, label }) as Inverse;

export const audit = (action: string, summary: string, eventId: EventId | null, entity: string, entityId: string): AuditEntry => ({ action, summary, eventId, entity, entityId });

/**
 * The audit row of a command that throws after a write stuck (src/features/README.md, "Audit rows for partial
 * failures"): written as the pipeline writes it, under `perm`, the permission of the command whose run() this is.
 */
export const auditPartial = (ctx: CommandContext, perm: string, entry: AuditEntry) => ctx.db.rpc('sce_tcsk_audit_command', { ...entry, perm });

/** A failure as a person may read it: a command's own Vietnamese message (a nested ctx.call carries its failure), never a raw error. */
export function failureReason(e: unknown): string {
  if (e instanceof CommandError) return e.message;
  const nested = (e as { failure?: { message?: unknown } } | null)?.failure?.message;
  if (typeof nested === 'string') return nested;
  if (e instanceof DbError && e.kind === 'conflict') return 'dữ liệu vừa được người khác thay đổi';
  return 'lỗi hệ thống';
}
