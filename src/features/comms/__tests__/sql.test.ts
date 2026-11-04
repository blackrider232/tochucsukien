// @vitest-environment node
// The comms migrations on Postgres (PGlite), applied with all the others on
// the same minimal Supabase stub verify:sql uses: what RLS and the checks let
// an officer write straight to the table, bypassing the commands.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const OFFICER = '00000000-0000-0000-0000-0000000000b1';
const ADMIN = '00000000-0000-0000-0000-00000000000a';
const CAMPAIGN = '0b0e0b0e-0000-5000-8000-000000000001';
const RUN = '0b0e0b0e-0000-4000-8000-000000000002';
let db: PGlite;
let eventId: string;

async function as<T>(user: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated`);
  await db.exec(`select set_config('request.jwt.claim.sub', '${user}', false), set_config('request.jwt.claims', '{"sub":"${user}","aal":"aal1"}', false)`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role`);
  }
}
const delivery = (over: string, values: string) =>
  db.query<{ id: string }>(`insert into public.sce_tcsk_email_deliveries (event_id, campaign_id, email, status${over}) values ('${eventId}', '${CAMPAIGN}', ${values}) returning id`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid, status text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on all functions in schema auth to authenticated, anon;
    grant usage on schema public to authenticated, anon;
    create publication supabase_realtime;
  `);
  const dir = join(process.cwd(), 'supabase', 'migrations');
  for (const f of readdirSync(dir).filter((f) => /^\d{4,14}_.*\.sql$/.test(f)).sort()) await db.exec(readFileSync(join(dir, f), 'utf8'));
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${ADMIN}', 'admin@x.vn', '{}'), ('${OFFICER}', 'a@x.vn', '{"department":"Phòng Xúc tiến đầu tư"}')`);
  await db.query(`select tcsk.bootstrap_first_admin('admin@x.vn')`);
  await db.exec(`update public.sce_tcsk_profiles set status = 'active' where email = 'a@x.vn'`);
  const ev = await as(OFFICER, () => db.query<{ id: string }>(`insert into public.sce_tcsk_events (name, type, event_date, department) values ('HN', 'hoi_nghi', '2026-12-15', 'Phòng Xúc tiến đầu tư') returning id`));
  eventId = ev.rows[0]!.id;
}, 60_000);

describe('sce_tcsk_email_deliveries on Postgres', () => {
  it('an officer who may send cannot pass a row off as imported from the old app (which skips the evidence check)', async () => {
    await expect(as(OFFICER, () => delivery(', imported', `'fake@x.vn', 'sent', true`))).rejects.toThrow(/row-level security/);
    const own = await as(OFFICER, () => delivery(', claim_token', `'a@x.vn', 'queued', '${RUN}'`));
    await expect(as(OFFICER, () => db.query(`update public.sce_tcsk_email_deliveries set status = 'sent', imported = true where id = '${own.rows[0]!.id}'`))).rejects.toThrow(/row-level security/);
  });

  it('a sent row needs Gmail’s id and a time, a queued one the run that holds it', async () => {
    await expect(as(OFFICER, () => delivery('', `'b@x.vn', 'sent'`))).rejects.toThrow(/sent_has_evidence/);
    await expect(as(OFFICER, () => delivery('', `'c@x.vn', 'queued'`))).rejects.toThrow(/queued_has_token/);
    await expect(as(OFFICER, () => delivery(', sent_at, provider_message_id', `'d@x.vn', 'sent', now(), 'msg-1'`))).resolves.toBeDefined();
  });

  it('the import script, which bypasses RLS (the owner role here), still writes imported rows', async () => {
    await expect(delivery(', imported', `'legacy@x.vn', 'sent', true`)).resolves.toBeDefined();
  });
});
