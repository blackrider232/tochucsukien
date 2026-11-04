'use client';

import { usePathname } from 'next/navigation';
import { useRef, useState, type ReactNode } from 'react';
import { LinkTabs } from '@/components/ui/tabs';
import { cn } from '@/components/ui/cn';
import { useBoolPref } from '@/core/prefs';
import { AccountMenu } from './account-menu';
import { Drawer } from './drawer';
import { IdleGuard } from './idle-guard';
import { activeNav, activeSubTab, eventIdFromPath, resolveHref, type ShellModel } from './nav-model';
import { SidebarContent } from './sidebar';
import { TopBar } from './top-bar';

/** Pre-rendered slot output from the features' slots.tsx, keyed by nav id where relevant. */
export interface ShellSlots {
  navBadges: Readonly<Record<string, ReactNode>>;
  topBarBadges: Readonly<Record<string, ReactNode>>;
  headerActions: ReadonlyArray<ReactNode>;
}

/**
 * The app frame: collapsible sidebar (drawer on phones), top bar, sub-tab bar, main region and the idle guard.
 * It knows nothing about features; every label, route and badge arrives through `model` and `slots`.
 */
export function AppShell({ model, slots, children }: { model: ShellModel; slots: ShellSlots; children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useBoolPref('sce_sidebar_collapsed', false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const signOutForm = useRef<HTMLFormElement>(null);

  const all = [...model.main, ...model.admin];
  const current = activeNav(all, pathname);
  const sub = current && current.subTabs.length > 0 ? activeSubTab(current, pathname) : null;
  const eventId = eventIdFromPath(pathname);

  const account = <AccountMenu user={model.user} collapsed={collapsed} formRef={signOutForm} />;

  return (
    <div className="flex min-h-dvh">
      <aside
        data-shell
        aria-label="Thanh bên"
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 bg-sidebar transition-[width] duration-200 md:block',
          collapsed ? 'w-[4.5rem]' : 'w-64',
        )}
      >
        <SidebarContent
          model={model}
          pathname={pathname}
          collapsed={collapsed}
          badges={slots.navBadges}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          footer={account}
        />
      </aside>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} label="Menu điều hướng">
        <SidebarContent
          model={model}
          pathname={pathname}
          badges={slots.navBadges}
          onNavigate={() => setDrawerOpen(false)}
          onClose={() => setDrawerOpen(false)}
          footer={<AccountMenu user={model.user} collapsed={false} formRef={signOutForm} />}
        />
      </Drawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          title={current?.header.title ?? model.brand.title}
          subtitle={current?.header.subtitle}
          badge={current ? slots.topBarBadges[current.id] : undefined}
          headerActions={slots.headerActions}
          onOpenMenu={() => setDrawerOpen(true)}
        />
        {current && current.subTabs.length > 0 && (
          <div data-shell className="border-b border-line bg-surface px-3 sm:px-5">
            <LinkTabs
              variant="underline"
              activeId={sub?.id ?? ''}
              items={current.subTabs.map((t) => ({ id: t.id, label: t.label, href: resolveHref(t.href, current.id, eventId) }))}
            />
          </div>
        )}
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 p-3 outline-none sm:p-5">
          {children}
        </main>
      </div>

      <IdleGuard onSignOut={() => signOutForm.current?.requestSubmit()} />
    </div>
  );
}
