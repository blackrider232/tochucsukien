// Every write of the directory feature. Reads and edits of the shared contact
// list are admin-only (directory.admin, m4c B8); the search and the copy into an
// event are open to everyone who may read the directory. Each mutation is
// audited with what it really did, and the ones a person can take back return
// the inverse command their undo runs.

import { z } from 'zod';
import { newId, type ContactId, type EventId, type GuestId, type Version } from '@/core/brand';
import { CommandError, defineCommands, type AuditEntry, type CommandContext, type CommandSpec, type InputOf, type Inverse, type Sig } from '@/core/commands';
import { DbError, type DraftOf, type Schema } from '@/core/db';
import { can } from '@/core/permissions';
import { foldVi } from '@/core/text';
import { GUEST_GROUPS, type GuestGroup } from '@/core/vocab';
import { guestIdentityKey } from '@/features/guests';
import { readRoster } from '@/features/guests/server';
import type { MasterContact } from '../contract';
import {
  DEFAULT_SEARCH_LIMIT, GROUP_VALUES, MAX_BATCH, MAX_SEARCH_LIMIT, RESET_PHRASE,
  contactFields, contactIdSchema, contactPatchSchema, contactSnapshotSchema, draftOf, versionSchema, type ContactDraft, type ContactSnapshot,
} from '../domain/schemas';
import { MAX_CHUNK_ROWS } from '../domain/chunks';
import { SAMPLE_CONTACTS } from '../domain/sample-contacts';
import { searchTextOf } from '../domain/search';
import { contactToGuestDraft, existingContactIds } from '../domain/to-guest';
import { contactsByIds, searchContacts, toContact } from './reads';
import { contactsTable, type ContactRow } from './tables';

declare module '@/core/commands' {
  interface CommandMap {
    'directory.create': Sig<{ id: ContactId; draft: ContactDraft; allowDuplicate?: boolean }, MasterContact>;
    'directory.update': Sig<{ id: ContactId; version: Version; patch: Partial<ContactDraft>; allowDuplicate?: boolean }, MasterContact>;
    'directory.delete': Sig<{ id: ContactId; version: Version }, null>;
    'directory.deleteMany': Sig<{ items: ReadonlyArray<{ id: ContactId; version: Version }> }, { deleted: number }>;
    /** The undo of a delete: the same ids, so the rows other screens remember come back. */
    'directory.restore': Sig<{ contacts: ReadonlyArray<ContactSnapshot> }, { restored: number; alreadyThere: number }>;
    'directory.importCsv': Sig<{ items: ReadonlyArray<{ id: ContactId; draft: ContactDraft }> }, { created: number; skipped: number }>;
    'directory.loadSample': Sig<Record<string, never>, { created: number; skipped: number }>;
    'directory.resetAll': Sig<{ phrase: string }, { deleted: number; backupId: number }>;
    /** Which contacts the event already has a guest for, by guests' identity rule. */
    'directory.eventMatches': Sig<{ eventId: EventId }, { existingIds: ReadonlyArray<ContactId> }>;
    'directory.importToEvent': Sig<
      { eventId: EventId; ids: ReadonlyArray<ContactId>; onExisting: 'skip' | 'fill_blanks' },
      { added: number; updated: number; skipped: number; missing: number }
    >;
  }
}

const asSchema = <T>(s: z.ZodType): Schema<T> => s as unknown as Schema<T>;
const inverse = <K extends Inverse['command']>(command: K, input: InputOf<K>, label: string) => ({ command, input, label }) as Inverse;
const audit = (action: string, summary: string, entityId: string | null, eventId: EventId | null = null): AuditEntry => ({ action, summary, eventId, entity: 'master_contact', entityId });

const adminOnly = { perm: 'directory.admin', global: true } as const;
const who = (c: Pick<MasterContact, 'name' | 'organization'>) => `"${c.name}" (${c.organization})`;

type Spec<I, O> = CommandSpec<I, O>;

const FIELD_LABEL: Record<keyof ContactDraft, string> = {
  name: 'họ tên', group: 'nhóm', title: 'chức danh', organization: 'cơ quan', phone: 'điện thoại', email: 'email',
  address: 'địa chỉ', taxCode: 'mã số thuế', notes: 'ghi chú', hasBanquet: 'tiệc',
};

const draftRow = (id: ContactId, draft: ContactDraft) => ({ ...draft, id, legacyId: null, searchText: searchTextOf(draft) }) as unknown as DraftOf<ContactRow>;
const snapshotOf = (row: ContactRow): ContactSnapshot => ({ id: row.id, draft: draftOf(row) });

/** Contacts by the guests identity key (email, else phone, else name + organization), folded once. */
async function contactsByKey(ctx: CommandContext): Promise<Map<string, ContactRow>> {
  const byKey = new Map<string, ContactRow>();
  for (const row of await ctx.db.table(contactsTable).list()) {
    const key = guestIdentityKey(row);
    if (!byKey.has(key)) byKey.set(key, row);
  }
  return byKey;
}

async function contactOf(ctx: CommandContext, id: ContactId): Promise<ContactRow> {
  const row = await ctx.db.table(contactsTable).get(id);
  if (!row) throw new DbError('not_found');
  return row;
}

const duplicateError = (other: ContactRow) =>
  new CommandError('conflict', `Đã có ${who(other)} trong CSDL (cùng email, số điện thoại hoặc họ tên và cơ quan). Xác nhận "Vẫn thêm" nếu đây là người khác.`);

/**
 * Inserts the drafts whose person the directory lacks and returns the rows it made; the rest are duplicates (m4c B28).
 * A client id is only a hint: insertMany hands back the row already holding an id instead of failing, so an id that is
 * taken, or repeated in the batch, gets a new one here. Otherwise that row would be counted as made and its undo would
 * delete it.
 */
async function insertFresh(ctx: CommandContext, items: ReadonlyArray<{ id: ContactId; draft: ContactDraft }>): Promise<{ created: ContactRow[]; skipped: number }> {
  const known = await contactsByKey(ctx);
  const usedIds = new Set<ContactId>((await contactsByIds(ctx, [...new Set(items.map((i) => i.id))])).map((r) => r.id));
  const fresh: DraftOf<ContactRow>[] = [];
  for (const { id, draft } of items) {
    const key = guestIdentityKey(draft);
    if (known.has(key)) continue;
    // Claimed here so a second item for the same person in this batch is skipped too.
    known.set(key, null as unknown as ContactRow);
    const freeId = usedIds.has(id) ? newId<'MasterContact'>() : id;
    usedIds.add(freeId);
    fresh.push(draftRow(freeId, draft));
  }
  const created = fresh.length > 0 ? await ctx.db.table(contactsTable).insertMany(fresh) : [];
  return { created, skipped: items.length - created.length };
}

const deleteInverse = (rows: ReadonlyArray<ContactRow>, label: string) =>
  inverse('directory.deleteMany', { items: rows.map((r) => ({ id: r.id, version: r.version })) }, label);

const search: Spec<InputOf<'directory.search'>, ReadonlyArray<MasterContact>> = {
  kind: 'query',
  input: asSchema(
    z.object({
      q: z.string().max(200),
      group: z.enum(GROUP_VALUES).optional(),
      limit: z.number().int().min(1).max(MAX_SEARCH_LIMIT).optional(),
    }),
  ),
  authorize: { perm: 'directory.read', global: true },
  async run(ctx, { q, group, limit }) {
    const found = await searchContacts(ctx, { q, ...(group ? { group } : {}), limit: limit ?? DEFAULT_SEARCH_LIMIT });
    return { value: found.items, audit: null };
  },
};

const create: Spec<InputOf<'directory.create'>, MasterContact> = {
  kind: 'mutation',
  input: asSchema(z.object({ id: contactIdSchema, draft: contactFields, allowDuplicate: z.boolean().optional() })),
  authorize: adminOnly,
  async run(ctx, { id, draft, allowDuplicate }) {
    if (!allowDuplicate) {
      const other = (await contactsByKey(ctx)).get(guestIdentityKey(draft));
      if (other && other.id !== id) throw duplicateError(other);
    }
    // The id is the client's, so a retry of the same create converges on the row it made.
    const row = await ctx.db.table(contactsTable).insert(draftRow(id, draft));
    return {
      value: toContact(row),
      audit: audit('THÊM ĐỐI TƯỢNG CSDL', `Thêm vào CSDL khách mời: ${who(row)}, nhóm ${GUEST_GROUPS[row.group].short}`, id),
      inverse: inverse('directory.delete', { id, version: row.version }, `Thêm đối tượng "${row.name}"`),
    };
  },
};

const update: Spec<InputOf<'directory.update'>, MasterContact> = {
  kind: 'mutation',
  input: asSchema(z.object({ id: contactIdSchema, version: versionSchema, patch: contactPatchSchema, allowDuplicate: z.boolean().optional() })),
  authorize: adminOnly,
  async run(ctx, { id, version, patch, allowDuplicate }) {
    const before = await contactOf(ctx, id);
    // The stale version is refused before anything else is looked at or written.
    if (before.version !== version) throw new DbError('conflict');
    const changed = (Object.keys(patch) as (keyof ContactDraft)[]).filter((k) => patch[k] !== undefined && patch[k] !== before[k]);
    if (changed.length === 0) {
      return { value: toContact(before), audit: audit('CẬP NHẬT ĐỐI TƯỢNG CSDL', `Lưu hồ sơ ${who(before)}: không có thay đổi`, id) };
    }
    const next = { ...draftOf(before), ...Object.fromEntries(changed.map((k) => [k, patch[k]])) } as ContactDraft;
    if (!allowDuplicate && changed.some((k) => k === 'name' || k === 'organization' || k === 'email' || k === 'phone')) {
      const other = (await contactsByKey(ctx)).get(guestIdentityKey(next));
      if (other && other.id !== id) throw duplicateError(other);
    }
    const after = await ctx.db.table(contactsTable).update(id, { ...Object.fromEntries(changed.map((k) => [k, next[k]])), searchText: searchTextOf(next) } as Partial<DraftOf<ContactRow>>, { expectedVersion: version });
    const old = Object.fromEntries(changed.map((k) => [k, before[k]])) as Partial<ContactDraft>;
    return {
      value: toContact(after),
      audit: audit('CẬP NHẬT ĐỐI TƯỢNG CSDL', `Cập nhật hồ sơ ${who(after)}: ${changed.map((k) => FIELD_LABEL[k]).join(', ')}`, id),
      inverse: inverse('directory.update', { id, version: after.version, patch: old, allowDuplicate: true }, `Sửa đối tượng "${after.name}"`),
    };
  },
};

const remove: Spec<InputOf<'directory.delete'>, null> = {
  kind: 'mutation',
  input: asSchema(z.object({ id: contactIdSchema, version: versionSchema })),
  authorize: adminOnly,
  async run(ctx, { id, version }) {
    const row = await contactOf(ctx, id);
    await ctx.db.table(contactsTable).remove(id, { expectedVersion: version });
    return {
      value: null,
      audit: audit('XÓA ĐỐI TƯỢNG CSDL', `Xóa khỏi CSDL khách mời: ${who(row)}. Khách mời đã nhập vào sự kiện giữ nguyên, chỉ mất liên kết với CSDL`, id),
      inverse: inverse('directory.restore', { contacts: [snapshotOf(row)] }, `Xóa đối tượng "${row.name}"`),
    };
  },
};

const deleteMany: Spec<InputOf<'directory.deleteMany'>, { deleted: number }> = {
  kind: 'mutation',
  input: asSchema(z.object({ items: z.array(z.object({ id: contactIdSchema, version: versionSchema })).min(1).max(MAX_CHUNK_ROWS) })),
  authorize: adminOnly,
  async run(ctx, { items }) {
    const wanted = new Map(items.map((i) => [i.id, i.version]));
    const rows = await contactsByIds(ctx, [...wanted.keys()]);
    // Every row is checked before the first is deleted: one stale or missing row stops the whole batch.
    const stale = rows.filter((r) => wanted.get(r.id) !== r.version).length + (wanted.size - rows.length);
    if (stale > 0) throw new CommandError('conflict', `${stale} đối tượng đã bị người khác sửa hoặc xóa. Danh sách sẽ được tải lại, hãy chọn lại.`);
    const ids = rows.map((r) => r.id);
    let removed = 0;
    for (let i = 0; i < ids.length; i += 100) removed += await ctx.db.table(contactsTable).removeWhere({ id: ids.slice(i, i + 100) });
    return {
      value: { deleted: removed },
      audit: audit('XÓA ĐỐI TƯỢNG CSDL', `Xóa khỏi CSDL khách mời ${removed} đối tượng`, ids.join(',')),
      inverse: inverse('directory.restore', { contacts: rows.map(snapshotOf) }, `Xóa ${removed} đối tượng`),
    };
  },
};

const restore: Spec<InputOf<'directory.restore'>, { restored: number; alreadyThere: number }> = {
  kind: 'mutation',
  input: asSchema(z.object({ contacts: z.array(contactSnapshotSchema).min(1).max(MAX_CHUNK_ROWS) })),
  authorize: adminOnly,
  async run(ctx, { contacts }) {
    const there = new Set((await contactsByIds(ctx, contacts.map((c) => c.id))).map((r) => r.id));
    const missing = contacts.filter((c) => !there.has(c.id));
    const rows = missing.length > 0 ? await ctx.db.table(contactsTable).insertMany(missing.map((c) => draftRow(c.id, c.draft))) : [];
    return {
      value: { restored: rows.length, alreadyThere: contacts.length - missing.length },
      audit: audit('KHÔI PHỤC ĐỐI TƯỢNG CSDL', `Khôi phục vào CSDL khách mời ${rows.length} đối tượng${there.size > 0 ? ` (${there.size} đã có sẵn)` : ''}`, rows.map((r) => r.id).join(',') || null),
      ...(rows.length > 0 ? { inverse: deleteInverse(rows, `Khôi phục ${rows.length} đối tượng`) } : {}),
    };
  },
};

const importCsv: Spec<InputOf<'directory.importCsv'>, { created: number; skipped: number }> = {
  kind: 'mutation',
  input: asSchema(z.object({ items: z.array(z.object({ id: contactIdSchema, draft: contactFields })).min(1).max(MAX_CHUNK_ROWS) })),
  authorize: adminOnly,
  async run(ctx, { items }) {
    const { created, skipped } = await insertFresh(ctx, items);
    return {
      value: { created: created.length, skipped },
      audit: audit('NHẬP CSV VÀO CSDL', `Nhập CSV vào CSDL khách mời: thêm ${created.length}, bỏ qua ${skipped} đối tượng trùng`, created.map((r) => r.id).join(',') || null),
      ...(created.length > 0 ? { inverse: deleteInverse(created, `Nhập CSV ${created.length} đối tượng`) } : {}),
    };
  },
};

const loadSample: Spec<InputOf<'directory.loadSample'>, { created: number; skipped: number }> = {
  kind: 'mutation',
  input: asSchema(z.object({})),
  authorize: adminOnly,
  async run(ctx) {
    const { created, skipped } = await insertFresh(ctx, SAMPLE_CONTACTS.map((draft) => ({ id: newId<'MasterContact'>(), draft })));
    return {
      value: { created: created.length, skipped },
      audit: audit('NẠP DỮ LIỆU MẪU CSDL', `Nạp dữ liệu mẫu (giả) vào CSDL khách mời: thêm ${created.length}, bỏ qua ${skipped} đã có`, created.map((r) => r.id).join(',') || null),
      ...(created.length > 0 ? { inverse: deleteInverse(created, `Nạp ${created.length} đối tượng mẫu`) } : {}),
    };
  },
};

const resetAll: Spec<InputOf<'directory.resetAll'>, { deleted: number; backupId: number }> = {
  kind: 'mutation',
  input: asSchema(z.object({ phrase: z.string().max(100) })),
  authorize: adminOnly,
  async run(ctx, { phrase }) {
    if (foldVi(phrase) !== foldVi(RESET_PHRASE)) {
      throw new CommandError('invalid', `Gõ đúng cụm từ "${RESET_PHRASE}" để xác nhận.`, { phrase: `Gõ đúng cụm từ "${RESET_PHRASE}".` });
    }
    // The backup comes first: if it cannot be made, nothing is deleted. The undo stack cannot hold the whole directory,
    // so this is how an admin gets it back (Quản trị > Sao lưu).
    const { id: backupId } = await ctx.db.rpc('sce_tcsk_create_backup', { note: 'Trước khi xóa toàn bộ CSDL khách mời', kind: 'manual' });
    const deleted = await ctx.db.table(contactsTable).removeWhere({ group: [...GROUP_VALUES] as GuestGroup[] });
    return {
      value: { deleted, backupId },
      audit: audit('XÓA TOÀN BỘ CSDL KHÁCH MỜI', `Xóa toàn bộ CSDL khách mời: ${deleted} đối tượng. Bản sao lưu #${backupId} được tạo ngay trước đó`, null),
    };
  },
};

/** Both event commands are open to whoever may read the directory and use the event; the first line asks for the second right. */
function requireDirectoryRead(ctx: CommandContext): void {
  if (!can(ctx.actor, 'directory.read')) throw new CommandError('forbidden', 'Bạn không có quyền tra cứu CSDL khách mời.');
}
const onEvent = (perm: 'guests.read' | 'guests.write') => ({ perm, event: (i: { eventId: EventId }) => i.eventId }) as const;

const eventMatches: Spec<InputOf<'directory.eventMatches'>, { existingIds: ReadonlyArray<ContactId> }> = {
  kind: 'query',
  input: asSchema(z.object({ eventId: z.string().refine((v) => v.length > 0).transform((v) => v as EventId) })),
  authorize: onEvent('guests.read'),
  async run(ctx, { eventId }) {
    requireDirectoryRead(ctx);
    const [contacts, roster] = await Promise.all([ctx.db.table(contactsTable).list(), readRoster(ctx, eventId)]);
    return { value: { existingIds: [...existingContactIds(contacts.map(toContact), roster)] }, audit: null };
  },
};

const importToEvent: Spec<InputOf<'directory.importToEvent'>, { added: number; updated: number; skipped: number; missing: number }> = {
  kind: 'mutation',
  input: asSchema(
    z.object({
      eventId: z.string().refine((v) => v.length > 0).transform((v) => v as EventId),
      ids: z.array(contactIdSchema).min(1).max(MAX_BATCH),
      onExisting: z.enum(['skip', 'fill_blanks']),
    }),
  ),
  authorize: onEvent('guests.write'),
  async run(ctx, { eventId, ids, onExisting }) {
    requireDirectoryRead(ctx);
    const distinct = [...new Set(ids)];
    const found = new Map((await contactsByIds(ctx, distinct)).map((r) => [r.id, r]));
    const rows = distinct.flatMap((id) => (found.has(id) ? [found.get(id)!] : []));
    const missing = distinct.length - rows.length;
    if (rows.length === 0) throw new CommandError('not_found', 'Các đối tượng đã chọn không còn trong CSDL. Danh sách sẽ được tải lại.');
    // guests owns the dedupe and the writes; the contact is copied, not moved, and each guest keeps a link to it.
    const result = await ctx.call('guests.upsertMany', {
      eventId,
      items: rows.map((r) => ({ id: newId<'Guest'>() as GuestId, draft: contactToGuestDraft(toContact(r)) })),
      onExisting,
    });
    return {
      value: { ...result, missing },
      audit: audit(
        'NHẬP TỪ CSDL KHÁCH MỜI VÀO SỰ KIỆN',
        `Nhập ${distinct.length} đối tượng từ CSDL khách mời vào sự kiện: thêm ${result.added}, bổ sung thông tin ${result.updated}, bỏ qua ${result.skipped} (đã có hoặc trùng)${missing > 0 ? `, ${missing} không còn trong CSDL` : ''}`,
        null,
        eventId,
      ),
    };
  },
};

export const commands = defineCommands('directory', {
  search, create, update, delete: remove, deleteMany, restore, importCsv, loadSample, resetAll, eventMatches, importToEvent,
});
