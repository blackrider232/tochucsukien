// Server-only. Creates an auth user with the service role so the calling
// admin's own session is untouched (core B8). The DB trigger then inserts a
// pending 'user' profile; core.users.create sets role, department and status
// through the profile functions, as the admin, so those re-check and audit.

import { createClient } from '@supabase/supabase-js';
import type { Email, UserId } from '@/core/brand';
import { DbError } from '@/core/db';
import type { DepartmentName } from '@/core/vocab';
import { requireSupabaseEnv } from './env';

export async function createAuthUser(input: { email: Email; password: string; fullname: string; department: DepartmentName }): Promise<UserId> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new DbError('unavailable', { table: 'auth.users' });
  const admin = createClient(requireSupabaseEnv().url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.admin.createUser({
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
