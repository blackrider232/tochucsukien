import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Instant, Version } from '@/core/brand';
import type { RequestContext } from '@/core/auth';
import { buildWorkCalendar } from '@/core/dates';
import { memoryDb } from '@/core/db';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { testActor, XTDT } from '@/core/testing/actors';
import { E1, eventRows } from '@/core/testing/tables';

const actor = testActor('dept_leader', XTDT);
const ctx: RequestContext = {
  actor,
  db: memoryDb({ sce_tcsk_events: eventRows() }, actor),
  settings: { ...DEFAULT_SETTINGS, version: 1 as Version },
  calendar: buildWorkCalendar([]),
  now: '2026-11-04T00:00:00.000Z' as Instant,
};

// The dev memory runtime: dispatch hands runCommand the memoryDb's own writer. Without it and without a service key
// commandAuditWriter is null and every mutation is refused before it runs.
vi.stubEnv('SCE_DEV_MEMORY', '1');
vi.mock('next/dist/compiled/server-only', () => ({}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock('@/core/auth/server', () => ({ loadRequestContext: async () => ({ ok: true, ctx }), createAuthUser: vi.fn() }));
vi.mock('@/features/progress/server', () => import('./__fixtures__/feature-server'));

// check:contract and the import script load the registry before anything else,
// so each test does too. A static cycle through @/core/commands then hands
// dispatch a registry that is not initialized yet.
async function loadLikeCheckContract() {
  const { featureServers } = await import('@/features/registry-server');
  const { NOT_DELETED } = await import('./__fixtures__/feature-server');
  const { dispatch } = await import('./dispatch');
  return { featureServers, NOT_DELETED, dispatch };
}

describe('a feature server that imports defineCommands and CommandError at runtime', () => {
  it('loads with the registry, and dispatch runs its command', async () => {
    const { featureServers, NOT_DELETED, dispatch } = await loadLikeCheckContract();
    expect(Object.keys(featureServers.progress.commands)).toEqual(['restoreEvent']);
    expect(await dispatch('progress.restoreEvent', { id: E1 })).toEqual({ ok: false, kind: 'conflict', message: NOT_DELETED });
  });

  it('keeps the CommandError message all the way to the client toast', async () => {
    const { NOT_DELETED } = await loadLikeCheckContract();
    const { CommandFeedbackProvider, useCommand } = await import('@/core/commands');
    const notes: string[] = [];
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CommandFeedbackProvider value={{ notify: (_tone, text) => notes.push(text) }}>{children}</CommandFeedbackProvider>
    );
    const { result } = renderHook(() => useCommand(), { wrapper });
    await act(() => result.current('progress.restoreEvent', { id: E1 }));
    expect(notes).toEqual([NOT_DELETED]);
  });
});
