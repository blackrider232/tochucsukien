// @vitest-environment node
// The comms migrations on Postgres (PGlite), applied with all the others on
// the same minimal Supabase stub verify:sql uses: what RLS and the checks let
// an officer write straight to the table, bypassing the commands.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const OFFICER = '00000000-0000-0000-0000-0000000000b1';
/** A second officer of the same department, who may send too. */
const COLLEAGUE = '00000000-0000-0000-0000-0000000000b2';
const ADMIN = '00000000-0000-0000-0000-00000000000a';
const CAMPAIGN = '0b0e0b0e-0000-5000-8000-000000000001';
const RUN = '0b0e0b0e-0000-4000-8000-000000000002';
const OTHER_RUN = '0b0e0b0e-0000-4000-8000-000000000003';
let db: PGlite;
let eventId: string;

async function as<T>(user: string, fn: () => Promise<T>, aal = 'aal1'): Promise<T> {
  await db.exec(`set role authenticated`);
  await db.exec(`select set_config('request.jwt.claim.sub', '${user}', false), set_config('request.jwt.claims', '{"sub":"${user}","aal":"${aal}"}', false)`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role`);
  }
}
const delivery = (over: string, values: string, campaign = CAMPAIGN) =>
  db.query<{ id: string }>(`insert into public.sce_tcsk_email_deliveries (event_id, campaign_id, email, status${over}) values ('${eventId}', '${campaign}', ${values}) returning id`);
const hashOf = (token: string) => `substr(encode(sha256(convert_to('${token}', 'UTF8')), 'hex'), 1, 32)::uuid`;
/** A claim of `RUN`, as comms.startCampaign writes it: the token's hash, never the token. */
const claim = async (email: string, user = OFFICER, campaign = CAMPAIGN) =>
  (await as(user, () => delivery(', claim_token', `'${email}', 'queued', ${hashOf(RUN)}`, campaign))).rows[0]!.id;
const update = (user: string, id: string, set: string) => as(user, () => db.query<{ id: string }>(`update public.sce_tcsk_email_deliveries set ${set} where id = '${id}' returning id`));
const row = async (id: string) =>
  (await db.query<{ status: string; claim_token: string; claim_proof: string | null; provider_message_id: string | null }>(`select status, claim_token, claim_proof, provider_message_id from public.sce_tcsk_email_deliveries where id = '${id}'`)).rows[0];
/** Moves a row's last write back in time, as a backup restore may (the stamp trigger is off while restoring). */
async function age(id: string, minutes: number) {
  await db.exec(`select set_config('sce.restoring', 'on', false)`);
  await db.exec(`update public.sce_tcsk_email_deliveries set updated_at = now() - interval '${minutes} minutes' where id = '${id}'`);
  await db.exec(`select set_config('sce.restoring', '', false)`);
}

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
  await db.exec(
    `insert into auth.users (id, email, raw_user_meta_data) values ('${ADMIN}', 'admin@x.vn', '{}'), ('${OFFICER}', 'a@x.vn', '{"department":"Phòng Xúc tiến đầu tư"}'), ('${COLLEAGUE}', 'b@x.vn', '{"department":"Phòng Xúc tiến đầu tư"}')`,
  );
  await db.query(`select tcsk.bootstrap_first_admin('admin@x.vn')`);
  await db.exec(`update public.sce_tcsk_profiles set status = 'active' where email in ('a@x.vn', 'b@x.vn')`);
  const ev = await as(OFFICER, () => db.query<{ id: string }>(`insert into public.sce_tcsk_events (name, type, event_date, department) values ('HN', 'hoi_nghi', '2026-12-15', 'Phòng Xúc tiến đầu tư') returning id`));
  eventId = ev.rows[0]!.id;
}, 60_000);

describe('sce_tcsk_email_deliveries on Postgres', () => {
  it('an officer who may send cannot pass a row off as imported from the old app (which skips the evidence check)', async () => {
    await expect(as(OFFICER, () => delivery(', imported', `'fake@x.vn', 'sent', true`))).rejects.toThrow(/row-level security/);
    const own = await claim('a@x.vn');
    await expect(update(OFFICER, own, `imported = true, claim_proof = '${RUN}'`)).rejects.toThrow(/row-level security/);
  });

  it('a sent row needs Gmail’s id and a time, a queued or sending one the run that holds it (checks hold for the import too)', async () => {
    await expect(delivery('', `'b@x.vn', 'sent'`)).rejects.toThrow(/sent_has_evidence/);
    await expect(delivery('', `'c@x.vn', 'queued'`)).rejects.toThrow(/queued_has_token/);
    await expect(delivery('', `'c2@x.vn', 'sending'`)).rejects.toThrow(/queued_has_token/);
    await expect(delivery('', `'c3@x.vn', 'parked'`)).rejects.toThrow(/status_check/);
    await expect(delivery(', sent_at, provider_message_id', `'d@x.vn', 'sent', now(), 'msg-1'`)).resolves.toBeDefined();
  });

  it('a send whose answer was lost is stored as unknown, with the reason', async () => {
    await expect(delivery(', error', `'e@x.vn', 'unknown', 'Không kết nối được Gmail.'`)).resolves.toBeDefined();
    await expect(delivery('', `'f@x.vn', 'unknown'`)).rejects.toThrow(/unknown_has_text/);
  });

  it('the import script, which bypasses RLS (the owner role here), still writes imported rows', async () => {
    await expect(delivery(', imported', `'legacy@x.vn', 'sent', true`)).resolves.toBeDefined();
  });
});

describe('the no-double-send rules on Postgres, for an officer writing to the tables directly', () => {
  it('a delivery starts as a claim', async () => {
    await expect(as(OFFICER, () => delivery(', sent_at, provider_message_id', `'made-up@x.vn', 'sent', now(), 'made-up-id'`))).rejects.toThrow(/row-level security/);
    await expect(as(OFFICER, () => delivery(', error', `'x1@x.vn', 'unknown', 'x'`))).rejects.toThrow(/row-level security/);
  });

  it('stores the hash of the run’s token, never the token, the same hash the app computes', async () => {
    const id = await claim('g1@x.vn');
    const { claimHash } = await import('../server/deliveries');
    expect((await row(id))!.claim_token).toBe(claimHash(RUN as never));
    await update(OFFICER, id, `claim_proof = '${RUN}'`);
    expect((await row(id))!.claim_proof).toBeNull();
  });

  it('a colleague cannot take a live claim, complete it, or delete it; the run that holds it can', async () => {
    const id = await claim('g2@x.vn');
    await expect(update(COLLEAGUE, id, `claim_token = ${hashOf(OTHER_RUN)}`)).rejects.toThrow(/belongs to another run/);
    await expect(update(COLLEAGUE, id, `status = 'sent', sent_at = now(), provider_message_id = 'made-up-id'`)).rejects.toThrow(/not this run/);
    await expect(update(COLLEAGUE, id, `status = 'sent', sent_at = now(), provider_message_id = 'made-up-id', claim_proof = '${OTHER_RUN}'`)).rejects.toThrow(/not this run/);
    await expect(update(COLLEAGUE, id, `claim_proof = '${OTHER_RUN}'`)).rejects.toThrow(/not this run/);
    await expect(as(COLLEAGUE, () => db.query(`delete from public.sce_tcsk_email_deliveries where id = '${id}'`))).rejects.toThrow(/may be deleted/);
    expect(await row(id)).toMatchObject({ status: 'queued' });
    await update(OFFICER, id, `status = 'sending', claim_proof = '${RUN}'`);
    await update(OFFICER, id, `status = 'sent', sent_at = now(), provider_message_id = 'msg-g2', claim_proof = '${RUN}'`);
    expect(await row(id)).toMatchObject({ status: 'sent', provider_message_id: 'msg-g2', claim_proof: null });
  });

  it('a sent row is final: not changed, not turned into an error, not deleted, imported or not', async () => {
    const id = await claim('g3@x.vn');
    await update(OFFICER, id, `status = 'sent', sent_at = now(), provider_message_id = 'msg-g3', claim_proof = '${RUN}'`);
    const legacy = (await delivery(', imported', `'legacy-final@x.vn', 'sent', true`)).rows[0]!.id;
    for (const target of [id, legacy]) {
      await expect(update(OFFICER, target, `status = 'error', error = 'x', claim_proof = '${RUN}'`)).rejects.toThrow(/final/);
      await expect(update(OFFICER, target, `provider_message_id = 'other'`)).rejects.toThrow(/final/);
      expect((await as(OFFICER, () => db.query(`delete from public.sce_tcsk_email_deliveries where id = '${target}' returning id`))).rows).toEqual([]);
      expect(await row(target)).toMatchObject({ status: 'sent' });
    }
  });

  it('a lapsed claim may be taken by anyone; a lapsed message being sent only becomes unknown', async () => {
    const queued = await claim('g4@x.vn');
    const sending = await claim('g5@x.vn');
    await update(OFFICER, sending, `status = 'sending', claim_proof = '${RUN}'`);
    await age(queued, 31);
    await age(sending, 31);
    await expect(update(COLLEAGUE, queued, `claim_token = ${hashOf(OTHER_RUN)}`)).resolves.toBeDefined();
    await expect(update(COLLEAGUE, sending, `status = 'queued', claim_token = ${hashOf(OTHER_RUN)}`)).rejects.toThrow(/belongs to another run/);
    await expect(update(COLLEAGUE, sending, `status = 'unknown', error = 'Phiên gửi đã dừng'`)).resolves.toBeDefined();
    expect(await row(sending)).toMatchObject({ status: 'unknown' });
  });

  it('an officer takes over their own other run: its claim changes hands, its message in flight becomes unknown', async () => {
    const queued = await claim('g12@x.vn');
    const sending = await claim('g13@x.vn');
    await update(OFFICER, sending, `status = 'sending', claim_proof = '${RUN}'`);
    await expect(update(OFFICER, queued, `claim_token = ${hashOf(OTHER_RUN)}, claim_proof = '${OTHER_RUN}'`)).resolves.toBeDefined();
    await expect(update(OFFICER, sending, `status = 'unknown', error = 'Phiên gửi đã dừng'`)).resolves.toBeDefined();
    await expect(update(OFFICER, queued, `status = 'sending', claim_proof = '${OTHER_RUN}'`)).resolves.toBeDefined();
  });

  it('a fresh message being sent is not the colleague’s to turn unknown; the run may still record it sent once unknown', async () => {
    const id = await claim('g6@x.vn');
    await update(OFFICER, id, `status = 'sending', claim_proof = '${RUN}'`);
    await expect(update(COLLEAGUE, id, `status = 'unknown', error = 'x'`)).rejects.toThrow(/not this run/);
    await age(id, 31);
    await update(COLLEAGUE, id, `status = 'unknown', error = 'x'`);
    await expect(update(COLLEAGUE, id, `status = 'sent', sent_at = now(), provider_message_id = 'made-up-id', error = null`)).rejects.toThrow(/not this run/);
    await update(OFFICER, id, `status = 'sent', sent_at = now(), provider_message_id = 'msg-g6', error = null, claim_proof = '${RUN}'`);
    expect(await row(id)).toMatchObject({ status: 'sent', provider_message_id: 'msg-g6' });
  });

  it('an officer who checked the Sent folder turns unknown into an error, which any run may claim again', async () => {
    const id = await claim('g7@x.vn');
    await update(OFFICER, id, `status = 'unknown', error = 'mất kết nối', claim_proof = '${RUN}'`);
    await expect(update(COLLEAGUE, id, `status = 'queued', claim_token = ${hashOf(OTHER_RUN)}`)).rejects.toThrow(/belongs to another run/);
    await update(COLLEAGUE, id, `status = 'error', error = 'Cán bộ đã kiểm tra: thư chưa được gửi'`);
    await expect(update(COLLEAGUE, id, `status = 'queued', error = null, claim_token = ${hashOf(OTHER_RUN)}`)).resolves.toBeDefined();
  });

  it('the officer whose run holds an unsent claim frees it; a colleague frees it only once it lapsed', async () => {
    const own = await claim('g8@x.vn');
    const theirs = await claim('g9@x.vn');
    expect((await as(OFFICER, () => db.query(`delete from public.sce_tcsk_email_deliveries where id = '${own}' returning id`))).rows).toHaveLength(1);
    await age(theirs, 31);
    expect((await as(COLLEAGUE, () => db.query(`delete from public.sce_tcsk_email_deliveries where id = '${theirs}' returning id`))).rows).toHaveLength(1);
  });

  it('a message being sent is never deleted, lapsed or not, by its officer or a colleague; it only becomes unknown', async () => {
    const id = await claim('g14@x.vn');
    await update(OFFICER, id, `status = 'sending', claim_proof = '${RUN}'`);
    const remove = (user: string) => as(user, () => db.query(`delete from public.sce_tcsk_email_deliveries where id = '${id}' returning id`));
    expect((await remove(OFFICER)).rows).toEqual([]);
    await age(id, 40);
    expect((await remove(COLLEAGUE)).rows).toEqual([]);
    expect((await remove(OFFICER)).rows).toEqual([]);
    // So the same address cannot be claimed afresh, and mailed again, after a delete.
    await expect(as(COLLEAGUE, () => delivery(', claim_token', `'g14@x.vn', 'queued', ${hashOf(OTHER_RUN)}`))).rejects.toThrow(/duplicate key|unique/);
    expect(await row(id)).toMatchObject({ status: 'sending' });
  });

  it('only the run that holds a message being sent puts it back to a claim (it never reached Gmail), then frees it', async () => {
    const id = await claim('g15@x.vn');
    await update(OFFICER, id, `status = 'sending', claim_proof = '${RUN}'`);
    await expect(update(OFFICER, id, `status = 'queued'`)).rejects.toThrow(/not this run/);
    await expect(update(COLLEAGUE, id, `status = 'queued', claim_proof = '${OTHER_RUN}'`)).rejects.toThrow(/not this run/);
    await update(OFFICER, id, `status = 'queued', claim_proof = '${RUN}'`);
    expect(await row(id)).toMatchObject({ status: 'queued', claim_proof: null });
    expect((await as(OFFICER, () => db.query(`delete from public.sce_tcsk_email_deliveries where id = '${id}' returning id`))).rows).toHaveLength(1);
  });

  it('a campaign’s message never changes; its QR choice changes, and it is deleted, only until a message of it went out', async () => {
    const campaign = '0b0e0b0e-0000-5000-8000-0000000000c1';
    const write = (user: string, sql: string) => as(user, () => db.query<{ id: string }>(sql));
    await write(OFFICER, `insert into public.sce_tcsk_email_campaigns (id, event_id, subject_template, body_template) values ('${campaign}', '${eventId}', 'Mời', '<p>a</p>')`);
    await expect(write(COLLEAGUE, `update public.sce_tcsk_email_campaigns set body_template = '<p>khác</p>' where id = '${campaign}'`)).rejects.toThrow(/never changes/);
    expect((await write(COLLEAGUE, `update public.sce_tcsk_email_campaigns set attach_qr = true where id = '${campaign}' returning id`)).rows).toHaveLength(1);
    const id = await claim('g10@x.vn', OFFICER, campaign);
    await update(OFFICER, id, `status = 'sending', claim_proof = '${RUN}'`);
    expect((await write(COLLEAGUE, `update public.sce_tcsk_email_campaigns set attach_qr = false where id = '${campaign}' returning id`)).rows).toEqual([]);
    expect((await write(COLLEAGUE, `delete from public.sce_tcsk_email_campaigns where id = '${campaign}' returning id`)).rows).toEqual([]);
    expect((await db.query(`select attach_qr from public.sce_tcsk_email_campaigns where id = '${campaign}'`)).rows).toEqual([{ attach_qr: true }]);
  });

  it('an officer who sets sce.restoring in their own session is still checked', async () => {
    const id = await claim('g16@x.vn');
    await update(OFFICER, id, `status = 'sent', sent_at = now(), provider_message_id = 'msg-g16', claim_proof = '${RUN}'`);
    const forged = (user: string, sql: string) => as(user, async () => {
      await db.exec(`select set_config('sce.restoring', 'on', false)`);
      try {
        return await db.query<{ id: string }>(sql);
      } finally {
        await db.exec(`select set_config('sce.restoring', '', false)`);
      }
    });
    await expect(forged(OFFICER, `update public.sce_tcsk_email_deliveries set status = 'error', error = 'x' where id = '${id}'`)).rejects.toThrow(/final/);
    const live = await claim('g17@x.vn');
    await expect(forged(COLLEAGUE, `delete from public.sce_tcsk_email_deliveries where id = '${live}'`)).rejects.toThrow(/may be deleted/);
    const campaign = '0b0e0b0e-0000-5000-8000-0000000000c2';
    await as(OFFICER, () => db.query(`insert into public.sce_tcsk_email_campaigns (id, event_id, subject_template, body_template) values ('${campaign}', '${eventId}', 'Mời', '<p>a</p>')`));
    await expect(forged(COLLEAGUE, `update public.sce_tcsk_email_campaigns set body_template = '<p>khác</p>' where id = '${campaign}'`)).rejects.toThrow(/never changes/);
    expect(await row(id)).toMatchObject({ status: 'sent' });
  });

  it('a backup restore (security definer, as the owner) still puts back sent and claimed deliveries', async () => {
    const id = await claim('g18@x.vn');
    await update(OFFICER, id, `status = 'sent', sent_at = now(), provider_message_id = 'msg-g18', claim_proof = '${RUN}'`);
    const backup = (await as(ADMIN, () => db.query<{ id: number }>(`select public.sce_tcsk_create_backup('Thử khôi phục', 'manual') as id`), 'aal2')).rows[0]!.id;
    await update(OFFICER, await claim('g19@x.vn'), `claim_proof = '${RUN}'`);
    await as(ADMIN, () => db.query(`select public.sce_tcsk_restore_backup(${backup})`), 'aal2');
    expect(await row(id)).toMatchObject({ status: 'sent', provider_message_id: 'msg-g18' });
    expect((await db.query(`select id from public.sce_tcsk_email_deliveries where email = 'g19@x.vn'`)).rows).toEqual([]);
  });

  it('deleting a guest with a sent delivery still works: the delivery keeps its record', async () => {
    const guest = (await as(OFFICER, () => db.query<{ id: string }>(`insert into public.sce_tcsk_guests (event_id, name, guest_group) values ('${eventId}', 'Khách', 'VIP') returning id`))).rows[0]!.id;
    const id = (await as(OFFICER, () => delivery(', claim_token, guest_id', `'g11@x.vn', 'queued', ${hashOf(RUN)}, '${guest}'`))).rows[0]!.id;
    await update(OFFICER, id, `status = 'sent', sent_at = now(), provider_message_id = 'msg-g11', claim_proof = '${RUN}'`);
    expect((await as(OFFICER, () => db.query(`delete from public.sce_tcsk_guests where id = '${guest}' returning id`))).rows).toHaveLength(1);
    expect((await db.query(`select status, guest_id from public.sce_tcsk_email_deliveries where id = '${id}'`)).rows).toEqual([{ status: 'sent', guest_id: null }]);
  });
});
