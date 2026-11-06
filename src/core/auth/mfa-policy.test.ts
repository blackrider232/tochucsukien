import { afterEach, describe, expect, it, vi } from 'vitest';
import { aalOk } from '@/core/permissions';
import { testActor } from '@/core/testing/actors';
import { gateFor } from './gate';
import { mfaEnforced } from './mfa-policy';

const admin = testActor('admin', null, { aal: 'aal1', hasVerifiedTotp: false });
const adminWithFactor = testActor('admin', null, { aal: 'aal1', hasVerifiedTotp: true });
const gate = (a: typeof admin) => gateFor({ hasSession: true, profile: a.profile, aal: a.aal, hasVerifiedTotp: a.hasVerifiedTotp });

afterEach(() => vi.unstubAllEnvs());

describe('the MFA switch (MFA_ENFORCED)', () => {
  it('is on by default and for any value but "false"', () => {
    expect(mfaEnforced()).toBe(true);
    vi.stubEnv('MFA_ENFORCED', 'off');
    expect(mfaEnforced()).toBe(true);
    vi.stubEnv('MFA_ENFORCED', 'false');
    expect(mfaEnforced()).toBe(false);
  });

  it('on: an admin without a factor must enrol, one with a factor must challenge', () => {
    expect(gate(admin).kind).toBe('mfa_enroll');
    expect(gate(adminWithFactor).kind).toBe('mfa_challenge');
    expect(aalOk(admin)).toBe(false);
    expect(aalOk(adminWithFactor)).toBe(false);
  });

  it('off: neither enrol nor challenge, and AAL1 is enough, for a role that needs MFA and for one with a factor', () => {
    vi.stubEnv('MFA_ENFORCED', 'false');
    expect(gate(admin).kind).toBe('ok');
    expect(gate(adminWithFactor).kind).toBe('ok');
    expect(aalOk(admin)).toBe(true);
    expect(aalOk(adminWithFactor)).toBe(true);
  });

  it('off still refuses a pending or locked account and a missing session', () => {
    vi.stubEnv('MFA_ENFORCED', 'false');
    const pending = testActor('user', null, { status: 'pending' });
    expect(gate(pending).kind).toBe('pending');
    expect(gateFor({ hasSession: false, profile: null, aal: null, hasVerifiedTotp: false }).kind).toBe('login');
  });
});
