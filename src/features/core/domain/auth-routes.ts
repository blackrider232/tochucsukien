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

/** How long after opening a recovery link the session may set a password without the old one. */
export const RECOVERY_WINDOW_SECONDS = 15 * 60;

export type ResetPasswordView = { kind: 'request' } | { kind: 'recovery' } | { kind: 'change' } | { kind: 'redirect'; to: string };

/**
 * /reset-password: the email form without a session; for a finished session, the
 * new-password form only within the window after a recovery sign-in (from the
 * session's amr claim), else the form that asks for the current password. An
 * unfinished session goes to its gate, the MFA ones coming back here.
 */
export function resetPasswordView(gate: Gate, recoveryAge: number | null): ResetPasswordView {
  switch (gate.kind) {
    case 'login':
      return { kind: 'request' };
    case 'pending':
    case 'locked':
      return { kind: 'redirect', to: GATE_PATHS[gate.kind] };
    case 'mfa_challenge':
    case 'mfa_enroll':
      return { kind: 'redirect', to: `${GATE_PATHS[gate.kind]}?next=${encodeURIComponent('/reset-password')}` };
    case 'ok':
      return recoveryAge !== null && recoveryAge <= RECOVERY_WINDOW_SECONDS ? { kind: 'recovery' } : { kind: 'change' };
  }
}
