import { describe, expect, it } from 'vitest';
import { gateFor, type Aal, type Gate, type Profile } from '@/core/auth';
import { testActor, XTDT } from '@/core/testing/actors';
import { safeNext, screenRedirect, type AuthScreen } from '../domain/auth-routes';

const user = testActor('user', XTDT).profile;
const admin = testActor('admin', null).profile;
type Session = { hasSession: boolean; profile: Profile | null; aal: Aal | null; hasVerifiedTotp: boolean };
const sessions: Array<[string, Session]> = [
  ['no session', { hasSession: false, profile: null, aal: null, hasVerifiedTotp: false }],
  ['pending account', { hasSession: true, profile: { ...user, status: 'pending' }, aal: 'aal1', hasVerifiedTotp: false }],
  ['locked account', { hasSession: true, profile: { ...user, status: 'locked' }, aal: 'aal1', hasVerifiedTotp: false }],
  ['admin without TOTP', { hasSession: true, profile: admin, aal: 'aal1', hasVerifiedTotp: false }],
  ['admin with TOTP at AAL1', { hasSession: true, profile: admin, aal: 'aal1', hasVerifiedTotp: true }],
  ['admin at AAL2', { hasSession: true, profile: admin, aal: 'aal2', hasVerifiedTotp: true }],
  ['user without TOTP', { hasSession: true, profile: user, aal: 'aal1', hasVerifiedTotp: false }],
];
const screens: AuthScreen[] = ['login', 'register', 'pending', 'mfa_challenge', 'mfa_enroll'];

/** Rendered (null) or the redirect, for every session on every screen, through the one gate. */
const expected: Record<string, Record<AuthScreen, string | null>> = {
  'no session': { login: null, register: null, pending: '/login', mfa_challenge: '/login', mfa_enroll: '/login' },
  'pending account': { login: null, register: null, pending: null, mfa_challenge: '/pending', mfa_enroll: '/pending' },
  'locked account': { login: null, register: null, pending: null, mfa_challenge: '/pending?status=locked', mfa_enroll: '/pending?status=locked' },
  'admin without TOTP': { login: null, register: null, pending: '/mfa/enroll', mfa_challenge: '/mfa/enroll', mfa_enroll: null },
  'admin with TOTP at AAL1': { login: null, register: null, pending: '/mfa', mfa_challenge: null, mfa_enroll: '/mfa' },
  'admin at AAL2': { login: '/events', register: '/events', pending: '/events', mfa_challenge: '/events', mfa_enroll: '/events' },
  'user without TOTP': { login: '/events', register: '/events', pending: '/events', mfa_challenge: '/events', mfa_enroll: '/events' },
};

describe('screenRedirect over gateFor', () => {
  const cases = sessions.flatMap(([label, s]) => screens.map((screen) => [label, screen, gateFor(s)] as [string, AuthScreen, Gate]));
  it.each(cases)('%s on %s', (label, screen, gate) => {
    expect(screenRedirect(screen, gate, null)).toBe(expected[label]![screen]);
  });

  it('returns a finished session to the page it asked for', () => {
    expect(screenRedirect('mfa_challenge', { kind: 'ok' }, '/admin/backups?x=1')).toBe('/admin/backups?x=1');
  });
});

describe('safeNext', () => {
  it.each([
    ['/events/abc/plan', '/events/abc/plan'],
    ['/reset-password', '/reset-password'],
    ['//evil.example', null],
    ['/\\evil.example', null],
    ['https://evil.example/x', null],
    ['javascript:alert(1)', null],
    ['/login?next=/x', null],
    ['/mfa', null],
    ['/auth/callback', null],
    ['/a\nb', null],
    [null, null],
  ])('%s -> %s', (raw, out) => {
    expect(safeNext(raw)).toBe(out);
  });
});
