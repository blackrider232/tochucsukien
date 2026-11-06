import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const events = vi.hoisted(() => ({ list: [] as Array<{ id: string; eventDate: string }> }));
vi.mock('@/core/auth/server', () => ({ requestContext: async () => ({}) }));
vi.mock('@/features/progress/server', () => ({ listEvents: async () => events.list }));
vi.mock('@/core/dates', async (orig) => ({ ...(await orig<typeof import('@/core/dates')>()), todayVN: () => '2026-11-06' }));

import GoPage from '../page';

const go = (nav: string) => GoPage({ params: Promise.resolve({ nav }) });
const redirectsTo = async (nav: string) => {
  try {
    await go(nav);
  } catch (e) {
    const err = e as { digest?: string };
    if (err.digest?.startsWith('NEXT_REDIRECT')) return err.digest.split(';')[2];
    if (err.digest === 'NEXT_HTTP_ERROR_FALLBACK;404') return '404';
    throw e;
  }
  return null;
};

describe('/go/[nav]', () => {
  beforeEach(() => {
    events.list = [];
  });

  it('goes to the nearest upcoming event the actor can see', async () => {
    events.list = [
      { id: 'past', eventDate: '2026-10-01' },
      { id: 'later', eventDate: '2026-12-20' },
      { id: 'soon', eventDate: '2026-11-26' },
    ];
    expect(await redirectsTo('guests')).toBe('/events/soon/guests');
    expect(await redirectsTo('booths')).toBe('/events/soon/booths');
  });

  it('falls back to the latest past event when none is upcoming', async () => {
    events.list = [
      { id: 'old', eventDate: '2026-01-05' },
      { id: 'recent', eventDate: '2026-10-30' },
    ];
    expect(await redirectsTo('guests')).toBe('/events/recent/guests');
  });

  it('shows an empty state, not a 404, when there is no event', async () => {
    render(await go('guests'));
    expect(screen.getByText('Chưa có sự kiện nào')).toBeTruthy();
  });

  it('refuses a segment the manifests do not declare', async () => {
    events.list = [{ id: 'e1', eventDate: '2026-11-26' }];
    expect(await redirectsTo('..%2Fadmin')).toBe('404');
    expect(await redirectsTo('nope')).toBe('404');
  });
});
