// Server-only. The one place a Db is built: the user-scoped cookie client,
// after gateFor() said ok. React cache() makes it once per request.

import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { buildWorkCalendar, nowInstant, type Holiday } from '@/core/dates';
import { supabaseDb } from '@/core/db';
import { DEFAULT_SETTINGS, parseSettingsRow, type SystemSettings } from '@/core/settings';
import type { Version } from '@/core/brand';
import { requireSupabaseEnv } from './env';
import { GATE_PATHS, gateFor } from './gate';
import type { Actor, AppContextValue, Gate, Profile, RequestContext } from './index';
import { parseHolidayRows, parseProfileRow } from './profile';

type Loaded = { ok: true; ctx: RequestContext; holidays: ReadonlyArray<Holiday> } | { ok: false; gate: Exclude<Gate, { kind: 'ok' }> };

async function cookieClient() {
  // cookies() first: it marks the route dynamic, so a build never prerenders a page that needs a session.
  const cookieStore = await cookies();
  const env = requireSupabaseEnv();
  return createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // Server components cannot set cookies; the proxy refreshes the session on the next request.
        }
      },
    },
  });
}

/** Like requestContext(), but reports an unfinished session instead of redirecting (dispatch returns it as a failure). */
export const loadRequestContext = cache(async (): Promise<Loaded> => {
  const supabase = await cookieClient();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, gate: { kind: 'login' } };

  const readProfile = async (): Promise<Profile | null> => {
    const { data, error } = await supabase.from('sce_tcsk_profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) throw new Error(`profile read failed: ${error.message}`);
    return data ? parseProfileRow(data) : null;
  };
  let profile = await readProfile();
  if (!profile) {
    await supabase.rpc('sce_tcsk_ensure_profile', {});
    profile = await readProfile();
  }

  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const aal = aalData?.currentLevel === 'aal2' ? 'aal2' : 'aal1';
  const hasVerifiedTotp = aalData?.nextLevel === 'aal2';
  const gate = gateFor({ hasSession: true, profile, aal, hasVerifiedTotp });
  if (gate.kind !== 'ok' || !profile) return { ok: false, gate: gate.kind === 'ok' ? { kind: 'pending' } : gate };

  const actor: Actor = { profile, aal, hasVerifiedTotp };
  const [settingsRes, holidaysRes] = await Promise.all([
    supabase.from('sce_tcsk_system_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('sce_tcsk_holidays').select('holiday_date, name, kind').order('holiday_date'),
  ]);
  if (settingsRes.error || holidaysRes.error) throw new Error('settings or holidays read failed');
  const settings: SystemSettings = settingsRes.data ? parseSettingsRow(settingsRes.data) : { ...DEFAULT_SETTINGS, version: 0 as Version };
  const holidays = parseHolidayRows(holidaysRes.data);
  return {
    ok: true,
    holidays,
    ctx: { actor, db: supabaseDb(supabase, actor), settings, calendar: buildWorkCalendar(holidays), now: nowInstant() },
  };
});

export async function requestContext(): Promise<RequestContext> {
  const loaded = await loadRequestContext();
  if (!loaded.ok) redirect(GATE_PATHS[loaded.gate.kind]);
  return loaded.ctx;
}

/** What the (app) layout hands to AppContextProvider: the non-secret mirror of the request context. */
export async function appContextValue(): Promise<AppContextValue> {
  const ctx = await requestContext();
  const loaded = await loadRequestContext();
  return { profile: ctx.actor.profile, settings: ctx.settings, holidays: loaded.ok ? loaded.holidays : [] };
}

/** Ends this device's session and clears its cookies. Only a route handler may set cookies, so POST /auth/signout calls it. */
export async function signOut(): Promise<void> {
  const supabase = await cookieClient();
  await supabase.auth.signOut({ scope: 'local' });
}
