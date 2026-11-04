import { describe, expect, it } from 'vitest';
import { newId, type ContactId, type Email, type Version } from '@/core/brand';
import { RESET_PHRASE } from '../domain/schemas';
import { searchTextOf } from '../domain/search';
import { SAMPLE_CONTACTS } from '../domain/sample-contacts';
import { admin, cid, draft, harness, staff } from './harness';

const auditOf = (h: ReturnType<typeof harness>) => h.audits().map((a) => ({ action: a.action, summary: a.summary }));
const last = (h: ReturnType<typeof harness>) => h.audits().at(-1) as { action: string; summary: string; entity: string; entity_id: string };

describe('directory.create', () => {
  it('stores the contact with a folded search_text, audits it, and undo removes it', async () => {
    const h = harness();
    const id = cid();
    const r = await h.ok(admin, 'directory.create', { id, draft: draft({ name: 'Đặng Thị Hồng', organization: 'Ủy ban Mẫu', phone: '0913.210.001', email: 'Hong@Example.com' as Email }) });
    expect(r.value).toMatchObject({ id, name: 'Đặng Thị Hồng', email: 'hong@example.com', version: 1 });
    expect(r.value).not.toHaveProperty('searchText');
    expect(h.rows()[0]).toMatchObject({ search_text: searchTextOf(r.value), legacy_id: null });
    expect(h.rows()[0]!.search_text).toBe('dang thi hong uy ban mau 0913.210.001 0913210001 hong@example.com');
    expect(last(h)).toMatchObject({ action: 'THÊM ĐỐI TƯỢNG CSDL', summary: 'Thêm vào CSDL khách mời: "Đặng Thị Hồng" (Ủy ban Mẫu), nhóm VIP', entity: 'master_contact', entity_id: id });
    expect((await h.undo(admin, r.inverse)).ok).toBe(true);
    expect(h.rows()).toEqual([]);
    expect(last(h).action).toBe('XÓA ĐỐI TƯỢNG CSDL');
  });

  it('refuses a second record of the same person unless told to add it anyway (m4c B28)', async () => {
    const h = harness();
    await h.addContact({ name: 'An', organization: 'Sở A', email: 'an@a.vn' as Email });
    const dup = { id: cid(), draft: draft({ name: 'Một người khác', organization: 'Sở B', email: 'AN@a.vn' as Email }) };
    const refused = await h.run(admin, 'directory.create', dup);
    expect(refused).toMatchObject({ ok: false, kind: 'conflict', message: expect.stringContaining('Đã có "An" (Sở A)') });
    expect(h.rows()).toHaveLength(1);
    expect(h.audits()).toHaveLength(1);
    expect((await h.run(admin, 'directory.create', { ...dup, allowDuplicate: true })).ok).toBe(true);
    expect(h.rows()).toHaveLength(2);
  });

  it('converges when the same create is sent twice', async () => {
    const h = harness();
    const input = { id: cid(), draft: draft() };
    await h.ok(admin, 'directory.create', input);
    await h.ok(admin, 'directory.create', { ...input, allowDuplicate: true });
    expect(h.rows()).toHaveLength(1);
  });

  it('rejects bad input with a message per field', async () => {
    const h = harness();
    const r = await h.run(admin, 'directory.create', { id: cid(), draft: draft({ name: ' ', phone: 'abc', email: 'x' as Email }) });
    expect(r).toMatchObject({ ok: false, kind: 'invalid', fieldErrors: { 'draft.name': 'Nhập họ và tên đại biểu / đầu mối', 'draft.phone': expect.stringContaining('không hợp lệ'), 'draft.email': expect.stringContaining('không hợp lệ') } });
    expect(h.rows()).toEqual([]);
  });
});

describe('directory.update', () => {
  it('saves the patch, keeps search_text in step, audits only what changed, and undo puts the old values back', async () => {
    const h = harness();
    const c = await h.addContact({ name: 'An', organization: 'Sở A', title: 'Phó' });
    const r = await h.ok(admin, 'directory.update', { id: c.id, version: c.version, patch: { title: 'Giám đốc', organization: 'Sở Ngoại vụ', notes: c.notes } });
    expect(r.value).toMatchObject({ title: 'Giám đốc', organization: 'Sở Ngoại vụ', version: 2 });
    expect(h.rows()[0]!.search_text).toBe('an giam doc so ngoai vu');
    expect(last(h).summary).toBe('Cập nhật hồ sơ "An" (Sở Ngoại vụ): chức danh, cơ quan');
    expect((await h.undo(admin, r.inverse)).ok).toBe(true);
    expect(h.rows()[0]).toMatchObject({ title: 'Phó', organization: 'Sở A', search_text: 'an pho so a', version: 3 });
  });

  it('writes nothing for a save that changes nothing, and says so', async () => {
    const h = harness();
    const c = await h.addContact();
    const r = await h.ok(admin, 'directory.update', { id: c.id, version: c.version, patch: { name: c.name } });
    expect(r.inverse).toBeUndefined();
    expect(h.rows()[0]!.version).toBe(1);
    expect(last(h).summary).toContain('không có thay đổi');
  });

  it('refuses a stale version before anything is written or audited', async () => {
    const h = harness();
    const c = await h.addContact();
    await h.ok(admin, 'directory.update', { id: c.id, version: c.version, patch: { title: 'Mới' } });
    const before = { rows: h.rows(), audits: h.audits().length };
    const r = await h.run(admin, 'directory.update', { id: c.id, version: c.version, patch: { title: 'Cũ hơn' } });
    expect(r).toMatchObject({ ok: false, kind: 'conflict' });
    expect({ rows: h.rows(), audits: h.audits().length }).toEqual(before);
  });

  it('refuses to turn a contact into a duplicate of another, but lets its own undo through', async () => {
    const h = harness();
    await h.addContact({ name: 'An', organization: 'Sở A', email: 'an@a.vn' as Email });
    const b = await h.addContact({ name: 'Bình', organization: 'Sở B', email: 'binh@b.vn' as Email });
    const input = { id: b.id, version: b.version, patch: { email: 'an@a.vn' as Email } };
    expect(await h.run(admin, 'directory.update', input)).toMatchObject({ ok: false, kind: 'conflict' });
    const r = await h.ok(admin, 'directory.update', { ...input, allowDuplicate: true });
    expect((await h.undo(admin, r.inverse)).ok).toBe(true);
    expect(h.rows()[1]!.email).toBe('binh@b.vn');
  });

  it('answers not found for a contact that is gone', async () => {
    const h = harness();
    expect(await h.run(admin, 'directory.update', { id: cid(), version: 1 as Version, patch: { title: 'x' } })).toMatchObject({ ok: false, kind: 'not_found' });
  });
});

describe('directory.delete and directory.deleteMany', () => {
  it('deletes one contact and undo brings back the same id and fields', async () => {
    const h = harness();
    const c = await h.addContact({ name: 'An', notes: 'Đón cửa A', hasBanquet: true });
    const r = await h.ok(admin, 'directory.delete', { id: c.id, version: c.version });
    expect(h.rows()).toEqual([]);
    expect(last(h)).toMatchObject({ action: 'XÓA ĐỐI TƯỢNG CSDL', entity_id: c.id });
    expect((await h.undo(admin, r.inverse)).ok).toBe(true);
    expect(h.rows()[0]).toMatchObject({ id: c.id, name: 'An', notes: 'Đón cửa A', has_banquet: true, search_text: 'an so tai chinh ha noi' });
  });

  it('stops the whole bulk delete when one row is stale, before deleting any', async () => {
    const h = harness();
    const [a, b, c] = [await h.addContact({ name: 'A', organization: 'O1' }), await h.addContact({ name: 'B', organization: 'O2' }), await h.addContact({ name: 'C', organization: 'O3' })];
    await h.ok(admin, 'directory.update', { id: b.id, version: b.version, patch: { title: 'đổi' } });
    const before = { rows: h.rows(), audits: h.audits().length };
    const r = await h.run(admin, 'directory.deleteMany', { items: [a, b, c].map((x) => ({ id: x.id, version: x.version })) });
    expect(r).toMatchObject({ ok: false, kind: 'conflict', message: expect.stringContaining('1 đối tượng') });
    expect({ rows: h.rows(), audits: h.audits().length }).toEqual(before);
  });

  it('counts a row that no longer exists as stale too', async () => {
    const h = harness();
    const a = await h.addContact();
    expect(await h.run(admin, 'directory.deleteMany', { items: [{ id: a.id, version: a.version }, { id: cid(), version: 1 as Version }] })).toMatchObject({ ok: false, kind: 'conflict' });
    expect(h.rows()).toHaveLength(1);
  });

  it('deletes many, audits the real count, and undo restores every row once', async () => {
    const h = harness();
    const made = [];
    for (let i = 0; i < 5; i++) made.push(await h.addContact({ name: `Khách ${i}`, organization: `Đơn vị ${i}` }));
    const r = await h.ok(admin, 'directory.deleteMany', { items: made.slice(0, 4).map((x) => ({ id: x.id, version: x.version })) });
    expect(r.value).toEqual({ deleted: 4 });
    expect(h.rows()).toHaveLength(1);
    expect(last(h).summary).toBe('Xóa khỏi CSDL khách mời 4 đối tượng');
    const back = await h.undo(admin, r.inverse);
    expect(back).toMatchObject({ ok: true, value: { restored: 4, alreadyThere: 0 } });
    expect(h.rows().map((x) => x.id).sort()).toEqual(made.map((x) => x.id).sort());
    // Undoing twice cannot duplicate anything.
    expect(await h.undo(admin, r.inverse)).toMatchObject({ ok: true, value: { restored: 0, alreadyThere: 4 } });
    expect(h.rows()).toHaveLength(5);
    expect(last(h).summary).toBe('Khôi phục vào CSDL khách mời 0 đối tượng (4 đã có sẵn)');
  });
});

describe('directory.importCsv', () => {
  const item = (over = {}) => ({ id: newId<'MasterContact'>() as ContactId, draft: draft(over) });

  it('adds the new, skips duplicates of the directory and of the batch, and audits those counts', async () => {
    const h = harness();
    await h.addContact({ name: 'Cũ', organization: 'Sở A' });
    const r = await h.ok(admin, 'directory.importCsv', {
      items: [item({ name: 'Cũ', organization: 'Sở A' }), item({ name: 'Mới', organization: 'Sở B' }), item({ name: 'MỚI', organization: 'sở b' }), item({ name: 'Khác', organization: 'Sở C' })],
    });
    expect(r.value).toEqual({ created: 2, skipped: 2 });
    expect(h.rows()).toHaveLength(3);
    expect(last(h).summary).toBe('Nhập CSV vào CSDL khách mời: thêm 2, bỏ qua 2 đối tượng trùng');
  });

  it('undo removes exactly the rows the import made', async () => {
    const h = harness();
    await h.addContact({ name: 'Cũ' });
    const r = await h.ok(admin, 'directory.importCsv', { items: [item({ name: 'Cũ' }), item({ name: 'Mới', organization: 'B' })] });
    expect((await h.undo(admin, r.inverse)).ok).toBe(true);
    expect(h.rows().map((x) => x.name)).toEqual(['Cũ']);
  });

  it('gives a new row its own id when the client sent one that is taken, and its undo leaves the older contact alone', async () => {
    const h = harness();
    const old = await h.addContact({ name: 'Người cũ', organization: 'Sở A' });
    const r = await h.ok(admin, 'directory.importCsv', { items: [{ id: old.id, draft: draft({ name: 'Người khác', organization: 'Sở B' }) }] });
    expect(r.value).toEqual({ created: 1, skipped: 0 });
    expect(h.rows().map((x) => x.name).sort()).toEqual(['Người cũ', 'Người khác']);
    expect(last(h).entity_id).not.toContain(old.id);
    expect((await h.undo(admin, r.inverse)).ok).toBe(true);
    expect(h.rows().map((x) => [x.id, x.name])).toEqual([[old.id, 'Người cũ']]);
  });

  it('never counts or undoes a row that was there before, even when two items share an id', async () => {
    const h = harness();
    const id = cid();
    const r = await h.ok(admin, 'directory.importCsv', { items: [{ id, draft: draft({ name: 'Một', organization: 'A' }) }, { id, draft: draft({ name: 'Hai', organization: 'B' }) }] });
    expect(r.value).toEqual({ created: 2, skipped: 0 });
    expect(h.rows()).toHaveLength(2);
    expect((await h.undo(admin, r.inverse)).ok).toBe(true);
    expect(h.rows()).toEqual([]);
  });

  it('has no undo when it added nothing', async () => {
    const h = harness();
    await h.addContact({ name: 'Cũ' });
    const r = await h.ok(admin, 'directory.importCsv', { items: [item({ name: 'Cũ' })] });
    expect(r.value).toEqual({ created: 0, skipped: 1 });
    expect(r.inverse).toBeUndefined();
  });

  it('refuses a draft the form would refuse, and an empty or oversized batch', async () => {
    const h = harness();
    expect(await h.run(admin, 'directory.importCsv', { items: [item({ phone: 'xyz' })] })).toMatchObject({ ok: false, kind: 'invalid' });
    expect(await h.run(admin, 'directory.importCsv', { items: [] })).toMatchObject({ ok: false, kind: 'invalid' });
    expect(await h.run(admin, 'directory.importCsv', { items: Array.from({ length: 2001 }, () => item()) })).toMatchObject({ ok: false, kind: 'invalid' });
    expect(h.rows()).toEqual([]);
  });
});

describe('sample data (decision 13)', () => {
  it('loads only when asked, never twice, and undo removes it', async () => {
    const h = harness();
    expect(h.rows()).toEqual([]);
    const r = await h.ok(admin, 'directory.loadSample', {});
    expect(r.value).toEqual({ created: SAMPLE_CONTACTS.length, skipped: 0 });
    expect(last(h).summary).toContain('Nạp dữ liệu mẫu (giả)');
    expect(await h.ok(admin, 'directory.loadSample', {})).toMatchObject({ value: { created: 0, skipped: SAMPLE_CONTACTS.length } });
    expect(h.rows()).toHaveLength(SAMPLE_CONTACTS.length);
    expect((await h.undo(admin, r.inverse)).ok).toBe(true);
    expect(h.rows()).toEqual([]);
  });
  it('is clearly fake: every sample says so', () => {
    expect(SAMPLE_CONTACTS.every((c) => /giả|fake|mẫu/i.test(`${c.name} ${c.organization}`))).toBe(true);
    expect(SAMPLE_CONTACTS.every((c) => !c.email || c.email.endsWith('@example.com') || c.email.endsWith('@example.org'))).toBe(true);
  });
});

describe('directory.resetAll', () => {
  it('refuses without the phrase and changes nothing, not even a backup', async () => {
    const h = harness();
    await h.addContact();
    for (const phrase of ['', 'xóa', 'xoa toan bo roi', 'xóa toàn bộ.']) {
      expect(await h.run(admin, 'directory.resetAll', { phrase })).toMatchObject({ ok: false, kind: 'invalid', fieldErrors: { phrase: expect.stringContaining(RESET_PHRASE) } });
    }
    expect(h.rows()).toHaveLength(1);
    expect(h.rows('sce_tcsk_backups')).toEqual([]);
    expect(h.audits()).toHaveLength(1);
  });

  it('backs the directory up first, deletes every row, and audits the count and the backup', async () => {
    const h = harness();
    for (let i = 0; i < 3; i++) await h.addContact({ name: `Khách ${i}`, organization: `Đơn vị ${i}` });
    const r = await h.ok(admin, 'directory.resetAll', { phrase: '  XOA TOAN BO ' });
    expect(r.value).toMatchObject({ deleted: 3 });
    expect(r.inverse).toBeUndefined();
    expect(h.rows()).toEqual([]);
    const backups = h.rows('sce_tcsk_backups');
    expect(backups).toHaveLength(1);
    expect(JSON.stringify(backups[0]!.data)).toContain('Khách 2');
    expect(last(h)).toMatchObject({ action: 'XÓA TOÀN BỘ CSDL KHÁCH MỜI', summary: `Xóa toàn bộ CSDL khách mời: 3 đối tượng. Bản sao lưu #${r.value.backupId} được tạo ngay trước đó` });
  });

  it('is fine on an empty directory and reports zero', async () => {
    const h = harness();
    expect((await h.ok(admin, 'directory.resetAll', { phrase: RESET_PHRASE })).value).toMatchObject({ deleted: 0 });
  });
});

describe('directory.search', () => {
  it('answers the contract shape, ranked and limited, to every role', async () => {
    const h = harness();
    for (let i = 0; i < 12; i++) await h.addContact({ name: `An ${String.fromCharCode(97 + i)}`, organization: `Sở ${i}` });
    await h.addContact({ name: 'Bình', organization: 'Công ty An Phát' });
    const r = await h.ok(staff, 'directory.search', { q: 'AN' });
    expect(r.value).toHaveLength(8);
    expect(r.value.map((c) => c.name)).toEqual(['An a', 'An b', 'An c', 'An d', 'An e', 'An f', 'An g', 'An h']);
    expect(r.value[0]).not.toHaveProperty('searchText');
    expect(r.value[0]).not.toHaveProperty('legacyId');
    expect((await h.ok(staff, 'directory.search', { q: 'an', limit: 50 })).value).toHaveLength(13);
    expect((await h.ok(staff, 'directory.search', { q: 'an', group: 'BaoChi' })).value).toEqual([]);
    expect(h.audits()).toHaveLength(13);
  });
  it('rejects a limit of zero or over the cap', async () => {
    const h = harness();
    expect(await h.run(staff, 'directory.search', { q: 'a', limit: 0 })).toMatchObject({ ok: false, kind: 'invalid' });
    expect(await h.run(staff, 'directory.search', { q: 'a', limit: 201 })).toMatchObject({ ok: false, kind: 'invalid' });
  });
});

describe('every audit row says what happened and names a master_contact', () => {
  it('after a mixed session', async () => {
    const h = harness();
    const c = await h.addContact();
    await h.ok(admin, 'directory.update', { id: c.id, version: c.version, patch: { title: 'x' } });
    await h.ok(admin, 'directory.loadSample', {});
    expect(auditOf(h).map((a) => a.action)).toEqual(['THÊM ĐỐI TƯỢNG CSDL', 'CẬP NHẬT ĐỐI TƯỢNG CSDL', 'NẠP DỮ LIỆU MẪU CSDL']);
    expect(h.audits().every((a) => a.entity === 'master_contact')).toBe(true);
  });
});
