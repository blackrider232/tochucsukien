// Walk-ins and substitutes at the desk. Each asks the owner of what it changes:
// guests creates or updates the guest, venue seats it, live checks it in, each
// through its own command, so each step is permission-checked and audited
// even when a later step fails. Every check runs before the first write.

import { z } from 'zod';
import type { EventId, GuestId, SeatCode, Version } from '@/core/brand';
import { CommandError, type CommandContext } from '@/core/commands';
import type { RsvpStatus } from '@/core/vocab';
import { guestIdentityKey, type GuestDraft } from '@/features/guests';
import { readRoster } from '@/features/guests/server';
import { findFreeSeat } from '@/features/venue';
import { readEventHall, readSeating } from '@/features/venue/server';
import type { CheckIn } from '../contract';
import { formatAt } from '../domain/desk';
import { deskSchema, eventIdSchema, guestIdSchema, instantSchema, versionSchema, walkInFields } from '../domain/schemas';
import { asSchema, audit, checkinWrite, declinedMessage, guestOf, inverse, who, type Spec } from './command-kit';

export interface WalkInInput {
  eventId: EventId;
  /** Generated when the dialog opens, so pressing "Check-in ngay" again after a failure converges on one guest. */
  guestId: GuestId;
  guest: { name: string; group: GuestDraft['group']; title: string; organization: string; phone: string; hasBanquet: boolean };
  /** Decision 10: the zone staff picked; null for no seat. */
  zoneKey: string | null;
  confirmVipZone: boolean;
  giftGiven: boolean;
  /** The desk saw a guest with the same identity and chose to create a new one anyway (BUG-16). */
  allowDuplicate: boolean;
  desk: string | null;
}
export interface WalkInResult {
  guestId: GuestId;
  seatCode: SeatCode | null;
  /** Why the walk-in has no seat although a zone was picked; the guest is checked in either way. */
  seatProblem: string | null;
  checkIn: CheckIn;
}

const draftOf = (g: WalkInInput['guest']): GuestDraft => ({
  ...g,
  email: null,
  sendMethod: 'direct',
  inviteStatus: 'received',
  rsvpStatus: 'confirmed',
  rsvpSource: 'walk_in',
  substituteName: '',
  notes: 'Đại biểu phát sinh đăng ký tại bàn lễ tân',
  masterContactId: null,
});

type SeatPlan = { zoneName: string; pick: () => Promise<SeatCode | null>; first: SeatCode } | null;

/** The zone check of decision 10, before anything is written: hall, zone, the VIP confirmation, a free seat. */
async function planSeat(ctx: CommandContext, input: WalkInInput): Promise<SeatPlan> {
  if (input.zoneKey === null) return null;
  const hall = await readEventHall(ctx, input.eventId);
  if (!hall) throw new CommandError('invalid', 'Sự kiện chưa chọn hội trường. Chọn "Không xếp ghế" hoặc chọn hội trường ở Sơ đồ chỗ ngồi.');
  const zone = hall.zones.find((z) => z.key === input.zoneKey);
  if (!zone) throw new CommandError('conflict', 'Khu đã chọn không còn trong sơ đồ hội trường. Đang tải lại…');
  if (zone.vipZone && input.guest.group !== 'VIP' && !input.confirmVipZone) {
    throw new CommandError('invalid', `${zone.name} là khu VIP. Xác nhận xếp khách không thuộc nhóm VIP vào khu này, hoặc chọn khu khác.`);
  }
  const pick = async () => findFreeSeat(hall, new Set((await readSeating(ctx, input.eventId)).map((s) => s.seatCode)), input.guest.group, zone.key);
  const first = await pick();
  if (!first) throw new CommandError('invalid', `${zone.name} đã hết ghế trống. Chọn khu khác hoặc "Không xếp ghế".`);
  return { zoneName: zone.name, pick, first };
}

/** Asks venue for the planned seat; another desk may take it first, so the next free seat of the zone is tried once. */
async function takeSeat(ctx: CommandContext, eventId: EventId, guestId: GuestId, plan: NonNullable<SeatPlan>): Promise<{ seatCode: SeatCode | null; problem: string | null }> {
  for (const code of [plan.first, null]) {
    const target = code ?? (await plan.pick());
    if (!target) break;
    try {
      const placed = await ctx.call('venue.assignSeat', { eventId, guestId, seatCode: target });
      if (placed) return { seatCode: placed.seatCode, problem: null };
    } catch {
      // Taken meanwhile, or venue refused: try the next free seat once.
    }
  }
  return { seatCode: null, problem: `Không xếp được ghế ở ${plan.zoneName} (ghế vừa được bàn khác xếp hoặc khu đã hết chỗ); xếp lại ở Sơ đồ chỗ ngồi.` };
}

export const walkIn: Spec<'live.walkIn'> = {
  kind: 'mutation',
  input: asSchema(
    z.object({
      eventId: eventIdSchema,
      guestId: guestIdSchema,
      guest: walkInFields.pick({ name: true, group: true, title: true, organization: true, phone: true, hasBanquet: true }),
      zoneKey: z.string().trim().min(1).max(10).nullable(),
      confirmVipZone: z.boolean(),
      giftGiven: z.boolean(),
      allowDuplicate: z.boolean(),
      desk: deskSchema,
    }),
  ),
  authorize: checkinWrite,
  async run(ctx, input) {
    const { eventId, guestId } = input;
    const roster = await readRoster(ctx, eventId);
    const draft = draftOf(input.guest);
    const key = guestIdentityKey(draft);
    const retry = roster.find((g) => g.id === guestId) ?? null;
    // Only this dialog's own walk-in, pressed again, may reuse the id; any other guest's id is not a retry.
    if (retry && (retry.rsvpSource !== 'walk_in' || guestIdentityKey(retry) !== key)) {
      throw new CommandError('conflict', 'Mã khách này đã thuộc về một đại biểu khác trong danh sách. Đóng hộp thoại rồi mở lại để tiếp nhận khách mới.');
    }
    if (!retry && !input.allowDuplicate) {
      const twin = roster.find((g) => guestIdentityKey(g) === key);
      if (twin) throw new CommandError('invalid', `Đã có ${who(twin)} trong danh sách khách mời. Check-in đại biểu đó, hoặc chọn "Vẫn tạo khách mới".`);
    }
    const plan = retry?.seatCode ? null : await planSeat(ctx, input);

    const created = retry ?? (await ctx.call('guests.create', { eventId, id: guestId, draft }));
    const seat = plan ? await takeSeat(ctx, eventId, guestId, plan) : { seatCode: retry?.seatCode ?? null, problem: null };
    const { checkIn } = await ctx.call('live.checkIn', { eventId, guestId, desk: input.desk });
    if (input.giftGiven) await ctx.call('live.setGift', { eventId, guestId, given: true });

    const seatText = seat.seatCode ? `ghế ${seat.seatCode}` : seat.problem ? `chưa có ghế: ${seat.problem}` : 'không xếp ghế';
    return {
      value: { guestId, seatCode: seat.seatCode, seatProblem: seat.problem, checkIn },
      audit: audit('TIẾP NHẬN KHÁCH PHÁT SINH', `Khách phát sinh: ${who(draft)}, ${seatText}, đã check-in${input.giftGiven ? ', đã phát quà' : ''}`, eventId, 'checkin', guestId),
      inverse: inverse('live.undoWalkIn', { eventId, guestId, checkedInAt: checkIn.checkedInAt!, guestVersion: created.version }, `Tiếp nhận ${draft.name}`),
    };
  },
};

/** Takes a walk-in back while the guest is as the desk left it: the check-in, the seat, then the guest, each by its owner. */
export const undoWalkIn: Spec<'live.undoWalkIn'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, guestId: guestIdSchema, checkedInAt: instantSchema, guestVersion: versionSchema })),
  authorize: checkinWrite,
  async run(ctx, { eventId, guestId, checkedInAt, guestVersion }) {
    const guest = await guestOf(ctx, eventId, guestId);
    if (guest.rsvpSource !== 'walk_in') throw new CommandError('invalid', `${guest.name} không phải khách phát sinh; xóa ở danh sách khách mời nếu cần.`);
    if (guest.version !== guestVersion) throw new CommandError('conflict', `Hồ sơ ${guest.name} đã được sửa sau khi tiếp nhận, nên không hoàn tác được. Xóa ở danh sách khách mời nếu cần.`);
    if (guest.checkedInAt !== checkedInAt) throw new CommandError('conflict', `Check-in của ${guest.name} đã thay đổi sau đó, nên không hoàn tác được. Đang tải lại…`);
    await ctx.call('live.undoCheckIn', { eventId, guestId, checkedInAt });
    if (guest.seatCode) await ctx.call('venue.releaseGuestSeat', { eventId, guestId });
    await ctx.call('guests.delete', { eventId, id: guestId, version: guestVersion });
    return {
      value: null,
      audit: audit('HOÀN TÁC KHÁCH PHÁT SINH', `Hoàn tác tiếp nhận khách phát sinh: ${who(guest)} (bỏ check-in${guest.seatCode ? `, giải phóng ghế ${guest.seatCode}` : ''}, xóa khỏi danh sách)`, eventId, 'checkin', guestId),
    };
  },
};

export interface SubstituteInput {
  eventId: EventId;
  /** The invited guest the substitute attends for; that record is checked in and keeps its seat (m5 BUG-15). */
  guestId: GuestId;
  version: Version;
  substituteName: string;
  giftGiven: boolean;
  /** Decision 7, when the invited guest had declined. */
  confirmDeclined: boolean;
  desk: string | null;
}

export const checkInSubstitute: Spec<'live.checkInSubstitute'> = {
  kind: 'mutation',
  input: asSchema(
    z.object({
      eventId: eventIdSchema,
      guestId: guestIdSchema,
      version: versionSchema,
      substituteName: z.string().trim().min(1, 'Nhập họ tên và chức vụ người đi thay').max(300),
      giftGiven: z.boolean(),
      confirmDeclined: z.boolean(),
      desk: deskSchema,
    }),
  ),
  authorize: checkinWrite,
  async run(ctx, { eventId, guestId, version, substituteName, giftGiven, confirmDeclined, desk }) {
    const guest = await guestOf(ctx, eventId, guestId);
    if (guest.checkedInAt) throw new CommandError('conflict', `${guest.name} đã check-in lúc ${formatAt(guest.checkedInAt, ctx.now)}; không ghi nhận người đi thay. Đang tải lại…`);
    if (guest.rsvpStatus === 'declined' && !confirmDeclined) throw new CommandError('conflict', declinedMessage(guest));
    if (guest.version !== version) throw new CommandError('conflict', `Hồ sơ ${guest.name} vừa được người khác cập nhật. Đang tải lại…`);
    const updated = await ctx.call('guests.update', { eventId, id: guestId, version, patch: { rsvpStatus: 'substituted', substituteName } });
    const { checkIn } = await ctx.call('live.checkIn', { eventId, guestId, desk });
    if (giftGiven) await ctx.call('live.setGift', { eventId, guestId, given: true });
    return {
      value: { checkIn },
      audit: audit(
        'CHECK-IN NGƯỜI ĐI THAY',
        `Người đi thay ${substituteName} check-in thay cho ${who(guest)}${guest.rsvpStatus === 'declined' ? ' (đại biểu đã báo vắng, đã xác nhận)' : ''}${giftGiven ? ', đã phát quà' : ''}`,
        eventId, 'checkin', guestId,
      ),
      inverse: inverse(
        'live.undoSubstitute',
        { eventId, guestId, checkedInAt: checkIn.checkedInAt!, guestVersion: updated.version, rsvpStatus: guest.rsvpStatus, substituteName: guest.substituteName },
        `Người đi thay cho ${guest.name}`,
      ),
    };
  },
};

/**
 * Takes a substitute back: the check-in, then the RSVP as it was, both by their owners. Only a guest still marked
 * substituted at the version the substitute left, with that check-in, is taken back.
 */
export const undoSubstitute: Spec<'live.undoSubstitute'> = {
  kind: 'mutation',
  input: asSchema(
    z.object({
      eventId: eventIdSchema,
      guestId: guestIdSchema,
      checkedInAt: instantSchema,
      guestVersion: versionSchema,
      rsvpStatus: z.enum(['pending', 'confirmed', 'substituted', 'declined']),
      substituteName: z.string().trim().max(300),
    }),
  ),
  authorize: checkinWrite,
  async run(ctx, { eventId, guestId, checkedInAt, guestVersion, rsvpStatus, substituteName }) {
    const guest = await guestOf(ctx, eventId, guestId);
    if (guest.rsvpStatus !== 'substituted') throw new CommandError('conflict', `${guest.name} không có người đi thay để hoàn tác. Đang tải lại…`);
    if (guest.version !== guestVersion) throw new CommandError('conflict', `Hồ sơ ${guest.name} đã được sửa sau đó, nên không hoàn tác được. Đang tải lại…`);
    if (guest.checkedInAt !== checkedInAt) throw new CommandError('conflict', `Check-in của ${guest.name} đã thay đổi sau đó, nên không hoàn tác được. Đang tải lại…`);
    await ctx.call('live.undoCheckIn', { eventId, guestId, checkedInAt });
    await ctx.call('guests.update', { eventId, id: guestId, version: guestVersion, patch: { rsvpStatus: rsvpStatus as RsvpStatus, substituteName } });
    return {
      value: null,
      audit: audit('HOÀN TÁC NGƯỜI ĐI THAY', `Hoàn tác người đi thay${guest.substituteName ? ` ${guest.substituteName}` : ''} của ${who(guest)} (bỏ check-in, trả lại xác nhận cũ)`, eventId, 'checkin', guestId),
    };
  },
};

