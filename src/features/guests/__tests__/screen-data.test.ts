import { describe, expect, it } from 'vitest';
import type { EventId } from '@/core/brand';
import { testActor, XTDT, PTDN } from '@/core/testing/actors';
import { contactsTable } from '@/features/directory/server/tables';
import { guestScreenData } from '../server/screen-data';
import { harness } from './harness';

describe('guestScreenData: what the guest list links to', () => {
  async function setup() {
    const h = harness();
    (h.seed as Record<string, unknown[]>).sce_tcsk_master_contacts = [];
    const owner = testActor('user', XTDT);
    const eventId = await h.createEvent(owner);
    const admin = testActor('admin', null);
    const { memoryDb } = await import('@/core/db');
    await memoryDb(h.seed, admin).table(contactsTable).insert({
      id: 'c0000001-0000-4000-8000-000000000000', name: 'Bà Danh Bạ', group: 'SoNganh', title: '', organization: 'Sở', phone: '', email: null, address: '', taxCode: '', notes: '',
      hasBanquet: false, legacyId: null, searchText: 'ba danh ba',
    } as never);
    return { h, owner, eventId: eventId as EventId };
  }

  it('says whether the actor may open the seating chart and the directory, and ships no contacts unless asked', async () => {
    const { h, owner, eventId } = await setup();
    const data = await guestScreenData(h.ctx(owner), eventId);
    expect(data).toMatchObject({ canWrite: true, canSeeSeating: true, canReadDirectory: true, directoryContacts: null });
  });

  it('loads the contacts for the batch copy only on request, and nothing for an actor who cannot see the event', async () => {
    const { h, owner, eventId } = await setup();
    const asked = await guestScreenData(h.ctx(owner), eventId, { contacts: true });
    expect(asked?.directoryContacts?.map((c) => c.name)).toEqual(['Bà Danh Bạ']);
    const reader = await guestScreenData(h.ctx(testActor('user', PTDN)), eventId, { contacts: true });
    expect(reader).toBeNull();
  });
});
