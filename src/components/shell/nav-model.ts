// The shell's data model and the pure functions over it. The server layout builds a ShellModel
// from the registry and the actor's permissions; everything below the layout is plain data.

import type { Accent, IconName } from '@/components/ui/kit.types';

export type ShellHref = { kind: 'static'; path: string } | { kind: 'event'; segment: string };

export interface ShellSubTab {
  id: string;
  label: string;
  href: ShellHref;
}

export interface ShellNavItem {
  id: string;
  label: string;
  tooltip?: string;
  icon: IconName;
  accent: Accent;
  href: ShellHref;
  header: { title: string; subtitle: string; badge?: string };
  subTabs: ReadonlyArray<ShellSubTab>;
}

export interface ShellModel {
  brand: { title: string; subtitle: string };
  main: ReadonlyArray<ShellNavItem>;
  admin: ReadonlyArray<ShellNavItem>;
  user: { name: string; roleLabel: string; department: string | null };
}

const EVENT_PATH = /^\/events\/([^/]+)(?:\/|$)/;

/** The event id in '/events/<id>/...', or null on '/events', '/events/new' and elsewhere. */
export function eventIdFromPath(pathname: string): string | null {
  const id = EVENT_PATH.exec(pathname)?.[1];
  return id && id !== 'new' ? id : null;
}

/** An event-scoped entry links to the current event, or to /go/<nav> which picks one. */
export function resolveHref(href: ShellHref, navId: string, eventId: string | null): string {
  if (href.kind === 'static') return href.path;
  return eventId ? `/events/${eventId}/${href.segment}` : `/go/${navId}`;
}

/** 0 when the path is not under the href; otherwise a score that grows with how specific the match is. */
export function matchScore(href: ShellHref, pathname: string): number {
  if (href.kind === 'event') {
    const m = new RegExp(`^/events/[^/]+/${href.segment}(?:/|$)`).test(pathname);
    return m ? 1000 + href.segment.length : 0;
  }
  const { path } = href;
  if (path === '/') return pathname === '/' ? 1 : 0;
  return pathname === path || pathname.startsWith(`${path}/`) ? path.length : 0;
}

/** The nav entry whose own href or sub-tab matches the path best. */
export function activeNav(items: ReadonlyArray<ShellNavItem>, pathname: string): ShellNavItem | null {
  let best: { item: ShellNavItem; score: number } | null = null;
  for (const item of items) {
    const score = Math.max(matchScore(item.href, pathname), ...item.subTabs.map((t) => matchScore(t.href, pathname)));
    if (score > 0 && (!best || score > best.score)) best = { item, score };
  }
  return best?.item ?? null;
}

/** The sub-tab of `item` matching the path; the first one when only the parent matches. */
export function activeSubTab(item: ShellNavItem, pathname: string): ShellSubTab | null {
  let best: { tab: ShellSubTab; score: number } | null = null;
  for (const tab of item.subTabs) {
    const score = matchScore(tab.href, pathname);
    if (score > 0 && (!best || score > best.score)) best = { tab, score };
  }
  return best?.tab ?? item.subTabs[0] ?? null;
}
