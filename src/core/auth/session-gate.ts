// Server-only. The gate of the current request for the sign-in screens, which
// render before a session exists. Without Supabase configured (and outside the
// dev memory runtime) there can be no session, so the gate is 'login'.

import type { Gate } from './index';
import { supabaseEnv } from './env';
import { loadRequestContext } from './request-context';
import { devMemoryEnabled } from '@/core/dev/mode';

export async function currentGate(): Promise<Gate> {
  if (!devMemoryEnabled() && !supabaseEnv()) return { kind: 'login' };
  const loaded = await loadRequestContext();
  return loaded.ok ? { kind: 'ok' } : loaded.gate;
}
