import { describe, expect, it, vi } from 'vitest';
import type { Instant, UserId, Version } from '@/core/brand';
import type { Actor } from '@/core/auth';
import { runCommand, type AnyCommandSpec } from '@/core/commands/pipeline';
import { buildWorkCalendar } from '@/core/dates';
import { DbError, memoryDb } from '@/core/db';
import { inspectMemoryDb } from '@/core/db/memory';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { testActor, XTDT } from '@/core/testing/actors';

const NEW_ID = '99999999-0000-4000-8000-000000000001' as UserId;
const createAuthUser = vi.fn(async () => NEW_ID);
vi.mock('@/core/auth/admin', () => ({ createAuthUser: (...args: unknown[]) => createAuthUser(...(args as [])) }));
const { commands } = await import('@/features/core/server');

function setup(actor: Actor) {
  const seed = {
    sce_tcsk_profiles: [
      { id: actor.profile.id, email: actor.profile.email, fullname: 'Admin', role: actor.profile.role, department: null, status: 'active' },
      { id: NEW_ID, email: 'moi@sce.vn', fullname: 'Mới', role: 'user', department: null, status: 'pending' },
    ],
  };
  const ctx = { actor, db: memoryDb(seed, actor), settings: { ...DEFAULT_SETTINGS, version: 1 as Version }, calendar: buildWorkCalendar([]), now: '2026-11-04T00:00:00.000Z' as Instant };
  const run = (input: unknown) => runCommand(ctx, (id) => (id === 'core.users.create' ? (commands['users.create'] as AnyCommandSpec) : undefined), 'core.users.create', input);
  return { seed, run };
}

const input = { email: ' Moi@SCE.vn ', password: 'matkhau123', fullname: 'Mới', department: XTDT, role: 'dept_leader' };

describe('core.users.create (core B8)', () => {
  it('creates the auth user server-side, then sets role, department and status as the admin', async () => {
    const admin = testActor('admin', null);
    const { seed, run } = setup(admin);
    const r = await run(input);
    expect(r).toMatchObject({ ok: true, value: { id: NEW_ID, email: 'moi@sce.vn', role: 'dept_leader', department: XTDT, status: 'active' } });
    expect(createAuthUser).toHaveBeenCalledWith({ email: 'moi@sce.vn', password: 'matkhau123', fullname: 'Mới', department: XTDT, role: 'dept_leader' });
    expect(inspectMemoryDb(seed, 'sce_tcsk_profiles')[1]).toMatchObject({ role: 'dept_leader', department: XTDT, status: 'active' });
    expect(inspectMemoryDb(seed, 'sce_tcsk_audit_logs').map((a) => a.action)).toEqual(['PHÂN QUYỀN TÀI KHOẢN', 'CHUYỂN PHÒNG BAN', 'DUYỆT/MỞ KHÓA TÀI KHOẢN', 'TẠO TÀI KHOẢN']);
  });

  it('is refused for a leader before any user is created', async () => {
    createAuthUser.mockClear();
    const { run } = setup(testActor('leader', 'Ban Giám đốc'));
    expect(await run(input)).toMatchObject({ ok: false, kind: 'forbidden' });
    expect(createAuthUser).not.toHaveBeenCalled();
  });

  it('validates the form and reports an existing email', async () => {
    const { run } = setup(testActor('admin', null));
    expect(await run({ ...input, email: 'khong-hop-le', password: '123' })).toMatchObject({ ok: false, kind: 'invalid', fieldErrors: { email: 'Email không hợp lệ', password: 'Mật khẩu tối thiểu 8 ký tự' } });
    createAuthUser.mockRejectedValueOnce(new DbError('constraint', { constraint: 'email_exists' }));
    expect(await run(input)).toMatchObject({ ok: false, kind: 'constraint', message: 'Email này đã có tài khoản.' });
  });
});
