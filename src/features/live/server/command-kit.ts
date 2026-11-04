// What every live command shares: the permission rules, the audit shape and
// the one way a command reads a guest (through feature guests' roster).

import type { z } from 'zod';
import type { EventId, GuestId } from '@/core/brand';
import { CommandError, type AuditEntry, type CommandContext, type CommandSpec, type InputOf, type Inverse, type OutputOf } from '@/core/commands';
import { DbError, type Schema } from '@/core/db';
import { readRoster, type RosterEntry } from '@/features/guests/server';

export type Spec<K extends Inverse['command']> = CommandSpec<InputOf<K>, OutputOf<K>>;
export const asSchema = <T>(s: z.ZodType): Schema<T> => s as unknown as Schema<T>;
export const inverse = <K extends Inverse['command']>(command: K, input: InputOf<K>, label: string) => ({ command, input, label }) as Inverse;
export const audit = (action: string, summary: string, eventId: EventId, entity: string, entityId: string): AuditEntry => ({ action, summary, eventId, entity, entityId });

const onEvent = (i: { eventId: EventId }) => i.eventId;
export const readLive = { perm: 'live.read', event: onEvent } as const;
export const checkinWrite = { perm: 'live.checkin', event: onEvent } as const;
export const manage = { perm: 'live.manage', event: onEvent } as const;

export const who = (g: Pick<RosterEntry, 'name' | 'organization'>) => (g.organization ? `${g.name} (${g.organization})` : g.name);

export const NO_GUEST = 'Không tìm thấy đại biểu trong danh sách khách mời của sự kiện.';

/** The guest as the roster shows it to this actor, only if it belongs to the event the permission was checked on. */
export async function guestOf(ctx: CommandContext, eventId: EventId, guestId: GuestId): Promise<RosterEntry> {
  const guest = (await readRoster(ctx, eventId)).find((g) => g.id === guestId);
  if (!guest) throw new CommandError('not_found', NO_GUEST);
  return guest;
}

/** Decision 7: a declined guest is checked in only through the confirmation, which is its own audited command. */
export const declinedMessage = (g: Pick<RosterEntry, 'name'>) =>
  `${g.name} đã báo vắng. Cần xác nhận "Vẫn check-in" để check-in đại biểu này. Đang tải lại…`;

/** The constraint name 202611041520_live_checkin_guard_fixes.sql gives a time outside its window (SQLSTATE 22008). */
export const CLOCK_SKEW = 'live_clock_skew';
export const isClockSkew = (e: unknown) => e instanceof DbError && e.kind === 'constraint' && e.detail?.constraint === CLOCK_SKEW;
const SKEW_MESSAGE =
  'Đồng hồ máy chủ lệch so với cơ sở dữ liệu nên chưa ghi được giờ. Đây không phải lỗi phân quyền; báo quản trị viên kiểm tra giờ của máy chủ ứng dụng.';

/** A check-in or gift write: a time the database refuses as outside its window says the clock is off, not that the user may not. */
export async function stampedWrite<T>(write: Promise<T>): Promise<T> {
  try {
    return await write;
  } catch (e) {
    if (isClockSkew(e)) throw new CommandError('conflict', SKEW_MESSAGE);
    throw e;
  }
}

export const clip = (s: string, max = 120) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
