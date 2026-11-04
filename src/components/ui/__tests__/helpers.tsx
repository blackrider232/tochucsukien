import '@testing-library/jest-dom/vitest';
import { cleanup, render, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach } from 'vitest';
import { UiProviders } from '../providers';

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

/** Stand-ins for the core text helpers: the real bodies belong to core and are tested there. */
export const fakeText = {
  foldVi: (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'd').toLowerCase().trim(),
  matchesQuery(query: string, ...haystack: Array<string | null | undefined>) {
    const fold = fakeText.foldVi;
    const hay = fold(haystack.filter(Boolean).join(' '));
    return fold(query).split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
  },
  escapeHtml: (v: unknown) =>
    v === null || v === undefined ? '' : String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!),
  safeSpreadsheetText: (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v),
};
