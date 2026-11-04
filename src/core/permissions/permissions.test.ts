import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { can, mergePermissions, permissionMatrix, type Permission } from '@/core/permissions';
import { PTDN, testActor, XTDT } from '@/core/testing/actors';
import { PERMISSIONS_SQL_PATH, renderPermissionsSql } from '../../../scripts/gen-permissions-sql';

const ownEvent = { departments: [XTDT] };
const otherEvent = { departments: [PTDN] };
const supported = { departments: [PTDN, XTDT] };

describe('can() mirrors tcsk.has_perm / can_on_departments', () => {
  it('department grant: own lead or supporting department only', () => {
    const user = testActor('user', XTDT);
    expect(can(user, 'progress.read', ownEvent)).toBe(true);
    expect(can(user, 'progress.read', supported)).toBe(true);
    expect(can(user, 'progress.read', otherEvent)).toBe(false);
  });

  it('without a resource, a department grant means "some resources" (nav and route guards)', () => {
    expect(can(testActor('user', XTDT), 'guests.read')).toBe(true);
    expect(can(testActor('user', null), 'guests.read')).toBe(false);
  });

  it('pending and locked users can do nothing (core B3)', () => {
    expect(can(testActor('admin', null, { status: 'pending' }), 'progress.read', ownEvent)).toBe(false);
    expect(can(testActor('user', XTDT, { status: 'locked' }), 'progress.read', ownEvent)).toBe(false);
  });

  it('admin and leader need AAL2; others need it once they have TOTP (core B4)', () => {
    expect(can(testActor('admin', null, { aal: 'aal1' }), 'progress.read', otherEvent)).toBe(false);
    expect(can(testActor('admin', null, { aal: 'aal2' }), 'progress.read', otherEvent)).toBe(true);
    expect(can(testActor('leader', 'Ban Giám đốc', { aal: 'aal1', hasVerifiedTotp: false }), 'progress.read', otherEvent)).toBe(false);
    expect(can(testActor('user', XTDT, { aal: 'aal1', hasVerifiedTotp: true }), 'progress.read', ownEvent)).toBe(false);
    expect(can(testActor('user', XTDT, { aal: 'aal2', hasVerifiedTotp: true }), 'progress.read', ownEvent)).toBe(true);
  });

  it('applies the design RBAC rows', () => {
    const user = testActor('user', XTDT);
    const deptLeader = testActor('dept_leader', XTDT);
    const leader = testActor('leader', 'Ban Giám đốc');
    const admin = testActor('admin', null);
    expect(can(user, 'progress.delete', ownEvent)).toBe(false);
    expect(can(deptLeader, 'progress.delete', ownEvent)).toBe(true);
    expect(can(user, 'reports.issue', ownEvent)).toBe(false);
    expect(can(deptLeader, 'reports.issue', ownEvent)).toBe(true);
    expect(can(user, 'templates.read')).toBe(true);
    expect(can(user, 'templates.admin')).toBe(false);
    expect(can(leader, 'templates.admin')).toBe(false);
    expect(can(leader, 'core.settings.edit')).toBe(true);
    expect(can(leader, 'core.users.manage')).toBe(false);
    expect(can(admin, 'core.users.manage')).toBe(true);
    expect(can(deptLeader, 'core.users.read', { departments: [XTDT] })).toBe(true);
    expect(can(deptLeader, 'core.users.read', { departments: [PTDN] })).toBe(false);
    expect(can(user, 'core.users.read')).toBe(false);
  });

  it('core.backups.restore requires AAL2 on top of the admin grant', () => {
    expect(can(testActor('admin', null, { aal: 'aal2' }), 'core.backups.restore')).toBe(true);
    expect(can(testActor('admin', null, { aal: 'aal1', hasVerifiedTotp: true }), 'core.backups.restore')).toBe(false);
  });

  it('unknown permissions are denied', () => {
    expect(can(testActor('admin', null), 'nope.read' as Permission)).toBe(false);
  });
});

describe('permissionMatrix()', () => {
  it('merges all nine manifests: 34 permissions, prefixed by their feature', () => {
    const keys = [...permissionMatrix().keys()];
    expect(keys).toHaveLength(34);
    expect(keys[0]).toBe('core.settings.edit');
    expect(keys.at(-1)).toBe('reports.issue');
  });

  it('is exactly what 0004_permissions_seed.sql seeds', () => {
    expect(renderPermissionsSql(permissionMatrix())).toBe(readFileSync(PERMISSIONS_SQL_PATH, 'utf8'));
  });

  it('refuses a key declared by two manifests', () => {
    const def = { label: 'x', scope: 'global' as const, grants: { admin: 'all' as const, leader: 'none' as const, dept_leader: 'none' as const, user: 'none' as const } };
    expect(() => mergePermissions([{ key: 'a', permissions: { 'a.x': def } }, { key: 'b', permissions: { 'a.x': def } }])).toThrow('declared twice');
  });
});
