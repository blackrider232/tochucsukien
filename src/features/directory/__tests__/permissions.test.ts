import { describe, expect, it, vi } from 'vitest';
import type { CommandId } from '@/core/commands';
import { testActor, PTDN } from '@/core/testing/actors';
import { commands } from '../server/commands';
import { ADMIN_VERBS, EVENT_VERBS, READ_VERBS, inputs } from './command-inputs';
import { admin, deptLeader, harness, leader, staff } from './harness';

// directory.read and guests.write are held by every role that can pass the gate, so no actor in the matrix tells them
// apart. This stands in for a role that lacks one of them, and checks each command asks for the right one.
const grants = vi.hoisted(() => ({ withhold: null as string | null }));
vi.mock('@/core/permissions', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/core/permissions')>();
  return { ...real, can: (...args: Parameters<typeof real.can>) => args[1] !== grants.withhold && real.can(...args) };
});

async function withContact() {
  const h = harness();
  const contact = await h.addContact();
  const eventId = await h.createEvent();
  return { h, contact, eventId };
}
const snapshot = (h: ReturnType<typeof harness>) => ({ contacts: h.rows(), audits: h.audits().length, guests: h.rows('sce_tcsk_guests'), backups: h.rows('sce_tcsk_backups') });

describe('the list is edited by directory.admin only (m4c B8)', () => {
  it('covers every verb the feature has', () => {
    expect([...ADMIN_VERBS, ...READ_VERBS, ...EVENT_VERBS].sort()).toEqual(Object.keys(commands).sort());
  });

  const outsiders = [['chuyên viên', staff], ['lãnh đạo phòng', deptLeader], ['Ban Giám đốc', leader], ['chuyên viên phòng khác', testActor('user', PTDN)]] as const;
  for (const [label, actor] of outsiders) {
    it.each(ADMIN_VERBS)(`directory.%s is refused to a ${label}, through RLS and with RLS bypassed`, async (verb) => {
      const { h, contact, eventId } = await withContact();
      const input = inputs(eventId, contact)[verb] as never;
      const before = snapshot(h);
      expect(await h.run(actor, `directory.${verb}` as CommandId, input)).toMatchObject({ ok: false, kind: 'forbidden' });
      expect(await h.runWithoutRls(actor, `directory.${verb}` as CommandId, input)).toMatchObject({ ok: false, kind: 'forbidden' });
      expect(snapshot(h)).toEqual(before);
    });
  }

  it.each(ADMIN_VERBS)('directory.%s works for the admin on the same input', async (verb) => {
    const { h, contact, eventId } = await withContact();
    expect((await h.run(admin, `directory.${verb}` as CommandId, inputs(eventId, contact)[verb] as never)).ok).toBe(true);
  });
});

describe('everyone who may read the directory can search it', () => {
  it.each([['admin', admin], ['leader', leader], ['dept_leader', deptLeader], ['user', staff]] as const)('%s', async (_role, actor) => {
    const { h, contact, eventId } = await withContact();
    expect(await h.run(actor, 'directory.search', inputs(eventId, contact).search)).toMatchObject({ ok: true });
  });

  it('search asks for directory.read', async () => {
    const { h, contact, eventId } = await withContact();
    grants.withhold = 'directory.read';
    try {
      expect(await h.run(staff, 'directory.search', inputs(eventId, contact).search)).toMatchObject({ ok: false, kind: 'forbidden' });
    } finally {
      grants.withhold = null;
    }
  });
});

describe('copying into an event needs both the directory and the event', () => {
  it.each(EVENT_VERBS)('directory.%s is refused without directory.read, and writes nothing', async (verb) => {
    const { h, contact, eventId } = await withContact();
    const before = snapshot(h);
    grants.withhold = 'directory.read';
    try {
      expect(await h.run(staff, `directory.${verb}` as CommandId, inputs(eventId, contact)[verb] as never)).toMatchObject({ ok: false, kind: 'forbidden' });
    } finally {
      grants.withhold = null;
    }
    expect(snapshot(h)).toEqual(before);
  });

  it('importToEvent is refused without guests.write, and eventMatches without guests.read', async () => {
    const { h, contact, eventId } = await withContact();
    const before = snapshot(h);
    for (const [verb, perm] of [['importToEvent', 'guests.write'], ['eventMatches', 'guests.read']] as const) {
      grants.withhold = perm;
      try {
        expect(await h.run(staff, `directory.${verb}` as CommandId, inputs(eventId, contact)[verb] as never)).toMatchObject({ ok: false, kind: 'forbidden' });
      } finally {
        grants.withhold = null;
      }
    }
    expect(snapshot(h)).toEqual(before);
  });

  it('a user of another department cannot copy into the event, nor read its matches, even with RLS bypassed', async () => {
    const { h, contact, eventId } = await withContact();
    const rival = testActor('user', PTDN);
    for (const verb of EVENT_VERBS) {
      const input = inputs(eventId, contact)[verb] as never;
      expect((await h.run(rival, `directory.${verb}` as CommandId, input)).ok).toBe(false);
      expect(await h.runWithoutRls(rival, `directory.${verb}` as CommandId, input)).toMatchObject({ ok: false, kind: 'forbidden' });
    }
    expect(await h.roster(eventId)).toEqual([]);
  });
});
