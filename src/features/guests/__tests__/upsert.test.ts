import { describe, expect, it } from 'vitest';
import { newId, type Email, type GuestId } from '@/core/brand';
import { testActor, XTDT } from '@/core/testing/actors';
import type { GuestDraft } from '../contract';
import { guestIdentityKey } from '../domain/roster';
import { draft, harness } from './harness';

const xtdtUser = testActor('user', XTDT);
const item = (overrides: Partial<GuestDraft>) => ({ id: newId<'Guest'>(), draft: draft(overrides) });
const email = (s: string) => s as Email;

async function setup() {
  const h = harness();
  return { h, eventId: await h.createEvent() };
}

describe('guests.upsertMany dedupes by the one identity rule, guestIdentityKey (m4a B41)', () => {
  it('a record with an email and one without are different identities, in either direction', async () => {
    const { h, eventId } = await setup();
    await h.addGuest(xtdtUser, eventId, { name: 'Có email', organization: 'Công ty A', email: email('co@a.vn') });
    await h.addGuest(xtdtUser, eventId, { name: 'Không email', organization: 'Công ty B' });
    const r = await h.ok(xtdtUser, 'guests.upsertMany', {
      eventId,
      items: [item({ name: 'Có email', organization: 'Công ty A' }), item({ name: 'Không email', organization: 'Công ty B', email: email('khong@b.vn') })],
      onExisting: 'skip',
    });
    expect(r.value).toEqual({ added: 2, updated: 0, skipped: 0 });
  });

  it('two items for the same existing guest do not both write to it (the second used a stale version)', async () => {
    const { h, eventId } = await setup();
    await h.addGuest(xtdtUser, eventId, { name: 'An', email: email('an@a.vn') });
    const r = await h.run(xtdtUser, 'guests.upsertMany', {
      eventId,
      items: [item({ name: 'An', email: email('an@a.vn'), title: 'Giám đốc' }), item({ name: 'An bis', email: email('AN@a.vn'), title: 'Phó giám đốc' })],
      onExisting: 'fill_blanks',
    });
    expect(r).toMatchObject({ ok: true, value: { added: 0, updated: 1, skipped: 1 } });
    expect((await h.roster(xtdtUser, eventId))[0]).toMatchObject({ title: 'Giám đốc' });
  });
});

describe('guests.upsertMany matches the master contact link before the identity key (m4c B27)', () => {
  it('skips an item whose contact the event already has a guest for, though its identity changed', async () => {
    const { h, eventId } = await setup();
    const contact = newId<'MasterContact'>();
    await h.addGuest(xtdtUser, eventId, { name: 'Lê Văn B', organization: 'Sở C', phone: '0912.000.111', masterContactId: contact });
    const r = await h.ok(xtdtUser, 'guests.upsertMany', {
      eventId,
      items: [item({ name: 'Lê Văn B', organization: 'Sở C', phone: '0912.000.111', email: email('b@c.vn'), masterContactId: contact })],
      onExisting: 'skip',
    });
    expect(r.value).toEqual({ added: 0, updated: 0, skipped: 1 });
    expect(await h.roster(xtdtUser, eventId)).toHaveLength(1);
  });

  it('fills the blanks of the guest it found by the link', async () => {
    const { h, eventId } = await setup();
    const contact = newId<'MasterContact'>();
    await h.addGuest(xtdtUser, eventId, { name: 'Lê Văn B', organization: 'Sở C', phone: '0912.000.111', masterContactId: contact });
    const r = await h.ok(xtdtUser, 'guests.upsertMany', {
      eventId,
      items: [item({ name: 'Lê Văn B', organization: 'Sở C', email: email('b@c.vn'), masterContactId: contact })],
      onExisting: 'fill_blanks',
    });
    expect(r.value).toEqual({ added: 0, updated: 1, skipped: 0 });
    expect((await h.roster(xtdtUser, eventId)).map((g) => [g.email, g.masterContactId])).toEqual([['b@c.vn', contact]]);
  });

  it('two items for the same contact in one import add one guest', async () => {
    const { h, eventId } = await setup();
    const contact = newId<'MasterContact'>();
    const r = await h.ok(xtdtUser, 'guests.upsertMany', {
      eventId,
      items: [item({ name: 'An', phone: '0912.000.111', masterContactId: contact }), item({ name: 'An', email: email('an@a.vn'), masterContactId: contact })],
      onExisting: 'skip',
    });
    expect(r.value).toEqual({ added: 1, updated: 0, skipped: 1 });
  });
});

describe('guests.upsertMany scales linearly', () => {
  it('imports 2000 guests into an event of 3000 in well under a second', async () => {
    const { h, eventId } = await setup();
    const existing = Array.from({ length: 3000 }, (_, i) => draft({ name: `Khách ${i}`, organization: `Đơn vị ${i % 50}`, email: email(`khach${i}@a.vn`), phone: `09${String(10000000 + i)}` }));
    await h.seedGuests(eventId, existing);
    // Mostly overlap, few new: the memory Db's own insert is quadratic, which would time the test double, not the command.
    const items = Array.from({ length: 2000 }, (_, i) =>
      item(i < 1900 ? { name: `Trùng ${i}`, email: email(`khach${2999 - i}@a.vn`) } : { name: `Mới ${i}`, organization: `Công ty ${i}` }),
    );
    const started = performance.now();
    const r = await h.ok(xtdtUser, 'guests.upsertMany', { eventId, items, onExisting: 'skip' });
    const ms = performance.now() - started;
    expect(r.value).toEqual({ added: 100, updated: 0, skipped: 1900 });
    expect(ms).toBeLessThan(1000);
  });

  it('adds and skips exactly what a pairwise comparison of identity keys would, on random imports', async () => {
    const names = ['An', 'Bình', 'Chi', 'Dũng'];
    const orgs = ['Sở A', 'Sở B'];
    let seed = 20261104;
    const rand = (n: number) => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed % n;
    };
    const randomDraft = (): GuestDraft =>
      draft({
        name: rand(2) ? names[rand(names.length)]! : `  ${names[rand(names.length)]!.toUpperCase()}`,
        organization: orgs[rand(orgs.length)]!,
        email: rand(3) === 0 ? email(`${['a', 'b', 'c'][rand(3)]}@x.vn`) : null,
        phone: rand(3) === 0 ? ['0912 345 678', '+84 912.345.678', '0988111222'][rand(3)]! : '',
      });
    for (let round = 0; round < 25; round++) {
      const { h, eventId } = await setup();
      const existing = Array.from({ length: rand(8) }, randomDraft);
      await h.seedGuests(eventId, existing);
      const items = Array.from({ length: 1 + rand(12) }, () => ({ id: newId<'Guest'>(), draft: randomDraft() }));
      const expected: GuestId[] = [];
      let skipped = 0;
      for (const { id, draft: d } of items) {
        const same = (o: GuestDraft) => guestIdentityKey(o) === guestIdentityKey(d);
        if (existing.some(same) || expected.some((e) => same(items.find((i) => i.id === e)!.draft))) skipped += 1;
        else expected.push(id);
      }
      const r = await h.ok(xtdtUser, 'guests.upsertMany', { eventId, items, onExisting: 'skip' });
      expect(r.value).toEqual({ added: expected.length, updated: 0, skipped });
      const after = new Set((await h.roster(xtdtUser, eventId)).map((g) => g.id));
      expect(expected.every((id) => after.has(id))).toBe(true);
      expect(after.size).toBe(existing.length + expected.length);
    }
  });
});
