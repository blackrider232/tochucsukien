import { describe, expect, it } from 'vitest';
import { newId, type ContactId, type Email } from '@/core/brand';
import { testActor, PTDN } from '@/core/testing/actors';
import type { MasterContact } from '../contract';
import { contactToGuestDraft, existingContactIds, guestFieldsFromContact, planEventImport } from '../domain/to-guest';
import { admin, draft, harness, staff } from './harness';

const rival = testActor('user', PTDN);

async function setup() {
  const h = harness();
  return { h, eventId: await h.createEvent() };
}
const importIds = (ids: ContactId[], onExisting: 'skip' | 'fill_blanks' = 'skip') => ({ ids, onExisting });

describe('directory.importToEvent', () => {
  it('copies contacts into the event as pending guests linked to their contact, and counts them (m4c B25)', async () => {
    const { h, eventId } = await setup();
    const a = await h.addContact({ name: 'Lãnh đạo A', group: 'VIP', organization: 'UBND', phone: '0912.345.678', hasBanquet: true, notes: 'Đón cửa A' });
    const b = await h.addContact({ name: 'Doanh nghiệp B', group: 'DoanhNghiep', organization: 'Công ty B', email: 'b@b.vn' as Email, hasBanquet: false });
    const c = await h.addContact({ name: 'Báo C', group: 'BaoChi', organization: 'Báo C' });
    const r = await h.ok(staff, 'directory.importToEvent', { eventId, ...importIds([a.id, b.id, c.id]) });
    expect(r.value).toEqual({ added: 3, updated: 0, skipped: 0, missing: 0 });
    const guests = await h.roster(eventId);
    expect(guests.map((g) => g.name).sort()).toEqual(['Báo C', 'Doanh nghiệp B', 'Lãnh đạo A']);
    const byName = Object.fromEntries(guests.map((g) => [g.name, g]));
    expect(byName['Lãnh đạo A']).toMatchObject({ masterContactId: a.id, rsvpStatus: 'pending', inviteStatus: 'pending', sendMethod: 'direct', rsvpSource: 'import', hasBanquet: true, notes: 'Đón cửa A', phone: '0912.345.678' });
    expect(byName['Doanh nghiệp B']).toMatchObject({ sendMethod: 'email', email: 'b@b.vn', hasBanquet: false });
    expect(byName['Báo C']).toMatchObject({ sendMethod: 'direct' });
    const entry = h.audits().filter((x) => x.action === 'NHẬP TỪ CSDL KHÁCH MỜI VÀO SỰ KIỆN');
    expect(entry).toHaveLength(1);
    expect(entry[0]).toMatchObject({ event_id: eventId, summary: 'Nhập 3 đối tượng từ CSDL khách mời vào sự kiện: thêm 3, bổ sung thông tin 0, bỏ qua 0 (đã có hoặc trùng)' });
  });

  it('skips contacts the event already has and says how many, without touching those guests (m4c B26)', async () => {
    const { h, eventId } = await setup();
    const a = await h.addContact({ name: 'An', organization: 'Sở A', email: 'an@a.vn' as Email, title: 'Giám đốc (CSDL)' });
    const b = await h.addContact({ name: 'Bình', organization: 'Sở B' });
    await h.ok(staff, 'guests.create', { eventId, id: newId<'Guest'>(), draft: { ...contactToGuestDraft(a), title: 'Tên chức vụ riêng của sự kiện', rsvpStatus: 'confirmed' } });
    const r = await h.ok(staff, 'directory.importToEvent', { eventId, ...importIds([a.id, b.id]) });
    expect(r.value).toEqual({ added: 1, updated: 0, skipped: 1, missing: 0 });
    expect((await h.roster(eventId)).find((g) => g.name === 'An')).toMatchObject({ title: 'Tên chức vụ riêng của sự kiện', rsvpStatus: 'confirmed' });
    expect(h.audits().at(-1)!.summary).toContain('thêm 1, bổ sung thông tin 0, bỏ qua 1');
  });

  it('can fill the blanks of a guest it matches, and counts that as updated', async () => {
    const { h, eventId } = await setup();
    const a = await h.addContact({ name: 'An', organization: 'Sở A', email: 'an@a.vn' as Email, title: 'Giám đốc', notes: 'Ghi chú CSDL' });
    await h.ok(staff, 'guests.create', { eventId, id: newId<'Guest'>(), draft: { ...contactToGuestDraft(a), title: '', notes: '', masterContactId: null } });
    const r = await h.ok(staff, 'directory.importToEvent', { eventId, ...importIds([a.id], 'fill_blanks') });
    expect(r.value).toEqual({ added: 0, updated: 1, skipped: 0, missing: 0 });
    expect((await h.roster(eventId))[0]).toMatchObject({ title: 'Giám đốc', notes: 'Ghi chú CSDL', masterContactId: a.id });
  });

  it('copies the same person only once when two contacts are the same person, and importing twice adds nothing', async () => {
    const { h, eventId } = await setup();
    const a = await h.addContact({ name: 'An', organization: 'Sở A', email: 'an@a.vn' as Email });
    const twin = await h.addContact({ name: 'An bản sao', organization: 'Sở khác', email: 'AN@a.vn' as Email }, admin).catch(() => null);
    expect(twin).toBeNull();
    const dup = await h.ok(admin, 'directory.create', { id: newId<'MasterContact'>(), draft: draft({ name: 'An bản sao', organization: 'Sở khác', email: 'an@a.vn' as Email }), allowDuplicate: true });
    const first = await h.ok(staff, 'directory.importToEvent', { eventId, ...importIds([a.id, dup.value.id]) });
    expect(first.value).toEqual({ added: 1, updated: 0, skipped: 1, missing: 0 });
    const again = await h.ok(staff, 'directory.importToEvent', { eventId, ...importIds([a.id, dup.value.id]) });
    expect(again.value).toEqual({ added: 0, updated: 0, skipped: 2, missing: 0 });
    expect(await h.roster(eventId)).toHaveLength(1);
  });

  it('reports contacts that were deleted meanwhile and imports the rest', async () => {
    const { h, eventId } = await setup();
    const a = await h.addContact({ name: 'An', organization: 'Sở A' });
    const r = await h.ok(staff, 'directory.importToEvent', { eventId, ...importIds([a.id, newId<'MasterContact'>() as ContactId]) });
    expect(r.value).toEqual({ added: 1, updated: 0, skipped: 0, missing: 1 });
    expect(h.audits().at(-1)!.summary).toContain('1 không còn trong CSDL');
  });

  it('fails when none of the contacts exist, and writes nothing', async () => {
    const { h, eventId } = await setup();
    const before = h.audits().length;
    expect(await h.run(staff, 'directory.importToEvent', { eventId, ...importIds([newId<'MasterContact'>() as ContactId]) })).toMatchObject({ ok: false, kind: 'not_found' });
    expect(await h.roster(eventId)).toEqual([]);
    expect(h.audits().length).toBe(before);
  });

  it('cannot copy into an event of another department', async () => {
    const { h, eventId } = await setup();
    const a = await h.addContact();
    const r = await h.run(rival, 'directory.importToEvent', { eventId, ...importIds([a.id]) });
    expect(r.ok).toBe(false);
    expect(await h.roster(eventId)).toEqual([]);
  });

  it('copies 2000 contacts in one call within a generous time bound', async () => {
    const { h, eventId } = await setup();
    const rows = Array.from({ length: 2000 }, (_, i) => ({ id: newId<'MasterContact'>() as ContactId, draft: draft({ name: `Khách ${i}`, organization: `Đơn vị ${i % 40}`, email: `k${i}@example.com` as Email }) }));
    await h.ok(admin, 'directory.importCsv', { items: rows });
    const started = performance.now();
    const r = await h.ok(staff, 'directory.importToEvent', { eventId, ...importIds(rows.map((x) => x.id)) });
    const ms = performance.now() - started;
    expect(r.value).toEqual({ added: 2000, updated: 0, skipped: 0, missing: 0 });
    expect(ms).toBeLessThan(15_000);
  }, 60_000);
});

describe('directory.eventMatches and the preview plan agree with what the copy then does', () => {
  it('lists the contacts the event already has', async () => {
    const { h, eventId } = await setup();
    const a = await h.addContact({ name: 'An', organization: 'Sở A', email: 'an@a.vn' as Email });
    await h.addContact({ name: 'Bình', organization: 'Sở B' });
    await h.ok(staff, 'directory.importToEvent', { eventId, ...importIds([a.id]) });
    expect((await h.ok(staff, 'directory.eventMatches', { eventId })).value.existingIds).toEqual([a.id]);
  });

  it('matches on identity, not on the link: an edited guest still counts as the same person', async () => {
    const { h, eventId } = await setup();
    const a = await h.addContact({ name: 'An', organization: 'Sở A', email: 'an@a.vn' as Email });
    await h.ok(staff, 'guests.create', { eventId, id: newId<'Guest'>(), draft: { ...contactToGuestDraft(a), masterContactId: null, name: 'Nguyễn An' } });
    expect((await h.ok(staff, 'directory.eventMatches', { eventId })).value.existingIds).toEqual([a.id]);
  });

  it('counts a guest linked to the contact as existing even after the contact changed its identity (m4c B27)', async () => {
    const { h, eventId } = await setup();
    const b = await h.addContact({ name: 'Lê Văn B', organization: 'Sở C', phone: '0912.000.111' });
    expect((await h.ok(staff, 'directory.importToEvent', { eventId, ...importIds([b.id]) })).value.added).toBe(1);
    const edited = await h.ok(admin, 'directory.update', { id: b.id, version: b.version, patch: { email: 'b@c.vn' as Email } });
    expect((await h.ok(staff, 'directory.eventMatches', { eventId })).value.existingIds).toEqual([b.id]);
    const again = await h.ok(staff, 'directory.importToEvent', { eventId, ...importIds([edited.value.id]) });
    expect(again.value).toEqual({ added: 0, updated: 0, skipped: 1, missing: 0 });
    const guests = await h.roster(eventId);
    expect(guests.map((g) => [g.name, g.masterContactId])).toEqual([['Lê Văn B', b.id]]);
  });

  it('fills the new email into the linked guest when asked to fill blanks', async () => {
    const { h, eventId } = await setup();
    const b = await h.addContact({ name: 'Lê Văn B', organization: 'Sở C', phone: '0912.000.111' });
    await h.ok(staff, 'directory.importToEvent', { eventId, ...importIds([b.id]) });
    await h.ok(admin, 'directory.update', { id: b.id, version: b.version, patch: { email: 'b@c.vn' as Email } });
    const again = await h.ok(staff, 'directory.importToEvent', { eventId, ...importIds([b.id], 'fill_blanks') });
    expect(again.value).toEqual({ added: 0, updated: 1, skipped: 0, missing: 0 });
    expect((await h.roster(eventId)).map((g) => g.email)).toEqual(['b@c.vn']);
  });

  it('plan counts equal the result of the copy, over random selections', async () => {
    let seed = 20261104;
    const rand = (n: number) => ((seed = (seed * 1664525 + 1013904223) % 4294967296) % n);
    for (let round = 0; round < 15; round++) {
      const { h, eventId } = await setup();
      const pool: MasterContact[] = [];
      for (let i = 0; i < 6; i++) {
        const c = await h.ok(admin, 'directory.create', {
          id: newId<'MasterContact'>(),
          draft: draft({ name: `Người ${rand(4)}`, organization: `Sở ${rand(2)}`, email: rand(2) ? (`e${rand(3)}@x.vn` as Email) : null, phone: rand(3) === 0 ? '0912345678' : '' }),
          allowDuplicate: true,
        });
        pool.push(c.value);
      }
      const existing = pool.filter(() => rand(3) === 0);
      for (const c of existing) await h.ok(staff, 'guests.create', { eventId, id: newId<'Guest'>(), draft: contactToGuestDraft(c) }).catch(() => null);
      const selection = pool.filter(() => rand(4) !== 0);
      if (selection.length === 0) continue;
      const roster = await h.roster(eventId);
      const plan = planEventImport(selection, existingContactIds(selection, roster));
      const r = await h.ok(staff, 'directory.importToEvent', { eventId, ids: selection.map((c) => c.id), onExisting: 'skip' });
      expect({ added: plan.fresh.length, skipped: plan.existing.length + plan.repeated.length }).toEqual({ added: r.value.added, skipped: r.value.skipped });
      expect((await h.roster(eventId)).length).toBe(roster.length + r.value.added);
    }
  }, 60_000);
});

describe('what a picked suggestion fills in the guest form (m4c §1.3)', () => {
  const base = { id: 'c' as ContactId, name: 'An', group: 'VIP', title: 'T', organization: 'O', phone: '0912345678', email: null, address: 'đ', taxCode: 'm', notes: '', hasBanquet: true, updatedAt: '' as never, version: 1 as never } as MasterContact;
  it('fills the person and keeps the master link, but not address or tax code', () => {
    expect(guestFieldsFromContact(base)).toEqual({ name: 'An', group: 'VIP', title: 'T', organization: 'O', phone: '0912345678', email: null, hasBanquet: true, masterContactId: 'c' });
  });
  it('carries notes only when the contact has some', () => {
    expect(guestFieldsFromContact({ ...base, notes: 'Đón cửa A' })).toMatchObject({ notes: 'Đón cửa A' });
  });
});
