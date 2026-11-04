import { describe, expect, it } from 'vitest';
import { registry, routeMatchDepth, urlPathOfDir } from '@/core/registry';

describe('route helpers', () => {
  it('drops route groups and matches dynamic segments', () => {
    expect(urlPathOfDir('(app)/events/[eventId]/live')).toBe('/events/[eventId]/live');
    expect(urlPathOfDir('api/cron/rsvp-sync')).toBe('/api/cron/rsvp-sync');
    expect(routeMatchDepth('/events/[eventId]/live', '/events/abc/live/duty')).toBe(3);
    expect(routeMatchDepth('/events/[eventId]/live', '/events/abc')).toBe(-1);
    expect(routeMatchDepth('/events', '/eventsx')).toBe(-1);
  });
});

describe('registry', () => {
  it('lists the nine features', () => {
    expect(registry.manifests.map((m) => m.key)).toEqual(['core', 'progress', 'templates', 'guests', 'venue', 'directory', 'comms', 'live', 'reports']);
  });

  it('guards each path with its most specific route', () => {
    expect(registry.routeFor('/events')?.permission).toBe('progress.read');
    expect(registry.routeFor('/events/new')?.permission).toBe('progress.create');
    expect(registry.routeFor('/events/0b0e/guests')?.permission).toBe('guests.read');
    expect(registry.routeFor('/events/0b0e/seating/print')?.permission).toBe('venue.seating.read');
    expect(registry.routeFor('/events/0b0e/invitations/form')?.permission).toBe('comms.read');
    expect(registry.routeFor('/admin/halls')?.permission).toBe('venue.halls.admin');
    expect(registry.routeFor('/admin/users')?.permission).toBe('core.users.read');
    expect(registry.routeFor('/login')).toBeNull();
  });

  it('maps every legacy tab id, including the tab-moduleN aliases', () => {
    expect(registry.legacyRedirect('tab-module4')).toEqual({ kind: 'event', segment: 'guests' });
    expect(registry.legacyRedirect('tab-module1')).toEqual({ kind: 'static', path: '/admin/settings' });
    expect(registry.legacyRedirect('tab-admin-guests')).toEqual({ kind: 'static', path: '/admin/directory' });
    expect(registry.legacyRedirect('tab-nope')).toBeNull();
    const legacy = ['tab-events', 'tab-module2', 'tab-templates', 'tab-module3', 'tab-guests', 'tab-module4', 'tab-booths', 'tab-live', 'tab-module5', 'tab-reports', 'tab-module6', 'tab-admin', 'tab-settings', 'tab-module1', 'tab-users', 'tab-admin-templates', 'tab-admin-halls', 'tab-admin-guests'];
    expect(legacy.filter((id) => registry.legacyRedirect(id) === null)).toEqual([]);
  });

  it('orders the sidebar like the legacy app', () => {
    expect(registry.navFor('main').map((n) => n.label)).toEqual(['Tiến độ', 'Biểu mẫu', 'Khách mời & Chỗ ngồi', 'Gian hàng Hội chợ', 'Tổ chức sự kiện', 'Báo cáo & Tổng kết']);
    expect(registry.navFor('admin').map((n) => n.id)).toEqual(['admin', 'users', 'admin-templates', 'admin-halls', 'admin-guests', 'profile']);
  });

  it('collects sub-tabs other features attach under guests', () => {
    expect(registry.subTabsOf('guests').map((t) => t.id)).toEqual(['guest-list', 'invitations', 'rsvp-form', 'seating']);
  });

  it('knows the single owner of each table', () => {
    expect(registry.ownerOfTable('sce_tcsk_checkins')).toBe('live');
    expect(registry.ownerOfTable('sce_tcsk_profiles')).toBe('core');
    expect(registry.ownerOfTable('sce_tcsk_nope')).toBeNull();
  });
});
