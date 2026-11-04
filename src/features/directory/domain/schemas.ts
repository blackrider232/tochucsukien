// Zod schemas shared by the contact form (useZodForm) and the commands, so the
// browser and the server validate the same rules. The field rules are a subset
// of the guests feature's, so every contact converts into a valid guest draft.

import { z } from 'zod';
import { parseUuid, type ContactId, type Uuid, type Version } from '@/core/brand';
import { normalizePhone, parseEmail } from '@/core/text';
import type { GuestGroup } from '@/core/vocab';

export const GROUP_VALUES = ['VIP', 'SoNganh', 'DoanhNghiep', 'QuocTe', 'BaoChi'] as const satisfies ReadonlyArray<GuestGroup>;

/** One call may carry a whole directory segment, never an unbounded payload. */
export const MAX_BATCH = 2000;
/** Rows a bulk delete or an undo of one carries: the undo ships every deleted row back. */
export const MAX_BULK_DELETE = MAX_BATCH;
export const MAX_SEARCH_LIMIT = 200;
export const DEFAULT_SEARCH_LIMIT = 8;

const uuidOf = <E extends string>() =>
  z.string().refine((v) => parseUuid(v) !== null, 'Mã không hợp lệ').transform((v) => parseUuid<E>(v) as Uuid<E>);
export const contactIdSchema = uuidOf<'MasterContact'>() as z.ZodType<ContactId, string>;
export const versionSchema = z.number().int().positive().transform((v) => v as Version);

const text = (max: number) => z.string().trim().max(max, `Tối đa ${max} ký tự`);
const required = (max: number, message: string) => z.string({ error: message }).trim().min(1, message).max(max, `Tối đa ${max} ký tự`);

/** Empty, or an address parseEmail accepts (no CR/LF, no display name). The stored value is lowercased. */
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

/** Free text as staff write it ('0913.210.001', '+81 3 1234 5678'); 8 to 15 digits, like a guest's phone. */
const phoneSchema = text(40).refine((v) => {
  if (!v) return true;
  const digits = normalizePhone(v);
  return /^[\d\s.+()-]+$/.test(v) && digits.length >= 8 && digits.length <= 15;
}, 'Số điện thoại không hợp lệ (ví dụ 0912.345.678)');

export const contactFields = z.object({
  name: required(200, 'Nhập họ và tên đại biểu / đầu mối'),
  group: z.enum(GROUP_VALUES, { error: 'Chọn nhóm đối tượng' }),
  title: text(300),
  organization: required(300, 'Nhập cơ quan / doanh nghiệp'),
  phone: phoneSchema,
  email: emailSchema,
  address: text(500),
  taxCode: text(100),
  notes: text(2000),
  hasBanquet: z.boolean(),
});
export type ContactDraft = z.output<typeof contactFields>;

export const CONTACT_DRAFT_KEYS = Object.keys(contactFields.shape) as ReadonlyArray<keyof ContactDraft>;
export const draftOf = (c: ContactDraft): ContactDraft => Object.fromEntries(CONTACT_DRAFT_KEYS.map((k) => [k, c[k]])) as unknown as ContactDraft;

export const contactPatchSchema = contactFields.partial();

/** A new contact starts without a banquet unless it is a VIP (m4c B67, Q4). */
export const defaultBanquet = (group: GuestGroup): boolean => group === 'VIP';

export const NEW_CONTACT_DEFAULTS: ContactDraft = {
  name: '',
  group: 'VIP',
  title: '',
  organization: '',
  phone: '',
  email: null,
  address: '',
  taxCode: '',
  notes: '',
  hasBanquet: true,
};

/** A contact as its undo re-creates it: same id, so a guest linked to it by master_contact_id points at it again. */
export const contactSnapshotSchema = z.object({ id: contactIdSchema, draft: contactFields });
export type ContactSnapshot = z.output<typeof contactSnapshotSchema>;

/** The phrase an admin types to clear the whole directory; compared tone- and case-insensitively. The command checks it too. */
export const RESET_PHRASE = 'xóa toàn bộ';
