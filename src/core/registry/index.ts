// Feature registry. Each feature owns exactly one manifest file
// (src/features/<key>/manifest.ts, pure data, safe in the proxy) and one slots
// file (src/features/<key>/slots.tsx, client/server components for shared
// chrome). The foundation writes src/features/registry.ts once, importing all
// nine features; module workers never edit it. Sidebar, top bar, sub-tab bars,
// route guards, legacy tab redirects, settings sections and the permission
// matrix are all derived from the manifests. check:contract fails the build if
// a feature directory, a route directory, a table comment, a permission key or
// a command id disagrees with the manifests.

import type { EventId } from '@/core/brand';
import { featureManifests } from '@/features/registry';
import type { PermissionDef, Permission } from '@/core/permissions';
import type { Accent, IconName, Component } from '@/components/ui/kit.types';

export type FeatureKey = 'core' | 'progress' | 'templates' | 'guests' | 'venue' | 'directory' | 'comms' | 'live' | 'reports';

/** Which parallel worker owns the feature directory. */
export type Worker = 'foundation' | 'M2' | 'M3' | 'M4a' | 'M4b' | 'M4c' | 'M5' | 'M6';

export type Href =
  | { kind: 'static'; path: `/${string}` }
  /** '/events/<current or last event>/<segment>'. Without an event: event picker empty state. */
  | { kind: 'event'; segment: string };

export interface NavEntry {
  id: string;
  section: 'main' | 'admin';
  order: number;
  label: string;
  tooltip?: string;
  icon: IconName;
  accent: Accent;
  href: Href;
  /** Sidebar hides the entry, the proxy redirects, the page's data is RLS-filtered. */
  permission: Permission;
  /** 'tab-guests', 'tab-module4', ... mapped by the proxy to href. */
  legacyTabIds: ReadonlyArray<string>;
  header: { title: string; subtitle: string; badge?: string };
}

/** Sub-tabs under a nav entry; any feature may add one to any parent (venue adds 'Sơ đồ chỗ ngồi' under guests). */
export interface SubTab {
  parentNav: string;
  id: string;
  order: number;
  label: string;
  href: Href;
  permission: Permission;
}

export interface RouteSpec {
  /** App-dir directory relative to src/app, e.g. '(app)/events/[eventId]/live'. Subtree is owned. */
  dir: string;
  permission: Permission;
}

export interface FeatureManifest<F extends FeatureKey = FeatureKey> {
  key: F;
  worker: Worker;
  permissions: { readonly [P in Permission as P extends `${F}.${string}` ? P : never]: PermissionDef };
  nav: ReadonlyArray<NavEntry>;
  subTabs: ReadonlyArray<SubTab>;
  routes: ReadonlyArray<RouteSpec>;
  /** Tables this feature owns (the only writer). */
  tables: ReadonlyArray<`sce_tcsk_${string}`>;
  /** Legacy appData keys whose import this feature implements. */
  legacyBlobKeys: ReadonlyArray<string>;
}
/** Identity at runtime; the type pins the permission keys to the feature. check:contract validates the rest. */
export function defineFeature<F extends FeatureKey>(m: FeatureManifest<F>): FeatureManifest<F> {
  return m;
}

/** Shared chrome a feature may fill without editing shell code. Server components unless noted. */
export interface FeatureSlots {
  /** Count bubble next to a nav entry (booths count, pending accounts). */
  navBadges?: Readonly<Record<string, Component<{ eventId: EventId | null }>>>;
  /** Top-bar badge area when one of this feature's nav entries is active (daily report bell). */
  topBarBadge?: Component<{ eventId: EventId | null }>;
  /** Global header buttons (Tạo sự kiện mới, Báo cáo tiến độ). Client components. */
  headerActions?: ReadonlyArray<{ id: string; order: number; permission: Permission; render: Component<Record<string, never>> }>;
  /** Sections on /admin/settings (comms: Hòm thư Google). */
  settingsSections?: ReadonlyArray<{ id: string; order: number; permission: Permission; render: Component<Record<string, never>> }>;
  /** Actions on the event header inside /events/[eventId]/* (Mở biểu mẫu, In kế hoạch). */
  eventActions?: ReadonlyArray<{ id: string; order: number; permission: Permission; render: Component<{ eventId: EventId }> }>;
}
export function defineSlots(feature: FeatureKey, slots: FeatureSlots): FeatureSlots {
  return slots;
}

/** Derived views over the registry, used by the shell and the proxy. */
export interface Registry {
  manifests: ReadonlyArray<FeatureManifest>;
  navFor(section: 'main' | 'admin'): ReadonlyArray<NavEntry>;
  subTabsOf(navId: string): ReadonlyArray<SubTab>;
  routeFor(pathname: string): RouteSpec | null;
  legacyRedirect(tabId: string): Href | null;
  ownerOfTable(table: string): FeatureKey | null;
}
/**
 * URL path of an app-dir directory: route groups dropped, dynamic segments
 * kept as written. '(app)/events/[eventId]/live' -> '/events/[eventId]/live'.
 */
export function urlPathOfDir(dir: string): string {
  const segments = dir.split('/').filter((s) => s !== '' && !/^\(.*\)$/.test(s));
  return `/${segments.join('/')}`;
}

/** Number of matched segments when `pathname` lies in the subtree of `pattern`, else -1. */
export function routeMatchDepth(pattern: string, pathname: string): number {
  const want = pattern.split('/').filter(Boolean);
  const have = pathname.split('/').filter(Boolean);
  if (have.length < want.length) return -1;
  const ok = want.every((seg, i) => (/^\[.+\]$/.test(seg) ? true : seg === have[i]));
  return ok ? want.length : -1;
}

/** The most specific route whose subtree contains the path; route dirs nest (events -> events/[eventId]/guests). */
export function mostSpecificRoute<R extends { dir: string }>(routes: ReadonlyArray<R>, pathname: string): R | null {
  let best: R | null = null;
  let bestDepth = -1;
  for (const r of routes) {
    const depth = routeMatchDepth(urlPathOfDir(r.dir), pathname);
    if (depth > bestDepth) {
      best = r;
      bestDepth = depth;
    }
  }
  return best;
}

export function buildRegistry(manifests: ReadonlyArray<FeatureManifest>): Registry {
  const nav = manifests.flatMap((m) => m.nav);
  const subTabs = manifests.flatMap((m) => m.subTabs);
  const routes = manifests.flatMap((m) => m.routes);
  const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;
  return {
    manifests,
    navFor: (section) => nav.filter((n) => n.section === section).sort(byOrder),
    subTabsOf: (navId) => subTabs.filter((t) => t.parentNav === navId).sort(byOrder),
    routeFor: (pathname) => mostSpecificRoute(routes, pathname),
    legacyRedirect: (tabId) => nav.find((n) => n.legacyTabIds.includes(tabId))?.href ?? null,
    ownerOfTable: (table) => manifests.find((m) => m.tables.includes(table as `sce_tcsk_${string}`))?.key ?? null,
  };
}

let built: Registry | null = null;
// Manifests import defineFeature from this module, so the registry is built on
// first use, after every manifest module has finished evaluating.
function current(): Registry {
  built ??= buildRegistry(featureManifests());
  return built;
}

export const registry: Registry = {
  get manifests() {
    return current().manifests;
  },
  navFor: (section) => current().navFor(section),
  subTabsOf: (navId) => current().subTabsOf(navId),
  routeFor: (pathname) => current().routeFor(pathname),
  legacyRedirect: (tabId) => current().legacyRedirect(tabId),
  ownerOfTable: (table) => current().ownerOfTable(table),
};
