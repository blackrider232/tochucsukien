// Usage sketch: what a module worker writes. This is feature `live` wiring a
// manifest, a table, two commands (one asks other owners), and a page read.
// It type-checks against the contracts, which is the point of the file.

import type { EventId, GuestId, Instant } from '../core/brand';
import { defineCommands, CommandError, useCommand } from '../core/commands';
import { defineTable, type EventScopedRow, type Schema } from '../core/db';
import { defineFeature } from '../core/registry';
import { requestContext } from '../core/auth';
import { parseScannedCode } from '../core/checkin-code';
import { readRoster } from '../features/guests';
import { readEventHall, readSeating } from '../features/venue';
import { readCheckIns, matchScan, type CheckIn } from '../features/live';

// ---- src/features/live/manifest.ts ----
export const liveManifest = defineFeature({
  key: 'live',
  worker: 'M5',
  permissions: {
    'live.read': { label: 'Xem tác nghiệp hiện trường', scope: 'event', grants: { admin: 'all', leader: 'all', dept_leader: 'department', user: 'department' } },
    'live.checkin': { label: 'Check-in đại biểu', scope: 'event', grants: { admin: 'all', leader: 'all', dept_leader: 'department', user: 'department' } },
    'live.manage': { label: 'Phân công trực, xử lý sự cố', scope: 'event', grants: { admin: 'all', leader: 'all', dept_leader: 'department', user: 'department' } },
  },
  nav: [
    {
      id: 'live', section: 'main', order: 50, label: 'Tổ chức sự kiện', icon: 'smartphone', accent: 'teal',
      href: { kind: 'event', segment: 'live' }, permission: 'live.read', legacyTabIds: ['tab-live', 'tab-module5'],
      header: { title: 'Tác Nghiệp Hiện Trường Ngày Sự Kiện (Giờ G)', subtitle: 'Điều hành tác nghiệp thời gian thực từ T0 - 2h, kiểm tra kỹ thuật, check-in QR và điều phối hội trường.', badge: 'T0 - 2h Hiện Trường' },
    },
  ],
  subTabs: [
    { parentNav: 'live', id: 'checkin', order: 10, label: 'Check-in', href: { kind: 'event', segment: 'live' }, permission: 'live.read' },
    { parentNav: 'live', id: 'duty', order: 20, label: 'Trực bàn', href: { kind: 'event', segment: 'live/duty' }, permission: 'live.read' },
  ],
  routes: [
    { dir: '(app)/events/[eventId]/live', permission: 'live.read' },
    { dir: '(print)/events/[eventId]/live', permission: 'live.read' },
  ],
  tables: ['sce_tcsk_checkins', 'sce_tcsk_duty_staff', 'sce_tcsk_incidents'],
  legacyBlobKeys: ['eventDutyRoster', 'eventIncidents'],
});

// ---- src/features/live/server/tables.ts ----
interface CheckInRow extends EventScopedRow, Omit<CheckIn, 'eventId'> {}
declare const checkInRowSchema: Schema<CheckInRow>;
const checkIns = defineTable<CheckInRow>({ name: 'sce_tcsk_checkins', owner: 'live', eventScoped: true, row: checkInRowSchema });

// ---- src/features/live/server/commands.ts ----
declare const checkInInput: Schema<{ eventId: EventId; guestId: GuestId; desk: string | null }>;
declare const cancelInput: Schema<{ eventId: EventId; guestId: GuestId }>;
declare function toCheckIn(row: CheckInRow): CheckIn;

export const liveCommands = defineCommands('live', {
  checkIn: {
    kind: 'mutation',
    input: checkInInput,
    authorize: { perm: 'live.checkin', event: (i) => i.eventId },
    async run(ctx, input) {
      const [existing] = await ctx.db.table(checkIns).list({ eventId: input.eventId, guestId: input.guestId });
      if (existing?.checkedInAt) {
        return {
          value: { already: true, checkIn: toCheckIn(existing) },
          audit: { action: 'CHECK-IN', summary: 'Quét lại mã đã check-in', eventId: input.eventId, entity: 'guest', entityId: input.guestId },
        };
      }
      const row = await ctx.db.table(checkIns).upsertOn(['eventId', 'guestId'], {
        eventId: input.eventId,
        guestId: input.guestId,
        checkedInAt: ctx.now,
        checkedInBy: ctx.actor.profile.id,
        desk: input.desk,
        giftGivenAt: existing?.giftGivenAt ?? null,
      });
      return {
        value: { already: false, checkIn: toCheckIn(row) },
        audit: { action: 'CHECK-IN', summary: 'Check-in đại biểu', eventId: input.eventId, entity: 'guest', entityId: input.guestId },
        inverse: { command: 'live.cancelCheckIn', input: { eventId: input.eventId, guestId: input.guestId }, label: 'Hủy check-in' },
      };
    },
  },
  cancelCheckIn: {
    kind: 'mutation',
    input: cancelInput,
    authorize: { perm: 'live.checkin', event: (i) => i.eventId },
    async run(ctx, input) {
      const removed = await ctx.db.table(checkIns).removeWhere({ eventId: input.eventId, guestId: input.guestId });
      if (removed === 0) throw new CommandError('not_found', 'Đại biểu chưa check-in.');
      return { value: null, audit: { action: 'HỦY CHECK-IN', summary: 'Hủy check-in đại biểu', eventId: input.eventId, entity: 'guest', entityId: input.guestId } };
    },
  },
});

// A walk-in asks two other owners, each through its own pipeline. Client ids
// make every step an idempotent upsert, so a retry after a partial failure converges.
export async function walkInSketch(ctx: import('../core/commands').CommandContext, eventId: EventId, guestId: GuestId) {
  await ctx.call('guests.create', {
    eventId,
    id: guestId,
    draft: {
      name: 'Nguyễn Văn A', group: 'DoanhNghiep', title: 'Đại biểu phát sinh', organization: 'Công ty X', phone: '', email: null,
      sendMethod: 'direct', inviteStatus: 'received', rsvpStatus: 'confirmed', rsvpSource: 'walk_in', substituteName: '',
      hasBanquet: false, notes: 'Đại biểu phát sinh đăng ký tại bàn Lễ tân', masterContactId: null,
    },
  });
  await ctx.call('venue.assignSeat', { eventId, guestId, seatCode: 'auto' });
  return ctx.call('live.checkIn', { eventId, guestId, desk: null });
}

// ---- src/app/(app)/events/[eventId]/live/page.tsx (server component) ----
export async function LivePageSketch({ params }: { params: Promise<{ eventId: EventId }> }) {
  const { eventId } = await params;
  const ctx = await requestContext();
  const [roster, hall, seats, checkins] = await Promise.all([
    readRoster(ctx, eventId),
    readEventHall(ctx, eventId),
    readSeating(ctx, eventId),
    readCheckIns(ctx, eventId),
  ]);
  return { roster, hall, seats, checkins };
}

// ---- client component: ScanInput onSubmit ----
export function useScanSketch(eventId: EventId, roster: Parameters<typeof matchScan>[2]) {
  const run = useCommand();
  return async (raw: string) => {
    const outcome = matchScan(parseScannedCode(raw), eventId, roster, new Map());
    if (outcome.kind !== 'ok') return outcome;
    const res = await run('live.checkIn', { eventId, guestId: outcome.guest.id, desk: null }, { success: `Đã check-in: ${outcome.guest.name}` });
    return res?.already ? ({ kind: 'already', guest: outcome.guest, at: res.checkIn.checkedInAt as Instant } as const) : outcome;
  };
}

