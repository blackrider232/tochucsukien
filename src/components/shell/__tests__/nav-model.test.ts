import { describe, expect, it } from 'vitest';
import type { Permission } from '@/core/permissions';
import type { NavEntry, SubTab } from '@/core/registry';
import { buildShellModel, visibleActions } from '../build-shell';
import { activeNav, activeSubTab, eventIdFromPath, matchScore, resolveHref, type ShellNavItem } from '../nav-model';

const item = (over: Partial<ShellNavItem> & Pick<ShellNavItem, 'id' | 'href'>): ShellNavItem => ({
  label: over.id, icon: 'users', accent: 'blue', header: { title: over.id, subtitle: '' }, subTabs: [], ...over,
});

const PROGRESS = item({ id: 'progress', href: { kind: 'static', path: '/events' } });
const GUESTS = item({
  id: 'guests',
  href: { kind: 'event', segment: 'guests' },
  subTabs: [
    { id: 'list', label: 'Danh sách', href: { kind: 'event', segment: 'guests' } },
    { id: 'seating', label: 'Sơ đồ chỗ ngồi', href: { kind: 'event', segment: 'seating' } },
  ],
});
const SETTINGS = item({ id: 'settings', href: { kind: 'static', path: '/admin/settings' } });
const ALL = [PROGRESS, GUESTS, SETTINGS];

describe('nav model', () => {
  it('reads the event id from the path, but not from /events or /events/new', () => {
    expect(eventIdFromPath('/events/abc/plan')).toBe('abc');
    expect(eventIdFromPath('/events/abc')).toBe('abc');
    expect(eventIdFromPath('/events')).toBeNull();
    expect(eventIdFromPath('/events/new')).toBeNull();
    expect(eventIdFromPath('/admin/users')).toBeNull();
  });

  it('links event-scoped entries to the current event, or to /go/<nav> without one', () => {
    expect(resolveHref(GUESTS.href, 'guests', 'e1')).toBe('/events/e1/guests');
    expect(resolveHref(GUESTS.href, 'guests', null)).toBe('/go/guests');
    expect(resolveHref(SETTINGS.href, 'settings', 'e1')).toBe('/admin/settings');
  });

  it('picks the most specific match, so /events/e1/guests is not "Tiến độ"', () => {
    expect(matchScore({ kind: 'static', path: '/events' }, '/events/e1/guests')).toBeGreaterThan(0);
    expect(activeNav(ALL, '/events/e1/guests')?.id).toBe('guests');
    expect(activeNav(ALL, '/events')?.id).toBe('progress');
    expect(activeNav(ALL, '/events/e1/plan')?.id).toBe('progress');
    expect(activeNav(ALL, '/admin/settings')?.id).toBe('settings');
    expect(activeNav(ALL, '/nowhere')).toBeNull();
  });

  it('keeps the parent active on a sub-tab route and finds the sub-tab', () => {
    expect(activeNav(ALL, '/events/e1/seating')?.id).toBe('guests');
    expect(activeSubTab(GUESTS, '/events/e1/seating')?.id).toBe('seating');
    expect(activeSubTab(GUESTS, '/events/e1/guests/new')?.id).toBe('list');
  });
});

describe('buildShellModel', () => {
  const nav = (id: string, order: number, permission: string, section: 'main' | 'admin' = 'main'): NavEntry => ({
    id, section, order, label: id, icon: 'users', accent: 'blue', href: { kind: 'static', path: `/${id}` },
    permission: permission as Permission, legacyTabIds: [], header: { title: id, subtitle: '' },
  });
  const sub = (parentNav: string, id: string, order: number, permission: string): SubTab => ({
    parentNav, id, order, label: id, href: { kind: 'static', path: `/${parentNav}/${id}` }, permission: permission as Permission,
  });

  it('drops entries and sub-tabs the actor may not use and sorts by order', () => {
    const model = buildShellModel({
      main: [nav('b', 2, 'x.read'), nav('a', 1, 'x.read'), nav('secret', 0, 'x.admin')],
      admin: [nav('users', 1, 'x.admin', 'admin')],
      subTabsOf: (id) => (id === 'a' ? [sub('a', 't2', 2, 'x.read'), sub('a', 't1', 1, 'x.read'), sub('a', 'hidden', 0, 'x.admin')] : []),
      allowed: (p) => p === ('x.read' as Permission),
      brand: { title: 'SỰ KIỆN SCE', subtitle: 'Trung tâm' },
      user: { name: 'A', roleLabel: 'Chuyên viên', department: null },
    });
    expect(model.main.map((n) => n.id)).toEqual(['a', 'b']);
    expect(model.main[0]!.subTabs.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(model.admin).toEqual([]);
  });

  it('visibleActions filters by permission and orders slot entries', () => {
    const out = visibleActions(
      [{ id: 'z', order: 2, permission: 'p.a' as Permission }, { id: 'y', order: 1, permission: 'p.a' as Permission }, { id: 'n', order: 0, permission: 'p.b' as Permission }],
      (p) => p === ('p.a' as Permission),
    );
    expect(out.map((a) => a.id)).toEqual(['y', 'z']);
  });
});
