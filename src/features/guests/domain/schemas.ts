// Zod schemas shared by the guest form (useZodForm) and the commands (input
// parsing), so the browser and the server validate the same rules.

import { z } from 'zod';
import { parseUuid, type ContactId, type EventId, type GuestId, type Instant, type SeatCode, type Uuid, type Version } from '@/core/brand';
import { parseCheckinCode, type CheckinCode } from '@/core/checkin-code';
import { parseInstant } from '@/core/dates';
import { normalizePhone, parseEmail } from '@/core/text';
import type { GuestGroup, InviteStatus, RsvpStatus, SendMethod } from '@/core/vocab';
import type { GuestDraft, RsvpSource } from '../contract';

export const GUEST_GROUP_VALUES = ['VIP', 'SoNganh', 'DoanhNghiep', 'QuocTe', 'BaoChi'] as const satisfies ReadonlyArray<GuestGroup>;
export const RSVP_VALUES = ['pending', 'confirmed', 'substituted', 'declined'] as const satisfies ReadonlyArray<RsvpStatus>;
export const INVITE_VALUES = ['pending', 'sent', 'received'] as const satisfies ReadonlyArray<InviteStatus>;
export const SEND_METHOD_VALUES = ['direct', 'ems', 'email'] as const satisfies ReadonlyArray<SendMethod>;
export const RSVP_SOURCE_VALUES = ['manual', 'google_form', 'walk_in', 'import'] as const satisfies ReadonlyArray<RsvpSource>;

/** One call may import a whole directory segment, never an unbounded payload. */
export const MAX_BATCH = 2000;

const uuidOf = <E extends string>() =>
  z.string().refine((v) => parseUuid(v) !== null, 'Mã không hợp lệ').transform((v) => parseUuid<E>(v) as Uuid<E>);
export const eventIdSchema = uuidOf<'Event'>() as z.ZodType<EventId, string>;
export const guestIdSchema = uuidOf<'Guest'>() as z.ZodType<GuestId, string>;
const contactIdSchema = uuidOf<'MasterContact'>() as z.ZodType<ContactId, string>;
export const versionSchema = z.number().int().positive().transform((v) => v as Version);
export const instantSchema = z.string().refine((v) => parseInstant(v) !== null, 'Thời điểm không hợp lệ').transform((v) => parseInstant(v) as Instant);
export const checkinCodeSchema = z.string().refine((v) => parseCheckinCode(v) !== null, 'Mã check-in không hợp lệ').transform((v) => parseCheckinCode(v) as CheckinCode);
export const seatCodeSchema = z.string().regex(/^[A-Z0-9]{1,4}-[0-9]{2,3}$/, 'Mã ghế không hợp lệ').transform((v) => v as SeatCode);

const text = (max: number) => z.string().trim().max(max, `Tối đa ${max} ký tự`);
const required = (max: number, message: string) => z.string({ error: message }).trim().min(1, message).max(max, `Tối đa ${max} ký tự`);

/** Empty, or an address parseEmail accepts (no CR/LF, no display name: m4a B04). The stored value is lowercased. */
const emailSchema = z
  .string()
  .nullable()
  .transform((v, ctx) => {
    const raw = (v ?? '').trim();
    if (!raw) return null;
    const email = parseEmail(raw);
    if (!email) {
      ctx.addIssue({ code: 'custom', message: 'Email không hợp lệ (ví dụ daibieu@domain.vn)' });
      return z.NEVER;
    }
    return email;
  });

/** Free text as staff write it ('0913.210.001', '024.3846.3000', '+81 3 1234 5678'); 8 to 15 digits (m4a Q13). */
const phoneSchema = text(40).refine((v) => {
  if (!v) return true;
  const digits = normalizePhone(v);
  return /^[\d\s.+()-]+$/.test(v) && digits.length >= 8 && digits.length <= 15;
}, 'Số điện thoại không hợp lệ (ví dụ 0912.345.678)');

export const guestFields = z.object({
  name: required(200, 'Nhập họ và tên đại biểu'),
  group: z.enum(GUEST_GROUP_VALUES, { error: 'Chọn nhóm khách mời' }),
  title: text(300),
  organization: required(300, 'Nhập cơ quan / đơn vị công tác'),
  phone: phoneSchema,
  email: emailSchema,
  sendMethod: z.enum(SEND_METHOD_VALUES),
  inviteStatus: z.enum(INVITE_VALUES),
  rsvpStatus: z.enum(RSVP_VALUES),
  rsvpSource: z.enum(RSVP_SOURCE_VALUES),
  substituteName: text(300),
  hasBanquet: z.boolean(),
  notes: text(2000),
  masterContactId: contactIdSchema.nullable(),
});

/** The fields a guest is created from, in form order. */
export const GUEST_DRAFT_KEYS = Object.keys(guestFields.shape) as ReadonlyArray<keyof GuestDraft>;
export const draftOf = (g: GuestDraft): GuestDraft => Object.fromEntries(GUEST_DRAFT_KEYS.map((k) => [k, g[k]])) as unknown as GuestDraft;

/** A substitute is meaningful only while the guest is 'substituted' (contract: Guest.substituteName). */
const substituteOnlyWhenSubstituted = <T extends { rsvpStatus?: RsvpStatus; substituteName?: string }>(d: T): T =>
  d.rsvpStatus !== undefined && d.rsvpStatus !== 'substituted' && d.substituteName ? { ...d, substituteName: '' } : d;

export const guestDraftSchema = guestFields.transform(substituteOnlyWhenSubstituted) as z.ZodType<GuestDraft, unknown>;
export const guestPatchSchema = guestFields.partial().transform(substituteOnlyWhenSubstituted) as z.ZodType<Partial<GuestDraft>, unknown>;

/** A deleted guest as its undo re-creates it: same id and printed check-in code, and the seat to ask venue for again. */
export const guestSnapshotSchema = z.object({
  id: guestIdSchema,
  draft: guestDraftSchema,
  checkinCode: checkinCodeSchema,
  rsvpAt: instantSchema.nullable(),
  seatCode: seatCodeSchema.nullable(),
});
export type GuestSnapshot = z.output<typeof guestSnapshotSchema>;

/** What a new guest starts as: nobody has been invited or answered yet (m4a B40, Q4). */
export const NEW_GUEST_DEFAULTS: GuestDraft = {
  name: '',
  group: 'VIP',
  title: '',
  organization: '',
  phone: '',
  email: null,
  sendMethod: 'direct',
  inviteStatus: 'pending',
  rsvpStatus: 'pending',
  rsvpSource: 'manual',
  substituteName: '',
  hasBanquet: false,
  notes: '',
  masterContactId: null,
};
