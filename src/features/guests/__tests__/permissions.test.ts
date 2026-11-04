import { describe, expect, it, vi } from 'vitest';
import type { CommandId } from '@/core/commands';
import { testActor, XTDT } from '@/core/testing/actors';
import { commands } from '../server/commands';
import { inputs } from './command-inputs';
import { harness } from './harness';

// Every role holds guests.read and guests.write alike, so no actor in the matrix can tell the two apart. This stands in
// for a role that reads but may not write, and checks each command asks for the write permission.
const grants = vi.hoisted(() => ({ withholdWrite: false }));
vi.mock('@/core/permissions', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/core/permissions')>();
  return { ...real, can: (...args: Parameters<typeof real.can>) => !(grants.withholdWrite && args[1] === 'guests.write') && real.can(...args) };
});

const xtdtUser = testActor('user', XTDT);

describe('every guest command requires guests.write, not just guests.read', () => {
  it.each(Object.keys(commands))('guests.%s is refused to an actor who may read but not write', async (verb) => {
    const h = harness();
    const eventId = await h.createEvent();
    const guest = await h.addGuest(xtdtUser, eventId);
    const input = inputs(eventId, guest)[verb as keyof ReturnType<typeof inputs>] as never;
    const before = { guests: h.rows('sce_tcsk_guests'), audits: h.audits().length };

    grants.withholdWrite = true;
    try {
      expect(await h.run(xtdtUser, `guests.${verb}` as CommandId, input)).toMatchObject({ ok: false, kind: 'forbidden' });
    } finally {
      grants.withholdWrite = false;
    }
    expect({ guests: h.rows('sce_tcsk_guests'), audits: h.audits().length }).toEqual(before);
    // The same call goes through once write is granted, so the refusal above is the permission and nothing else.
    expect((await h.run(xtdtUser, `guests.${verb}` as CommandId, input)).ok).toBe(true);
  });
});
