import type { NextRequest } from 'next/server';
import { exchangeAuthLink } from '@/core/auth/server';
import { LANDING, safeNext } from '@/features/core';

// The emailed links (sign-up confirmation, password recovery) and Google sign-in land here.
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const recovery = params.get('type') === 'recovery' || params.get('next') === '/reset-password';
  const ok = recovery ? '/reset-password' : (safeNext(params.get('next')) ?? LANDING);
  return exchangeAuthLink(request, { ok, failed: recovery ? '/reset-password?notice=link_failed' : '/login?notice=link_failed' });
}
