// The compose model: who receives, from which mailbox, and the message each
// recipient gets. Pure; the QR PNG bytes are passed in.

import { z } from 'zod';
import type { Email, EventId, GuestId, SafeUrl, SeatCode } from '@/core/brand';
import type { OrgIdentity } from '@/core/settings';
import { fileNameStem } from '@/core/text';
import type { GuestGroup } from '@/core/vocab';
import type { SenderMailbox } from '../contract';
import { EMAIL_TEMPLATE_KEYS } from './email-templates';
import { renderMail, type MergeData } from './merge';
import { prepareAttachment, type MailAddress, type MailMessage } from './mime';
import type { GuestRecipient, ScreenEvent } from './screen';

export interface Recipient {
  /** The address; one message per address per campaign (m4a B31). */
  email: Email;
  name: string;
  title: string;
  organization: string;
  group: GuestGroup | null;
  guestId: GuestId | null;
  seatCode: SeatCode | null;
  checkinCode: string | null;
}

export interface ManualRecipient {
  email: Email;
  name: string;
  organization: string;
}

export const fromGuest = (g: GuestRecipient & { email: Email }): Recipient => ({
  email: g.email, name: g.name, title: g.title, organization: g.organization, group: g.group, guestId: g.id, seatCode: g.seatCode, checkinCode: g.checkinCode,
});
export const fromManual = (m: ManualRecipient): Recipient => ({
  email: m.email, name: m.name, title: '', organization: m.organization, group: null, guestId: null, seatCode: null, checkinCode: null,
});

/** Guests first, then typed addresses, one per address: a typed address a guest already has goes as that guest. */
export function selectedRecipients(guests: ReadonlyArray<GuestRecipient>, guestIds: ReadonlySet<string>, manual: ReadonlyArray<ManualRecipient>, manualIds: ReadonlySet<string>): Recipient[] {
  const out: Recipient[] = [];
  const seen = new Set<string>();
  for (const g of guests) {
    if (!guestIds.has(g.id) || !g.email || seen.has(g.email)) continue;
    seen.add(g.email);
    out.push(fromGuest({ ...g, email: g.email }));
  }
  for (const m of manual) {
    if (!manualIds.has(m.email) || seen.has(m.email)) continue;
    seen.add(m.email);
    out.push(fromManual(m));
  }
  return out;
}

export const PERSONAL = 'personal';

export const composeSchema = z.object({
  senderId: z.string().min(1, 'Chọn hòm thư gửi'),
  templateKey: z.enum(EMAIL_TEMPLATE_KEYS),
  subject: z.string().trim().min(1, 'Nhập tiêu đề thư').max(300, 'Tối đa 300 ký tự'),
  body: z.string().trim().min(1, 'Nhập nội dung thư').max(100_000, 'Nội dung quá dài'),
  contactPhone: z.string().trim().max(60, 'Tối đa 60 ký tự'),
  attachQr: z.boolean(),
});
export type Compose = z.output<typeof composeSchema>;

export type SenderChoice =
  | { kind: 'mailbox'; mailbox: SenderMailbox; clientId: string | null }
  | { kind: 'personal'; clientId: string | null };

export function senderChoice(senderId: string, mailboxes: ReadonlyArray<SenderMailbox>, clientIdOf: (m: SenderMailbox | null) => string | null): SenderChoice | null {
  if (senderId === PERSONAL) return { kind: 'personal', clientId: clientIdOf(null) };
  const mailbox = mailboxes.find((m) => m.id === senderId);
  return mailbox ? { kind: 'mailbox', mailbox, clientId: clientIdOf(mailbox) } : null;
}

/**
 * The From address, or why there is none. Gmail sends as the signed-in account, so a unit mailbox can be the From
 * only when that is the account signed in (m4a B29, m4c B46).
 */
export function fromAddress(choice: SenderChoice, signedInEmail: string | null, officerName: string): { ok: true; from: MailAddress } | { ok: false; message: string } {
  if (!signedInEmail) return { ok: false, message: 'Chưa đăng nhập Google.' };
  if (choice.kind === 'personal') return { ok: true, from: { name: officerName, email: signedInEmail as Email } };
  if (choice.mailbox.email !== signedInEmail.toLowerCase()) {
    return { ok: false, message: `Đang đăng nhập Google bằng ${signedInEmail}, khác hòm thư gửi ${choice.mailbox.email}. Hãy đăng nhập đúng hòm thư.` };
  }
  return { ok: true, from: { name: choice.mailbox.displayName, email: choice.mailbox.email } };
}

export interface MessageContext {
  event: ScreenEvent & { id: EventId };
  from: MailAddress;
  officerName: string;
  formUrl: SafeUrl | null;
  org: OrgIdentity;
}

export function mergeDataFor(r: Recipient, compose: Pick<Compose, 'contactPhone'>, ctx: MessageContext): MergeData {
  return {
    event: ctx.event,
    recipient: { name: r.name, title: r.title, organization: r.organization, group: r.group, seatCode: r.seatCode, checkinCode: r.checkinCode },
    sender: { displayName: ctx.from.name, email: ctx.from.email },
    officerName: ctx.officerName,
    contactPhone: compose.contactPhone,
    formUrl: ctx.formUrl,
    org: ctx.org,
  };
}

export const qrFileName = (r: Pick<Recipient, 'name'>) => `The_CheckIn_${fileNameStem(r.name || 'dai_bieu', 60)}.png`;

/** One recipient's message. `qrPng` is the check-in QR of encodeCheckinPayload(event, guest), or null. */
export function invitationMessage(r: Recipient, compose: Compose, ctx: MessageContext, qrPng: Uint8Array | null, opts: { test?: boolean; to?: MailAddress } = {}): MailMessage {
  const mail = renderMail({ subject: compose.subject, html: compose.body }, mergeDataFor(r, compose, ctx));
  return {
    from: ctx.from,
    to: [opts.to ?? { name: r.name, email: r.email }],
    subject: opts.test ? `[Thư thử] ${mail.subject}` : mail.subject,
    html: mail.html,
    text: mail.text,
    attachments: qrPng ? [prepareAttachment({ filename: qrFileName(r), contentType: 'image/png', data: qrPng })] : [],
  };
}

/** A data: URL from the kit's qrPngDataUrl, as bytes. */
export function dataUrlBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
