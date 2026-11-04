import { describe, expect, it } from 'vitest';
import type { Actor } from '@/core/auth';
import type { BackupId, Email, UserId, Version } from '@/core/brand';
import type { CommandId, InputOf } from '@/core/commands';
import { DbError } from '@/core/db';
import { settingsPatchSchema } from '@/core/settings';
import { XTDT, testActor } from '@/core/testing/actors';
import { SETTINGS_LIMITS } from '../domain/schemas';
import { actors, adminAal1, createAuthUser, day, harness, locked, NEW_USER_ID, NOW, pending } from './harness';

const { admin, admin2, leader, xtdtLeader, xtdtUser, ptdnUser } = actors;
const v1 = 1 as Version;

const inputs: { [K in CommandId as K extends `core.${string}` ? K : never]: InputOf<K> } = {
  'core.settings.update': { version: v1, patch: { guestQuotaPercent: 150 } },
  'core.holidays.replaceYear': { year: 2027, holidays: [{ date: day('2027-02-06'), name: 'Tết Nguyên đán', kind: 'holiday' }] },
  'core.users.create': { email: 'moi@sce.vn' as Email, password: 'matkhau123', fullname: 'Mới', department: XTDT, role: 'user' },
  'core.users.setRole': { id: xtdtUser.profile.id, role: 'admin' },
  'core.users.setDepartment': { id: xtdtUser.profile.id, department: 'Phòng Tư vấn doanh nghiệp' },
  'core.users.setStatus': { ids: [pending.profile.id], status: 'active' },
  'core.profile.updateName': { fullname: 'Tên mới' },
  'core.backups.create': { note: 'Sao lưu thử' },
  'core.backups.restore': { id: 1 as BackupId },
  'core.backups.download': { id: 1 as BackupId },
  'core.audit.list': { limit: 10 },
};

/** Who each command refuses at command level, with row-level security out of the way. */
const denied: { [K in keyof typeof inputs]: ReadonlyArray<[string, Actor]> } = {
  'core.settings.update': [['dept_leader', xtdtLeader], ['user', xtdtUser], ['admin at aal1', adminAal1]],
  'core.holidays.replaceYear': [['dept_leader', xtdtLeader], ['user', xtdtUser], ['admin at aal1', adminAal1]],
  'core.users.create': [['leader', leader], ['dept_leader', xtdtLeader], ['user', xtdtUser]],
  'core.users.setRole': [['leader', leader], ['dept_leader', xtdtLeader], ['user', xtdtUser], ['admin at aal1', adminAal1]],
  'core.users.setDepartment': [['leader', leader], ['dept_leader', xtdtLeader], ['user', xtdtUser]],
  'core.users.setStatus': [['leader', leader], ['dept_leader', xtdtLeader], ['user', xtdtUser]],
  'core.profile.updateName': [['admin at aal1', adminAal1]],
  'core.backups.create': [['dept_leader', xtdtLeader], ['user', xtdtUser]],
  'core.backups.restore': [['leader', leader], ['dept_leader', xtdtLeader], ['user', xtdtUser], ['admin at aal1', adminAal1]],
  'core.backups.download': [['dept_leader', xtdtLeader], ['user', xtdtUser]],
  'core.audit.list': [['dept_leader', xtdtLeader], ['user', xtdtUser]],
};

describe('permission denials at command level', () => {
  const cases = Object.entries(denied).flatMap(([id, who]) => who.map(([label, actor]) => [id, label, actor] as const));
  it.each(cases)('%s refuses %s', async (id, _label, actor) => {
    const h = harness();
    const before = { profiles: h.rows('sce_tcsk_profiles'), settings: h.settings(), holidays: h.holidays() };
    const r = await h.runWithoutRls(actor, id as CommandId, inputs[id as keyof typeof inputs] as never);
    expect(r).toMatchObject({ ok: false, kind: actor === adminAal1 ? 'gate' : 'forbidden' });
    expect(h.audits()).toEqual([]);
    expect(h.rows('sce_tcsk_backups')).toEqual([]);
    expect({ profiles: h.rows('sce_tcsk_profiles'), settings: h.settings(), holidays: h.holidays() }).toEqual(before);
  });

  it.each([['pending', pending], ['locked', locked]] as const)('every command stops a %s account at the gate', async (_label, actor) => {
    const h = harness();
    for (const id of Object.keys(inputs) as Array<keyof typeof inputs>) {
      expect(await h.runWithoutRls(actor, id, inputs[id] as never)).toMatchObject({ ok: false, kind: 'gate' });
    }
    expect(h.audits()).toEqual([]);
  });
});

describe('one audit row per change', () => {
  const backupNote = { note: 'Bản trước khi khôi phục' };
  const prepare: Partial<Record<keyof typeof inputs, (h: ReturnType<typeof harness>) => Promise<unknown>>> = {
    'core.users.create': async (h) => {
      h.seed.sce_tcsk_profiles.push({ id: NEW_USER_ID, email: 'moi@sce.vn', fullname: 'Mới', role: 'user', department: null, status: 'pending', is_active: false, created_at: NOW, updated_at: NOW });
    },
    'core.backups.restore': (h) => h.ok(admin, 'core.backups.create', backupNote),
  };
  const mutations = (Object.keys(inputs) as Array<keyof typeof inputs>).filter((id) => id !== 'core.backups.download' && id !== 'core.audit.list');
  it.each(mutations)('%s writes exactly one row, the SQL function’s', async (id) => {
    const h = harness();
    await prepare[id]?.(h);
    const before = h.audits().length;
    await h.ok(id === 'core.profile.updateName' ? xtdtUser : admin, id, inputs[id] as never);
    expect(h.audits().slice(before)).toHaveLength(1);
  });
});

describe('core.settings.update', () => {
  it('saves a typed patch, keeps every other field and audits old and new values (core B12, B15)', async () => {
    const h = harness();
    const r = await h.ok(leader, 'core.settings.update', { version: v1, patch: { guestQuotaPercent: 150, parentAgency: 'Sở Tài chính Hà Nội' } });
    expect(r.value).toMatchObject({ guestQuotaPercent: 150, badgeQuotaPercent: 120, dailyReportThresholdDays: 10, parentAgency: 'Sở Tài chính Hà Nội', version: 2 });
    expect(h.audits().at(-1)).toMatchObject({
      action: 'CẬP NHẬT THAM SỐ HỆ THỐNG',
      summary: 'Đơn vị chủ quản (cấp trên): SỞ TÀI CHÍNH HÀ NỘI → Sở Tài chính Hà Nội; Tỷ lệ danh sách khách mời tối thiểu (nhóm 1a): 130% → 150%',
      entity: 'settings',
    });
    expect((await h.undo(leader, r.inverse)).ok).toBe(true);
    expect(h.settings()).toMatchObject({ guestQuotaPercent: 130, parentAgency: 'SỞ TÀI CHÍNH HÀ NỘI', version: 3 });
  });

  it('reports a conflict when someone saved first', async () => {
    const h = harness();
    await h.ok(admin, 'core.settings.update', { version: v1, patch: { fieldPresenceHours: 3 } });
    const stale = await h.run(leader, 'core.settings.update', { version: v1, patch: { fieldPresenceHours: 4 } });
    expect(stale).toMatchObject({ ok: false, kind: 'conflict' });
    expect(h.settings().fieldPresenceHours).toBe(3);
  });

  it('refuses values outside the ranges the database checks, with the field named', async () => {
    const h = harness();
    const r = await h.run(admin, 'core.settings.update', { version: v1, patch: { dailyReportThresholdDays: 31, guestQuotaPercent: 99, fieldPresenceHours: 2.5, agencyName: '  ' } });
    expect(r).toMatchObject({
      ok: false, kind: 'invalid',
      fieldErrors: { 'patch.dailyReportThresholdDays': 'Tối đa 30 ngày', 'patch.guestQuotaPercent': 'Tối thiểu 100 %', 'patch.fieldPresenceHours': 'Nhập số nguyên', 'patch.agencyName': 'Nhập tên đơn vị tổ chức' },
    });
    expect(await h.run(admin, 'core.settings.update', { version: v1, patch: { version: 9 } as never })).toMatchObject({ ok: false, kind: 'invalid' });
    expect(await h.run(admin, 'core.settings.update', { version: v1, patch: { guestQuotaPercent: 130 } })).toMatchObject({ ok: false, kind: 'invalid', message: 'Chưa có thay đổi nào để lưu.' });
    expect(h.audits()).toEqual([]);
  });

  it('accepts exactly the bounds the core settings schema accepts', () => {
    for (const [field, [min, max]] of Object.entries(SETTINGS_LIMITS)) {
      for (const value of [min - 1, min, max, max + 1]) {
        const h = settingsPatchSchema.safeParse({ [field]: value }).success;
        expect([field, value, h]).toEqual([field, value, value >= min && value <= max]);
      }
    }
  });
});

describe('core.holidays.replaceYear', () => {
  const tet = { date: day('2027-02-06'), name: 'Tết Nguyên đán', kind: 'holiday' as const };
  const lamBu = { date: day('2027-02-20'), name: 'Làm bù Tết', kind: 'compensatory_workday' as const };

  it('replaces one year, converges when repeated, and leaves other years alone', async () => {
    const h = harness();
    const list = [{ date: day('2027-01-01'), name: 'Tết Dương lịch', kind: 'holiday' as const }, tet, lamBu];
    const first = await h.ok(leader, 'core.holidays.replaceYear', { year: 2027, holidays: list });
    expect(h.holidays(2027)).toEqual(list);
    expect(h.audits().at(-1)).toMatchObject({ action: 'CẬP NHẬT NGÀY NGHỈ LỄ', summary: 'Năm 2027: thêm 06/02/2027 Tết Nguyên đán, 20/02/2027 Làm bù Tết (ngày làm bù); bỏ 30/04/2027 Ngày Giải phóng miền Nam' });
    await h.ok(leader, 'core.holidays.replaceYear', { year: 2027, holidays: list });
    expect(h.holidays(2027)).toEqual(list);
    expect(h.audits().at(-1)?.summary).toBe('Năm 2027: không thay đổi');
    expect(h.holidays(2028)).toEqual([{ date: '2028-01-01', name: 'Tết Dương lịch', kind: 'holiday' }]);
    expect((await h.undo(leader, first.inverse)).ok).toBe(true);
    expect(h.holidays(2027).map((x) => x.name)).toEqual(['Tết Dương lịch', 'Ngày Giải phóng miền Nam']);
  });

  it('refuses a date outside the year and a date listed twice', async () => {
    const h = harness();
    const r = await h.run(admin, 'core.holidays.replaceYear', { year: 2027, holidays: [tet, { ...tet, name: 'Trùng' }, { date: day('2028-01-02'), name: 'Sai năm', kind: 'holiday' }] });
    expect(r).toMatchObject({ ok: false, kind: 'invalid', fieldErrors: { 'holidays.1.date': 'Ngày này đã có trong danh sách', 'holidays.2.date': 'Ngày phải thuộc năm 2027' } });
    expect(h.holidays(2027)).toHaveLength(2);
  });
});

describe('core.users.*', () => {
  it('changes role and department through the SQL functions, with a readable audit and undo', async () => {
    const h = harness();
    const role = await h.ok(admin, 'core.users.setRole', { id: xtdtUser.profile.id, role: 'dept_leader' });
    expect(role.value).toMatchObject({ role: 'dept_leader' });
    expect(h.audits()).toMatchObject([{ action: 'PHÂN QUYỀN TÀI KHOẢN', summary: `${xtdtUser.profile.fullname} <${xtdtUser.profile.email}>: Chuyên viên → Lãnh đạo Phòng` }]);
    await h.undo(admin, role.inverse);
    expect(h.profile(xtdtUser).role).toBe('user');

    const dept = await h.ok(admin, 'core.users.setDepartment', { id: xtdtUser.profile.id, department: 'Phòng Tư vấn doanh nghiệp' });
    expect(h.profile(xtdtUser).department).toBe('Phòng Tư vấn doanh nghiệp');
    await h.undo(admin, dept.inverse);
    expect(h.profile(xtdtUser).department).toBe(XTDT);
  });

  it('approves a pending account without offering undo, and locks then unlocks with undo', async () => {
    const h = harness();
    const approve = await h.ok(admin, 'core.users.setStatus', { ids: [pending.profile.id], status: 'active' });
    expect(approve.value).toBe(1);
    expect(approve.inverse).toBeUndefined();
    expect(h.audits().at(-1)?.summary).toBe(`Duyệt ${pending.profile.fullname} <${pending.profile.email}>`);
    const lock = await h.ok(admin, 'core.users.setStatus', { ids: [ptdnUser.profile.id], status: 'locked' });
    expect(h.profile(ptdnUser).status).toBe('locked');
    await h.undo(admin, lock.inverse);
    expect(h.profile(ptdnUser).status).toBe('active');
  });

  it('keeps one active admin and refuses to lock oneself', async () => {
    const h = harness({ profiles: [admin, xtdtUser] });
    expect(await h.run(admin, 'core.users.setRole', { id: admin.profile.id, role: 'user' })).toMatchObject({ ok: false, kind: 'constraint', message: 'Hệ thống phải còn ít nhất một quản trị viên đang hoạt động.' });
    expect(await h.run(admin, 'core.users.setStatus', { ids: [admin.profile.id], status: 'locked' })).toMatchObject({ ok: false, kind: 'constraint', message: 'Không thể tự khóa tài khoản của chính mình.' });
    expect(h.profile(admin)).toMatchObject({ role: 'admin', status: 'active' });

    const two = harness({ profiles: [admin, admin2] });
    await two.ok(admin2, 'core.users.setStatus', { ids: [admin.profile.id], status: 'locked' });
    expect(await two.run(admin2, 'core.users.setRole', { id: admin2.profile.id, role: 'leader' })).toMatchObject({ ok: false, kind: 'constraint' });
  });

  it('answers not found for an account the caller cannot see', async () => {
    const h = harness();
    expect(await h.run(admin, 'core.users.setRole', { id: '00000000-0000-4000-8000-00000000dead' as UserId, role: 'user' })).toMatchObject({ ok: false, kind: 'not_found' });
  });

  it('creates an account with the service role, then sets role, department and status as the admin (core B8)', async () => {
    const h = harness();
    // What the auth.users trigger inserts for the new account.
    h.seed.sce_tcsk_profiles.push({ id: NEW_USER_ID, email: 'moi@sce.vn', fullname: 'Mới', role: 'user', department: null, status: 'pending', is_active: false, created_at: NOW, updated_at: NOW });
    createAuthUser.mockClear();
    const r = await h.ok(admin, 'core.users.create', { ...inputs['core.users.create'], email: ' Moi@SCE.vn ' as Email, role: 'dept_leader' });
    expect(createAuthUser).toHaveBeenCalledWith({ email: 'moi@sce.vn', password: 'matkhau123', fullname: 'Mới', department: XTDT, role: 'dept_leader' });
    expect(r.value).toMatchObject({ id: NEW_USER_ID, role: 'dept_leader', status: 'active' });
    expect(h.audits().at(-1)).toMatchObject({ action: 'TẠO TÀI KHOẢN', summary: 'Mới <moi@sce.vn>, Lãnh đạo Phòng, Phòng Xúc tiến đầu tư' });
  });

  it('validates the form and reports an email that already has an account', async () => {
    const h = harness();
    expect(await h.run(admin, 'core.users.create', { ...inputs['core.users.create'], email: 'khong-hop-le' as Email, password: '123' })).toMatchObject({
      ok: false, kind: 'invalid', fieldErrors: { email: 'Email không hợp lệ', password: 'Mật khẩu tối thiểu 8 ký tự' },
    });
    createAuthUser.mockRejectedValueOnce(new DbError('constraint', { constraint: 'email_exists' }));
    expect(await h.run(admin, 'core.users.create', inputs['core.users.create'])).toMatchObject({ ok: false, kind: 'constraint', message: 'Email này đã có tài khoản.' });
  });
});

describe('core.profile.updateName', () => {
  it('stores a script-like name as plain text and audits it as text (core B29)', async () => {
    const h = harness();
    const payload = '<img src=x onerror="alert(1)">  <script>x</script>';
    const r = await h.ok(xtdtUser, 'core.profile.updateName', { fullname: `  ${payload} ` });
    expect(r.value.fullname).toBe('<img src=x onerror="alert(1)"> <script>x</script>');
    expect(h.profile(xtdtUser).fullname).toBe('<img src=x onerror="alert(1)"> <script>x</script>');
    expect(h.audits().at(-1)).toMatchObject({ action: 'CẬP NHẬT HỒ SƠ', summary: `Tên hiển thị: "${xtdtUser.profile.fullname}" → "<img src=x onerror="alert(1)"> <script>x</script>"` });
  });

  it('refuses an empty name and changes only the caller', async () => {
    const h = harness();
    expect(await h.run(xtdtUser, 'core.profile.updateName', { fullname: '   ' })).toMatchObject({ ok: false, kind: 'invalid', fieldErrors: { fullname: 'Nhập họ tên' } });
    await h.ok(ptdnUser, 'core.profile.updateName', { fullname: 'Trần Thị B' });
    expect(h.profile(xtdtUser).fullname).toBe(xtdtUser.profile.fullname);
  });
});

describe('core.backups.*', () => {
  it('restores a snapshot after taking one of the current data, and audits both (core B17)', async () => {
    const h = harness();
    const created = await h.ok(leader, 'core.backups.create', { note: 'Trước khi sửa' });
    expect(created.value).toMatchObject({ kind: 'manual', format: 2, note: 'Trước khi sửa', createdByEmail: leader.profile.email });
    await h.ok(admin, 'core.settings.update', { version: v1, patch: { guestQuotaPercent: 170 } });
    await h.ok(admin, 'core.holidays.replaceYear', { year: 2027, holidays: [] });

    expect(await h.run(leader, 'core.backups.restore', { id: created.value.id })).toMatchObject({ ok: false, kind: 'forbidden' });
    await h.ok(admin, 'core.backups.restore', { id: created.value.id });
    expect(h.settings().guestQuotaPercent).toBe(130);
    expect(h.holidays(2027)).toHaveLength(2);
    const notes = h.rows('sce_tcsk_backups').map((b) => b.note);
    expect(notes).toEqual(['Trước khi sửa', `Trước khi khôi phục #${created.value.id}`]);
    const snapshot = h.rows('sce_tcsk_backups').at(-1)!.id;
    expect(h.audits().at(-1)).toMatchObject({ action: 'KHÔI PHỤC SAO LƯU' });
    expect(h.audits().at(-1)!.summary).toMatch(new RegExp(`^Khôi phục từ bản #${created.value.id} \\(\\d\\d:\\d\\d \\d\\d/\\d\\d/\\d{4}\\): Trước khi sửa\\. Dữ liệu trước đó lưu ở bản #${snapshot}$`));
  });

  it('leaves accounts as they are: roles, names and statuses changed after the backup survive a restore', async () => {
    const h = harness();
    const created = await h.ok(admin, 'core.backups.create', { note: 'Trước khi đổi tài khoản' });
    await h.ok(admin, 'core.users.setRole', { id: xtdtUser.profile.id, role: 'dept_leader' });
    await h.ok(ptdnUser, 'core.profile.updateName', { fullname: 'Tên sau sao lưu' });
    await h.ok(admin, 'core.users.setStatus', { ids: [pending.profile.id], status: 'active' });
    const accounts = h.rows('sce_tcsk_profiles');
    await h.ok(admin, 'core.backups.restore', { id: created.value.id });
    expect(h.rows('sce_tcsk_profiles')).toEqual(accounts);
  });

  it('sends a legacy whole-blob backup to the import script instead of restoring it', async () => {
    const h = harness();
    h.seed.sce_tcsk_backups.push({ id: 500, data: { events: [] }, note: 'Trước khi chuyển dữ liệu', kind: 'pre_migration', format: 1, created_by_email: null, created_at: '2026-10-01T00:00:00.000Z' });
    const r = await h.run(admin, 'core.backups.restore', { id: 500 as BackupId });
    expect(r).toMatchObject({ ok: false, kind: 'invalid' });
    expect(!r.ok && r.message).toContain('scripts/import-legacy.ts');
  });

  it('downloads a snapshot and the download is audited', async () => {
    const h = harness();
    const created = await h.ok(admin, 'core.backups.create', { note: 'Tải thử' });
    const r = await h.ok(leader, 'core.backups.download', { id: created.value.id });
    expect(r.value.fileName).toBe(`SCE_Event_Backup_2026-11-04_${created.value.id}.json`);
    expect(r.value.data).toHaveProperty('sce_tcsk_system_settings');
    expect(h.audits().at(-1)).toMatchObject({ action: 'TẢI BẢN SAO LƯU', actor_email: leader.profile.email });
  });
});

describe('core.audit.list', () => {
  it('pages newest first and filters by action and date; earlier rows never change (append-only)', async () => {
    const h = harness();
    for (const q of [140, 150, 160]) await h.ok(admin, 'core.settings.update', { version: h.settings().version, patch: { guestQuotaPercent: q } });
    const snapshot = h.audits();
    await h.ok(leader, 'core.backups.create', { note: 'Sau cùng' });
    expect(h.audits().slice(0, snapshot.length)).toEqual(snapshot);

    const first = await h.ok(leader, 'core.audit.list', { limit: 2 });
    expect(first.value.map((a) => a.action)).toEqual(['TẠO BẢN SAO LƯU', 'TẠO BẢN SAO LƯU']);
    const next = await h.ok(leader, 'core.audit.list', { limit: 10, before: first.value.at(-1)!.id });
    expect(next.value.map((a) => a.summary.slice(-11))).toEqual(['150% → 160%', '140% → 150%', '130% → 140%']);
    expect((await h.ok(leader, 'core.audit.list', { limit: 10, action: 'CẬP NHẬT THAM SỐ HỆ THỐNG', from: day('2020-01-01'), to: day('2020-12-31') })).value).toHaveLength(0);
    expect((await h.ok(leader, 'core.audit.list', { limit: 10, action: 'CẬP NHẬT THAM SỐ HỆ THỐNG' })).value).toHaveLength(3);
    expect(first.value[0]).not.toHaveProperty('entity');
  });

  it('is refused for a leader who has not passed MFA', async () => {
    const h = harness();
    const r = await h.run(testActor('leader', 'Ban Giám đốc', { aal: 'aal1', hasVerifiedTotp: true }), 'core.audit.list', { limit: 5 });
    expect(r).toMatchObject({ ok: false, kind: 'gate' });
  });
});
