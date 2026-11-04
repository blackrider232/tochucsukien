// Zod schemas the comms forms (useZodForm) and commands (input parsing) share.

import { z } from 'zod';
import { parseUuid, type CampaignId, type Email, type EventId, type GuestId, type MailboxId, type RsvpResponseId, type SafeUrl, type Uuid, type Version } from '@/core/brand';
import { parseEmail } from '@/core/text';
import { canIdentify, FORM_FIELDS, type ColumnMap } from './columns';
import { parseFormUrl, toSheetCsvUrl } from './sheet-url';

const uuidOf = <E extends string>() =>
  z.string().refine((v) => parseUuid(v) !== null, 'Mã không hợp lệ').transform((v) => parseUuid<E>(v) as Uuid<E>);
export const eventIdSchema = uuidOf<'Event'>() as z.ZodType<EventId, string>;
export const guestIdSchema = uuidOf<'Guest'>() as z.ZodType<GuestId, string>;
export const mailboxIdSchema = uuidOf<'Mailbox'>() as z.ZodType<MailboxId, string>;
export const responseIdSchema = uuidOf<'RsvpResponse'>() as z.ZodType<RsvpResponseId, string>;
export const campaignIdSchema = uuidOf<'EmailCampaign'>() as z.ZodType<CampaignId, string>;
export const versionSchema = z.number().int().positive().transform((v) => v as Version);

export const requiredEmailSchema = z
  .string({ error: 'Nhập địa chỉ email' })
  .transform((v, ctx) => {
    const email = parseEmail(v);
    if (!email) {
      ctx.addIssue({ code: 'custom', message: 'Email không hợp lệ (ví dụ hopthu@domain.vn)' });
      return z.NEVER;
    }
    return email;
  }) as z.ZodType<Email, string>;

/** Google's web client ids look like 123456789-abc.apps.googleusercontent.com. */
const CLIENT_ID = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/;

export const mailboxDraftSchema = z.object({
  displayName: z.string({ error: 'Nhập tên hòm thư' }).trim().min(1, 'Nhập tên hòm thư').max(120, 'Tối đa 120 ký tự'),
  email: requiredEmailSchema,
  clientId: z
    .string()
    .nullable()
    .transform((v) => (v ?? '').trim())
    .refine((v) => v === '' || CLIENT_ID.test(v), 'Client ID có dạng 123456789-abc.apps.googleusercontent.com')
    .transform((v) => (v === '' ? null : v)),
  isDefault: z.boolean(),
});
export type MailboxDraft = z.output<typeof mailboxDraftSchema>;

const formUrlSchema = z
  .string()
  .nullable()
  .transform((raw, ctx): SafeUrl | null => {
    const v = (raw ?? '').trim();
    if (!v) return null;
    const url = parseFormUrl(v);
    if (!url) {
      ctx.addIssue({ code: 'custom', message: 'Link phải là Google Form (https://forms.gle/… hoặc https://docs.google.com/forms/…)' });
      return z.NEVER;
    }
    return url;
  });
const sheetUrlSchema = z
  .string()
  .nullable()
  .transform((raw, ctx): SafeUrl | null => {
    const v = (raw ?? '').trim();
    if (!v) return null;
    const r = toSheetCsvUrl(v);
    if (!r.ok) {
      ctx.addIssue({ code: 'custom', message: r.message });
      return z.NEVER;
    }
    return r.csvUrl;
  });

export const formConfigSchema = z.object({
  formUrl: formUrlSchema,
  sheetUrl: sheetUrlSchema,
  autoSync: z.boolean(),
  autoAddNewGuests: z.boolean(),
});
export type FormConfig = z.output<typeof formConfigSchema>;

/** Field -> column, each column used once, enough to identify a person. */
export const columnMapSchema = z
  .partialRecord(z.enum(FORM_FIELDS), z.number().int().min(0).max(199))
  .refine((m) => new Set(Object.values(m)).size === Object.values(m).length, 'Mỗi cột chỉ ghép với một thông tin')
  .refine((m) => canIdentify(m), 'Cần ghép ít nhất cột Họ và tên, Email hoặc Số điện thoại') as unknown as z.ZodType<ColumnMap, ColumnMap>;

/** Addresses one comms.startCampaign or comms.releaseDeliveries call takes; a longer run claims in chunks. */
export const MAX_CLAIM_BATCH = 200;

export const deliveryResultSchema = z
  .object({
    guestId: guestIdSchema.nullable(),
    email: requiredEmailSchema,
    recipientName: z.string().trim().max(300),
    status: z.enum(['sent', 'error']),
    providerMessageId: z.string().trim().min(1).max(200).nullable(),
    error: z.string().trim().min(1).max(500).nullable(),
  })
  .refine((r) => (r.status === 'sent' ? r.providerMessageId !== null && r.error === null : r.error !== null && r.providerMessageId === null), {
    message: 'Thư đã gửi cần mã thư của Gmail; thư lỗi cần nội dung lỗi',
  });
export type DeliveryResult = z.output<typeof deliveryResultSchema>;
