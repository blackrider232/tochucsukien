// Service-role access for scripts/import-legacy.ts only. Bypasses RLS by
// design (it writes every owner's rows); never imported by the app.

import { createClient } from '@supabase/supabase-js';

export interface ImportStore {
  readBlob(): Promise<unknown>;
  readHolidays(): Promise<ReadonlyArray<{ holiday_date: string; name: string; kind: string }>>;
  insertPreMigrationBackup(blob: unknown): Promise<number>;
  upsert(table: string, rows: ReadonlyArray<Readonly<Record<string, unknown>>>): Promise<number>;
  /** Demotes every admin whose email is not kept; returns the demoted emails. */
  demoteAdmins(keep: ReadonlyArray<string>): Promise<string[]>;
  markMigrated(): Promise<void>;
}

const CHUNK = 500;

export function serviceRoleImportStore(url: string, serviceRoleKey: string): ImportStore {
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const check = <T>(res: { data: T; error: { message: string } | null }, what: string): T => {
    if (res.error) throw new Error(`${what}: ${res.error.message}`);
    return res.data;
  };
  return {
    async readBlob() {
      const row = check(await db.from('sce_tcsk_app_data').select('data').eq('id', 1).maybeSingle(), 'read sce_tcsk_app_data');
      if (!row) throw new Error('sce_tcsk_app_data has no row 1');
      return (row as { data: unknown }).data;
    },
    async readHolidays() {
      return check(await db.from('sce_tcsk_holidays').select('holiday_date, name, kind'), 'read holidays') ?? [];
    },
    async insertPreMigrationBackup(blob) {
      const row = check(
        await db.from('sce_tcsk_backups').insert({ data: blob, kind: 'pre_migration', format: 1, note: 'Trước khi chuyển dữ liệu sang phiên bản mới' }).select('id').single(),
        'insert pre-migration backup',
      );
      return Number((row as { id: number }).id);
    },
    async upsert(table, rows) {
      let written = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const data = check(await db.from(table).upsert(rows.slice(i, i + CHUNK), { onConflict: 'id' }).select('id'), `upsert ${table}`);
        written += (data ?? []).length;
      }
      return written;
    },
    async demoteAdmins(keep) {
      const kept = new Set(keep.map((e) => e.trim().toLowerCase()));
      const admins = (check(await db.from('sce_tcsk_profiles').select('id, email').eq('role', 'admin'), 'read admins') ?? []) as Array<{ id: string; email: string }>;
      const demote = admins.filter((a) => !kept.has(a.email.toLowerCase()));
      if (demote.length > 0) {
        check(await db.from('sce_tcsk_profiles').update({ role: 'user', status: 'pending' }).in('id', demote.map((a) => a.id)), 'demote admins');
      }
      return demote.map((a) => a.email);
    },
    async markMigrated() {
      check(await db.from('sce_tcsk_app_data').update({ migrated_at: new Date().toISOString() }).eq('id', 1), 'mark migrated');
    },
  };
}
