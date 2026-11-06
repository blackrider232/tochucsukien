import { ROLES } from '@/core/vocab';
import type { Aal, Gate, Profile } from './index';
import { mfaEnforced } from './mfa-policy';

export function gateFor(input: {
  hasSession: boolean;
  profile: Profile | null;
  aal: Aal | null;
  hasVerifiedTotp: boolean;
}): Gate {
  if (!input.hasSession) return { kind: 'login' };
  if (!input.profile || input.profile.status === 'pending') return { kind: 'pending' };
  if (input.profile.status === 'locked') return { kind: 'locked' };
  if (!mfaEnforced()) return { kind: 'ok' };
  if (ROLES[input.profile.role].requiresMfa && !input.hasVerifiedTotp) return { kind: 'mfa_enroll' };
  if (input.hasVerifiedTotp && input.aal !== 'aal2') return { kind: 'mfa_challenge' };
  return { kind: 'ok' };
}

/** Where the proxy and requestContext() send each unfinished session. */
export const GATE_PATHS: { readonly [K in Exclude<Gate['kind'], 'ok'>]: `/${string}` } = {
  login: '/login',
  pending: '/pending',
  locked: '/pending?status=locked',
  mfa_enroll: '/mfa/enroll',
  mfa_challenge: '/mfa',
};
