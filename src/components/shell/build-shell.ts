// Pure assembly of the shell model from registry data and a permission test. No framework imports,
// so it is testable with fakes. load-shell.tsx binds it to the real registry and request context.

import type { Permission } from '@/core/permissions';
import type { NavEntry, SubTab } from '@/core/registry';
import type { ShellHref, ShellModel, ShellNavItem } from './nav-model';

export interface ShellSources {
  main: ReadonlyArray<NavEntry>;
  admin: ReadonlyArray<NavEntry>;
  subTabsOf(navId: string): ReadonlyArray<SubTab>;
  allowed(permission: Permission): boolean;
  brand: ShellModel['brand'];
  user: ShellModel['user'];
}

const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;
const toHref = (h: NavEntry['href']): ShellHref => (h.kind === 'static' ? { kind: 'static', path: h.path } : { kind: 'event', segment: h.segment });

export function buildShellModel(src: ShellSources): ShellModel {
  const item = (n: NavEntry): ShellNavItem => ({
    id: n.id,
    label: n.label,
    tooltip: n.tooltip,
    icon: n.icon,
    accent: n.accent,
    href: toHref(n.href),
    header: n.header,
    subTabs: src
      .subTabsOf(n.id)
      .filter((t) => src.allowed(t.permission))
      .sort(byOrder)
      .map((t) => ({ id: t.id, label: t.label, href: toHref(t.href) })),
  });
  const section = (entries: ReadonlyArray<NavEntry>) =>
    [...entries].filter((n) => src.allowed(n.permission)).sort(byOrder).map(item);
  return { brand: src.brand, user: src.user, main: section(src.main), admin: section(src.admin) };
}

interface PermittedAction { id: string; order: number; permission: Permission }

/** Slot entries the actor may see, in display order. */
export function visibleActions<T extends PermittedAction>(actions: ReadonlyArray<T> | undefined, allowed: (p: Permission) => boolean): T[] {
  return (actions ?? []).filter((a) => allowed(a.permission)).sort(byOrder);
}
