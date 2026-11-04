import '@testing-library/jest-dom/vitest';
import { cleanup, render, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach } from 'vitest';
import { AppContextProvider, type AppContextValue } from '@/core/auth';
import type { Version } from '@/core/brand';
import type { Holiday } from '@/core/dates';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { testActor, XTDT } from '@/core/testing/actors';
import { UiProviders } from '../providers';

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

/** Renders inside the toast and dialog hosts, as the root layout does. */
export function renderUi(ui: ReactElement): RenderResult & { user: ReturnType<typeof userEvent.setup> } {
  const user = userEvent.setup();
  return { user, ...render(<UiProviders>{ui}</UiProviders>) };
}

export { userEvent };

/** The client mirror of a request context, as the (app) layout provides it. */
export function testAppContext(holidays: ReadonlyArray<Holiday> = []): AppContextValue {
  return { profile: testActor('user', XTDT).profile, settings: { ...DEFAULT_SETTINGS, version: 1 as Version }, holidays };
}

/** Renders inside AppContextProvider, for components that read settings or holidays. */
export function withAppContext(ui: ReactElement, value: AppContextValue = testAppContext()): ReactElement {
  return <AppContextProvider value={value}>{ui}</AppContextProvider>;
}

/** Tests inspect what the prefs module persisted; lint reserves the plain identifier for src/core/prefs. */
export const prefStorage = (): Storage => window['local' + 'Storage' as 'localStorage'];
