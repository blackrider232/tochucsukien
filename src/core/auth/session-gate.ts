// Server-only. The gate of the current request for the sign-in screens, which
// render before a session exists. Without Supabase configured (and outside the
// dev memory runtime) there can be no session, so the gate is 'login'.

import type { Gate } from './index';
import { supabaseEnv } from './env';
import { cookieClient, loadRequestContext } from './request-context';
import { devMemoryEnabled } from '@/core/dev/mode';

export async function currentGate(): Promise<Gate> {
  if (!devMemoryEnabled() && !supabaseEnv()) return { kind: 'login' };
  const loaded = await loadRequestContext();
  return loaded.ok ? { kind: 'ok' } : loaded.gate;
}

// GoTrue names the method of a session opened from a recovery link 'recovery',
// or 'otp' in versions that file every email link under it.
const RECOVERY_METHODS: ReadonlySet<unknown> = new Set(['recovery', 'otp']);

/** Unix seconds of the latest recovery sign-in in an `amr` claim, or null. The RFC 8176 string form carries no time, so it never counts. */
export function lastRecoveryAt(amr: unknown): number | null {
  if (!Array.isArray(amr)) return null;
  const times = amr.flatMap((e: { method?: unknown; timestamp?: unknown } | null) =>
    e && RECOVERY_METHODS.has(e.method) && typeof e.timestamp === 'number' ? [e.timestamp] : [],
  );
  return times.length > 0 ? Math.max(...times) : null;
}

/**
 * Seconds since this session was opened from a recovery link, or null. Read from
 * its verified JWT, so a URL or a cookie the browser writes cannot claim it.
 */
export async function recoveryProofAge(): Promise<number | null> {
  if (devMemoryEnabled() || !supabaseEnv()) return null;
  const supabase = await cookieClient();
  const { data } = await supabase.auth.getClaims();
  const at = lastRecoveryAt(data?.claims.amr);
  return at === null ? null : Math.floor(Date.now() / 1000) - at;
}
