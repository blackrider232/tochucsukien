// Where each sign-in screen sends a session, from the one gate (gateFor) the
// proxy and requestContext() use. Pure, so every gate x screen pair is tested.

import { GATE_PATHS, type Gate } from '@/core/auth';

export const LANDING = '/events';

/** A same-origin path to return to after sign-in, or null. Refuses '//host', '/\\host' and absolute URLs (open redirect). */
export function safeNext(raw: string | null | undefined): `/${string}` | null {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
  if (/[\u0000-\u001f]/.test(raw)) return null;
  if (/^\/(?:auth\/|(?:login|register|mfa|pending)(?:\/|\?|$))/.test(raw)) return null;
  return raw as `/${string}`;
}

export type AuthScreen = 'login' | 'register' | 'pending' | 'mfa_challenge' | 'mfa_enroll';

/**
 * Where a screen redirects instead of rendering, or null to render it. A finished
 * session leaves every screen for `next`. Sign-in and sign-up render for any
 * unfinished session, so a pending account can sign in as someone else. The
 * pending and MFA screens render only for their own gate and send any other
 * session to its gate.
 */
export function screenRedirect(screen: AuthScreen, gate: Gate, next: string | null): string | null {
  if (gate.kind === 'ok') return safeNext(next) ?? LANDING;
  if (screen === 'login' || screen === 'register') return null;
  const own: Gate['kind'][] = screen === 'pending' ? ['pending', 'locked'] : [screen];
  return own.includes(gate.kind) ? null : GATE_PATHS[gate.kind];
}
