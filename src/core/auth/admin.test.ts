import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/dist/compiled/server-only', () => ({}));
import { commandAuditWriter } from '@/core/auth/admin';
import { supabaseDb } from '@/core/db';
import { testActor, XTDT } from '@/core/testing/actors';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('commandAuditWriter', () => {
  const db = supabaseDb({}, testActor('user', XTDT));

  it('is null without SUPABASE_SERVICE_ROLE_KEY, so the pipeline refuses a mutation before it runs', () => {
    vi.stubEnv('SCE_DEV_MEMORY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(commandAuditWriter(db)).toBeNull();
  });

  it('is the service-role writer once the key is set', () => {
    vi.stubEnv('SCE_DEV_MEMORY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    expect(commandAuditWriter(db)).toBeTypeOf('function');
  });
});
