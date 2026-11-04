// The proxy's logic. decideProxy() is pure (table-tested); handleProxy() does
// the I/O: refreshes the Supabase session cookie, reads the profile and AAL.
// It is UX only. requestContext(), the dispatcher and RLS enforce.

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { can } from '@/core/permissions';
import { registry, type Href } from '@/core/registry';
import { supabaseEnv } from './env';
import { GATE_PATHS, gateFor } from './gate';
import type { Aal, Actor, Profile } from './index';
import { parseProfileRow } from './profile';

/** Reachable without a finished session. */
const PUBLIC_PREFIXES = ['/login', '/register', '/reset-password', '/auth/callback', '/pending', '/mfa', '/api/cron/', '/offline'];
/** Where a finished session is sent away from. */
const SIGNED_IN_BOUNCE = new Set(['/login', '/register', '/pending']);
const LANDING = '/events';

export type ProxySession = { profile: Profile | null; aal: Aal; hasVerifiedTotp: boolean } | null;
export type ProxyDecision = { kind: 'next' } | { kind: 'redirect'; to: string };

const isPublic = (pathname: string) => PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : `${p}/`));

export function hrefPath(href: Href): string {
  return href.kind === 'static' ? href.path : `/go/${href.segment}`;
}

export function decideProxy(pathname: string, search: URLSearchParams, session: ProxySession): ProxyDecision {
  const legacyTab = search.get('tab');
  if (legacyTab) {
    const href = registry.legacyRedirect(legacyTab);
    if (href) return { kind: 'redirect', to: hrefPath(href) };
  }

  const gate = gateFor({ hasSession: session !== null, profile: session?.profile ?? null, aal: session?.aal ?? null, hasVerifiedTotp: session?.hasVerifiedTotp ?? false });
  if (isPublic(pathname)) {
    return gate.kind === 'ok' && SIGNED_IN_BOUNCE.has(pathname) ? { kind: 'redirect', to: LANDING } : { kind: 'next' };
  }
  if (gate.kind !== 'ok' || !session?.profile) {
    const to = GATE_PATHS[gate.kind === 'ok' ? 'pending' : gate.kind];
    return { kind: 'redirect', to: gate.kind === 'login' ? `${to}?next=${encodeURIComponent(pathname)}` : to };
  }

  const actor: Actor = { profile: session.profile, aal: session.aal, hasVerifiedTotp: session.hasVerifiedTotp };
  const route = registry.routeFor(pathname);
  if (route && !can(actor, route.permission) && pathname !== LANDING) return { kind: 'redirect', to: `${LANDING}?denied=1` };
  return { kind: 'next' };
}

export async function handleProxy(request: NextRequest): Promise<NextResponse> {
  const env = supabaseEnv();
  if (!env) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  let session: ProxySession = null;
  if (data.user) {
    const [{ data: row }, { data: aal }] = await Promise.all([
      supabase.from('sce_tcsk_profiles').select('*').eq('id', data.user.id).maybeSingle(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    session = { profile: row ? parseProfileRow(row) : null, aal: aal?.currentLevel === 'aal2' ? 'aal2' : 'aal1', hasVerifiedTotp: aal?.nextLevel === 'aal2' };
  }

  const decision = decideProxy(request.nextUrl.pathname, request.nextUrl.searchParams, session);
  if (decision.kind === 'next') return response;
  const redirect = NextResponse.redirect(new URL(decision.to, request.url));
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}
