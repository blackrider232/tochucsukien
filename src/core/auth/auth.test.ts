import { describe, expect, it } from 'vitest';
import { gateFor, GATE_PATHS, type Aal, type Profile } from '@/core/auth';
import { decideProxy, type ProxySession } from '@/core/auth/proxy';
import { parseHolidayRows, parseProfileRow } from '@/core/auth/profile';
import { testActor, XTDT } from '@/core/testing/actors';

const profileOf = (...args: Parameters<typeof testActor>) => testActor(...args).profile;

describe('gateFor', () => {
  const user = profileOf('user', XTDT);
  const admin = profileOf('admin', null);
  const cases: Array<[string, { hasSession: boolean; profile: Profile | null; aal: Aal | null; hasVerifiedTotp: boolean }, string]> = [
    ['no session', { hasSession: false, profile: null, aal: null, hasVerifiedTotp: false }, 'login'],
    ['session but no profile yet', { hasSession: true, profile: null, aal: 'aal1', hasVerifiedTotp: false }, 'pending'],
    ['pending profile', { hasSession: true, profile: { ...user, status: 'pending' }, aal: 'aal1', hasVerifiedTotp: false }, 'pending'],
    ['locked profile', { hasSession: true, profile: { ...user, status: 'locked' }, aal: 'aal1', hasVerifiedTotp: false }, 'locked'],
    ['locked admin with TOTP', { hasSession: true, profile: { ...admin, status: 'locked' }, aal: 'aal2', hasVerifiedTotp: true }, 'locked'],
    ['admin without TOTP', { hasSession: true, profile: admin, aal: 'aal1', hasVerifiedTotp: false }, 'mfa_enroll'],
    ['leader without TOTP', { hasSession: true, profile: profileOf('leader', 'Ban Giám đốc'), aal: 'aal1', hasVerifiedTotp: false }, 'mfa_enroll'],
    ['admin with TOTP at AAL1', { hasSession: true, profile: admin, aal: 'aal1', hasVerifiedTotp: true }, 'mfa_challenge'],
    ['user with TOTP at AAL1', { hasSession: true, profile: user, aal: 'aal1', hasVerifiedTotp: true }, 'mfa_challenge'],
    ['admin with TOTP at AAL2', { hasSession: true, profile: admin, aal: 'aal2', hasVerifiedTotp: true }, 'ok'],
    ['user without TOTP at AAL1', { hasSession: true, profile: user, aal: 'aal1', hasVerifiedTotp: false }, 'ok'],
    ['dept_leader without TOTP', { hasSession: true, profile: profileOf('dept_leader', XTDT), aal: 'aal1', hasVerifiedTotp: false }, 'ok'],
  ];
  it.each(cases)('%s -> %s', (_label, input, kind) => {
    expect(gateFor(input).kind).toBe(kind);
  });

  it('every unfinished gate has a page', () => {
    expect(GATE_PATHS).toEqual({ login: '/login', pending: '/pending', locked: '/pending?status=locked', mfa_enroll: '/mfa/enroll', mfa_challenge: '/mfa' });
  });
});

describe('decideProxy', () => {
  const q = (s = '') => new URLSearchParams(s);
  const signedIn = (profile: Profile, aal: Aal = 'aal1', hasVerifiedTotp = false): ProxySession => ({ profile, aal, hasVerifiedTotp });
  const user = signedIn(profileOf('user', XTDT));

  it('sends anonymous visitors to login with the page they wanted', () => {
    expect(decideProxy('/events/abc/guests', q(), null)).toEqual({ kind: 'redirect', to: '/login?next=%2Fevents%2Fabc%2Fguests' });
    expect(decideProxy('/login', q(), null)).toEqual({ kind: 'next' });
    expect(decideProxy('/auth/callback', q('code=x'), null)).toEqual({ kind: 'next' });
    expect(decideProxy('/api/cron/rsvp-sync', q(), null)).toEqual({ kind: 'next' });
    expect(decideProxy('/dev/kit', q(), null)).toEqual({ kind: 'next' });
    expect(decideProxy('/dev/role', q(), null)).toEqual({ kind: 'next' });
  });

  it('routes unfinished sessions to their gate page', () => {
    expect(decideProxy('/events', q(), signedIn({ ...profileOf('user', XTDT), status: 'pending' }))).toEqual({ kind: 'redirect', to: '/pending' });
    expect(decideProxy('/events', q(), signedIn({ ...profileOf('user', XTDT), status: 'locked' }))).toEqual({ kind: 'redirect', to: '/pending?status=locked' });
    expect(decideProxy('/admin/users', q(), signedIn(profileOf('admin', null)))).toEqual({ kind: 'redirect', to: '/mfa/enroll' });
    expect(decideProxy('/admin/users', q(), signedIn(profileOf('admin', null), 'aal1', true))).toEqual({ kind: 'redirect', to: '/mfa' });
    expect(decideProxy('/mfa', q(), signedIn(profileOf('admin', null), 'aal1', true))).toEqual({ kind: 'next' });
  });

  it('lets any session sign out, finished or not', () => {
    expect(decideProxy('/auth/signout', q(), signedIn({ ...profileOf('user', XTDT), status: 'pending' }))).toEqual({ kind: 'next' });
    expect(decideProxy('/auth/signout', q(), signedIn(profileOf('admin', null)))).toEqual({ kind: 'next' });
    expect(decideProxy('/auth/signout', q(), user)).toEqual({ kind: 'next' });
  });

  it('bounces a finished session away from login and pending', () => {
    expect(decideProxy('/login', q(), user)).toEqual({ kind: 'redirect', to: '/events' });
    expect(decideProxy('/pending', q(), user)).toEqual({ kind: 'redirect', to: '/events' });
  });

  it('guards routes with the registry permission', () => {
    expect(decideProxy('/events/abc/guests', q(), user)).toEqual({ kind: 'next' });
    expect(decideProxy('/admin/users', q(), user)).toEqual({ kind: 'redirect', to: '/events?denied=1' });
    expect(decideProxy('/admin/halls', q(), user)).toEqual({ kind: 'redirect', to: '/events?denied=1' });
    expect(decideProxy('/admin/halls', q(), signedIn(profileOf('admin', null), 'aal2', true))).toEqual({ kind: 'next' });
  });

  it('never loops on the landing page', () => {
    const noDept = signedIn(profileOf('user', null));
    expect(decideProxy('/events', q(), noDept)).toEqual({ kind: 'next' });
  });

  it('maps legacy ?tab= links to their new home', () => {
    expect(decideProxy('/', q('tab=tab-module4'), user)).toEqual({ kind: 'redirect', to: '/go/guests' });
    expect(decideProxy('/code/index.html', q('tab=tab-admin-halls'), null)).toEqual({ kind: 'redirect', to: '/admin/halls' });
    expect(decideProxy('/events', q('tab=unknown'), user)).toEqual({ kind: 'next' });
  });
});

describe('row parsing', () => {
  it('parses profiles and drops departments outside the registry', () => {
    const p = parseProfileRow({ id: 'u1', email: 'a@sce.vn', fullname: 'A', role: 'user', department: 'Phòng cũ', status: 'active', is_active: true, created_at: '2026-01-01T00:00:00+00:00', updated_at: '2026-01-02T00:00:00+00:00' });
    expect(p).toMatchObject({ department: null, createdAt: '2026-01-01T00:00:00.000Z', role: 'user' });
    expect(() => parseProfileRow({ id: 'u1', role: 'superadmin' })).toThrow();
  });

  it('parses holidays and skips malformed dates', () => {
    expect(parseHolidayRows([{ holiday_date: '2026-09-02', name: 'Quốc khánh', kind: 'holiday' }, { holiday_date: 'x', name: 'y', kind: 'holiday' }])).toEqual([{ date: '2026-09-02', name: 'Quốc khánh', kind: 'holiday' }]);
  });
});
