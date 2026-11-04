// Server-only. Turns an emailed Supabase link (sign-up confirmation, password
// recovery) into a session cookie: a PKCE ?code=, or ?token_hash=&type= from a
// custom email template. The route handler at /auth/callback picks the pages.

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabaseEnv } from './env';

const OTP_TYPES: ReadonlySet<string> = new Set(['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']);

export async function exchangeAuthLink(request: NextRequest, to: { ok: string; failed: string }): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const env = supabaseEnv();
  let response = NextResponse.redirect(new URL(to.ok, request.url));
  if (!env) return NextResponse.redirect(new URL(to.failed, request.url));

  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        response = NextResponse.redirect(new URL(to.ok, request.url));
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const code = params.get('code');
  const tokenHash = params.get('token_hash');
  const type = params.get('type');
  let ok = false;
  try {
    if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
    else if (tokenHash && type && OTP_TYPES.has(type)) ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType })).error;
  } catch {
    ok = false;
  }
  return ok ? response : NextResponse.redirect(new URL(to.failed, request.url));
}
