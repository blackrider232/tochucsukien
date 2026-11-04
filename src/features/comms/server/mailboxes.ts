// Sender mailboxes (m4c §1.11). Admin only, enforced here and by RLS (m4a B07,
// m4c B9). Exactly one default whenever any mailbox exists: the partial
// unique index forbids two, and these commands never leave none. Undo runs
// the same rules (restore is a save, not a raw insert).

import { z } from 'zod';
import type { MailboxId } from '@/core/brand';
import { CommandError, type CommandContext, type CommandSpec, type InputOf } from '@/core/commands';
import { DbError } from '@/core/db';
import type { SenderMailbox } from '../contract';
import { mailboxDraftSchema, mailboxIdSchema, versionSchema, type MailboxDraft } from '../domain/schemas';
import { asSchema, audit, inverse } from './command-kit';
import { mailboxesTable, type MailboxRow } from './tables';

const admin = { perm: 'comms.mailboxes.admin', global: true } as const;

export const toMailbox = (r: MailboxRow): SenderMailbox => ({ id: r.id, displayName: r.displayName, email: r.email, clientId: r.clientId, isDefault: r.isDefault, version: r.version });
const draftOf = (r: MailboxRow): MailboxDraft => ({ displayName: r.displayName, email: r.email, clientId: r.clientId, isDefault: r.isDefault });
const label = (m: Pick<MailboxRow, 'displayName' | 'email'>) => `"${m.displayName}" <${m.email}>`;

/**
 * The one write path for a mailbox. Order: refuse a stale version and a taken address first, then clear the other
 * default, then write this row against its version; if that write fails, the other default is put back.
 */
async function writeMailbox(
  ctx: CommandContext, id: MailboxId, draft: MailboxDraft, expected: MailboxRow | null, promote: MailboxId | null = null,
): Promise<{ row: MailboxRow; demoted: MailboxRow | null; promoted: MailboxRow | null }> {
  const all = await ctx.db.table(mailboxesTable).list();
  const self = all.find((m) => m.id === id) ?? null;
  if ((self === null) !== (expected === null) || (self && expected && self.version !== expected.version)) throw new DbError('conflict');
  if (all.some((m) => m.id !== id && m.email === draft.email)) {
    throw new CommandError('invalid', 'Địa chỉ email này đã có trong danh sách hòm thư.', { email: 'Email đã được cấu hình cho hòm thư khác' });
  }
  const others = all.filter((m) => m.id !== id);
  const currentDefault = others.find((m) => m.isDefault) ?? null;
  // The first mailbox is the default; the default cannot be switched off without choosing another one.
  const isDefault = draft.isDefault || !currentDefault;
  const successor = self?.isDefault && !draft.isDefault ? (others.find((m) => m.id === promote) ?? null) : null;
  if (self?.isDefault && !draft.isDefault && others.length > 0 && !successor) {
    throw new CommandError('invalid', 'Hãy đặt một hòm thư khác làm mặc định thay cho hòm thư này.', { isDefault: 'Luôn cần một hòm thư mặc định' });
  }
  const demoted = isDefault && currentDefault ? await ctx.db.table(mailboxesTable).update(currentDefault.id, { isDefault: false }, { expectedVersion: currentDefault.version }) : null;
  const next = { ...draft, isDefault: successor ? false : isDefault };
  let row: MailboxRow;
  try {
    row = self
      ? await ctx.db.table(mailboxesTable).update(id, next, { expectedVersion: self.version })
      : await ctx.db.table(mailboxesTable).insert({ ...next, id, legacyId: null });
  } catch (e) {
    if (demoted) await ctx.db.table(mailboxesTable).update(demoted.id, { isDefault: true }, { expectedVersion: demoted.version });
    throw e;
  }
  if (!successor) return { row, demoted, promoted: null };
  try {
    const promoted = await ctx.db.table(mailboxesTable).update(successor.id, { isDefault: true }, { expectedVersion: successor.version });
    return { row, demoted, promoted };
  } catch (e) {
    await ctx.db.table(mailboxesTable).update(id, { isDefault: true }, { expectedVersion: row.version });
    throw e;
  }
}

export const saveMailbox: CommandSpec<InputOf<'comms.saveMailbox'>, SenderMailbox> = {
  kind: 'mutation',
  input: asSchema(z.object({ id: mailboxIdSchema, version: versionSchema.nullable(), draft: mailboxDraftSchema, promote: mailboxIdSchema.nullable().optional() })),
  authorize: admin,
  async run(ctx, { id, version, draft, promote }) {
    const before = version === null ? null : await ctx.db.table(mailboxesTable).get(id);
    if (version !== null && (!before || before.version !== version)) throw new DbError('conflict');
    const { row, demoted, promoted } = await writeMailbox(ctx, id, draft, before, promote ?? null);
    const extra = `${demoted ? `; bỏ mặc định ${label(demoted)}` : ''}${promoted ? `; đặt ${label(promoted)} làm mặc định` : ''}`;
    const summary = before ? `Cập nhật hòm thư gửi ${label(row)}${row.isDefault && !before.isDefault ? ', đặt làm mặc định' : ''}${extra}` : `Thêm hòm thư gửi ${label(row)}${row.isDefault ? ' (mặc định)' : ''}${extra}`;
    return {
      value: toMailbox(row),
      audit: audit(before ? 'CẬP NHẬT HÒM THƯ GỬI' : 'THÊM HÒM THƯ GỬI', summary, null, 'mailbox', id),
      inverse: before
        ? inverse('comms.saveMailbox', { id, version: row.version, draft: draftOf(before), promote: demoted?.id ?? null }, `Sửa hòm thư ${row.displayName}`)
        : inverse('comms.deleteMailbox', { id, version: row.version }, `Thêm hòm thư ${row.displayName}`),
    };
  },
};

export const deleteMailbox: CommandSpec<InputOf<'comms.deleteMailbox'>, null> = {
  kind: 'mutation',
  input: asSchema(z.object({ id: mailboxIdSchema, version: versionSchema })),
  authorize: admin,
  async run(ctx, { id, version }) {
    const row = await ctx.db.table(mailboxesTable).get(id);
    if (!row) throw new DbError('not_found');
    await ctx.db.table(mailboxesTable).remove(id, { expectedVersion: version });
    let promoted: MailboxRow | null = null;
    if (row.isDefault) {
      const next = (await ctx.db.table(mailboxesTable).list())[0];
      if (next) promoted = await ctx.db.table(mailboxesTable).update(next.id, { isDefault: true }, { expectedVersion: next.version });
    }
    return {
      value: null,
      audit: audit('XÓA HÒM THƯ GỬI', `Xóa hòm thư gửi ${label(row)}${promoted ? `; đặt ${label(promoted)} làm mặc định` : ''}`, null, 'mailbox', id),
      inverse: inverse('comms.restoreMailbox', { id, draft: draftOf(row) }, `Xóa hòm thư ${row.displayName}`),
    };
  },
};

/** The undo of a delete: the same id, saved through writeMailbox, so the address and default rules hold again. */
export const restoreMailbox: CommandSpec<InputOf<'comms.restoreMailbox'>, SenderMailbox> = {
  kind: 'mutation',
  input: asSchema(z.object({ id: mailboxIdSchema, draft: mailboxDraftSchema })),
  authorize: admin,
  async run(ctx, { id, draft }) {
    const { row, demoted } = await writeMailbox(ctx, id, draft, null);
    return {
      value: toMailbox(row),
      audit: audit('KHÔI PHỤC HÒM THƯ GỬI', `Khôi phục hòm thư gửi ${label(row)}${demoted ? `; bỏ mặc định ${label(demoted)}` : ''}`, null, 'mailbox', id),
      inverse: inverse('comms.deleteMailbox', { id, version: row.version }, `Khôi phục hòm thư ${row.displayName}`),
    };
  },
};
