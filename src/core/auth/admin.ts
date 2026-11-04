// Server-only. The one module that holds the service-role client, and it never
// exports it. The service role creates auth users so the calling admin's own
// session is untouched (core B8); the DB trigger then inserts a pending 'user'
// profile, and core.users.create sets role, department and status through the
// profile functions, as the admin, so those re-check and audit. It also writes
// the command pipeline's audit rows, which no user JWT may write.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Email, UserId } from '@/core/brand';
import { DbError, memoryAuditWriter, supabaseAuditWriter, type AuditWriter, type Db } from '@/core/db';
import { devMemoryEnabled } from '@/core/dev/mode';
import type { DepartmentName } from '@/core/vocab';
import { requireSupabaseEnv } from './env';

let service: SupabaseClient | null = null;

/** No session and no storage: every call carries the service key. `unavailable` without SUPABASE_SERVICE_ROLE_KEY. */
function serviceClient(): SupabaseClient {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new DbError('unavailable', { table: 'service_role' });
  service ??= createClient(requireSupabaseEnv().url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return service;
}

/**
 * The audit writer dispatch hands to runCommand for this request's Db: the dev memory runtime's own store, or the
 * service role. Only dispatch calls it (audit-guards.test.ts).
 */
export function commandAuditWriter(db: Db): AuditWriter | null {
  return devMemoryEnabled() ? memoryAuditWriter(db) : supabaseAuditWriter(serviceClient);
}

export async function createAuthUser(input: { email: Email; password: string; fullname: string; department: DepartmentName }): Promise<UserId> {
  const { data, error } = await serviceClient().auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { fullname: input.fullname, department: input.department },
  });
  if (error || !data.user) {
    if (error?.code === 'email_exists' || error?.status === 422) throw new DbError('constraint', { table: 'auth.users', constraint: 'email_exists' });
    throw new DbError('unavailable', { table: 'auth.users' });
  }
  return data.user.id as UserId;
}
