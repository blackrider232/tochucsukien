import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { IsoDate, Version } from '@/core/brand';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { testActor, XTDT } from '@/core/testing/actors';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const { AppContextProvider, useAppContext, useCalendar, useEventChanges, useSettings } = await import('./client');

const value = {
  profile: testActor('user', XTDT).profile,
  settings: { ...DEFAULT_SETTINGS, dailyReportThresholdDays: 7, version: 3 as Version },
  holidays: [{ date: '2026-09-02' as IsoDate, name: 'Quốc khánh', kind: 'holiday' as const }],
};
const wrapper = ({ children }: { children: ReactNode }) => <AppContextProvider value={value}>{children}</AppContextProvider>;

describe('app context hooks', () => {
  it('expose the profile, settings and a holiday-aware calendar', () => {
    const { result } = renderHook(() => ({ ctx: useAppContext(), settings: useSettings(), cal: useCalendar() }), { wrapper });
    expect(result.current.ctx.profile.department).toBe(XTDT);
    expect(result.current.settings.dailyReportThresholdDays).toBe(7);
    expect(result.current.cal.isWorkday('2026-09-02' as IsoDate)).toBe(false);
    expect(result.current.cal.isWorkday('2026-09-03' as IsoDate)).toBe(true);
  });

  it('fail loudly outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useAppContext())).toThrow('inside <AppContextProvider>');
  });

  it('useEventChanges stays disconnected without Supabase configuration', () => {
    const { result } = renderHook(() => useEventChanges('e1', ['sce_tcsk_checkins']));
    expect(result.current).toEqual({ connected: false });
  });
});
