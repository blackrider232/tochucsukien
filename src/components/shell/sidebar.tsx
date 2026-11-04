'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';
import { useTheme } from '@/components/ui/theme';
import { activeNav, eventIdFromPath, resolveHref, type ShellModel, type ShellNavItem } from './nav-model';

/** Icon buttons on the dark rail: light glyph, rail hover, so they keep 3:1 where a default IconButton would not. */
export const SIDEBAR_BUTTON =
  'flex size-touch shrink-0 items-center justify-center rounded-control text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-ink active:bg-sidebar-hover';

/** The theme switch lives in the drawer on phones, so the top bar stays one row. */
function SidebarThemeToggle() {
  const { theme, toggle } = useTheme();
  const label = theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';
  return (
    <button type="button" onClick={toggle} aria-label={label} title={label} className={SIDEBAR_BUTTON}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
    </button>
  );
}

function NavSection({
  title, items, pathname, collapsed, badges, onNavigate,
}: {
  title: string;
  items: ReadonlyArray<ShellNavItem>;
  pathname: string;
  collapsed: boolean;
  badges: Readonly<Record<string, ReactNode>>;
  onNavigate?: () => void;
}) {
  if (items.length === 0) return null;
  const eventId = eventIdFromPath(pathname);
  const current = activeNav(items, pathname);
  return (
    <section aria-label={title} className="space-y-1">
      <h2 className={cn('px-3 pb-1 pt-2 text-xs font-semibold text-sidebar-muted', collapsed && 'sr-only')}>{title}</h2>
      <ul className="space-y-1">
        {items.map((item) => {
          const active = current?.id === item.id;
          const badge = badges[item.id];
          return (
            <li key={item.id}>
              <Link
                href={resolveHref(item.href, item.id, eventId)}
                aria-current={active ? 'page' : undefined}
                aria-label={collapsed ? item.label : undefined}
                title={item.tooltip ?? item.label}
                onClick={onNavigate}
                className={cn(
                  'flex min-h-touch items-center gap-3 rounded-control px-3 text-sm font-semibold transition-colors',
                  collapsed && 'justify-center px-0',
                  active ? 'bg-sidebar-active text-on-primary shadow-card' : 'text-sidebar-ink hover:bg-sidebar-hover',
                )}
              >
                <span className={cn('flex w-5 shrink-0 justify-center', active ? 'text-on-primary' : 'text-sidebar-muted')}>
                  <Icon name={item.icon} size={collapsed ? 20 : 16} />
                </span>
                {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                {!collapsed && badge}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Logo block, grouped navigation and the footer slot. Used by the desktop rail and the mobile drawer. */
export function SidebarContent({
  model, pathname, collapsed = false, badges, onNavigate, onToggleCollapse, onClose, footer,
}: {
  model: ShellModel;
  pathname: string;
  collapsed?: boolean;
  badges: Readonly<Record<string, ReactNode>>;
  onNavigate?: () => void;
  /** Present on desktop only. */
  onToggleCollapse?: () => void;
  /** Present in the mobile drawer only. */
  onClose?: () => void;
  footer?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col text-sidebar-ink">
      <div className={cn('flex items-center gap-2.5 border-b border-sidebar-line p-3', collapsed && 'flex-col')}>
        <Link href="/" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2.5" aria-label={`${model.brand.title}, về trang chủ`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed small PNG from /public, no optimizer needed */}
          <img src="/icons/app-icon-192.png" alt="" width={36} height={36} className="size-9 shrink-0 rounded-control bg-paper p-0.5" />
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-sidebar-ink">{model.brand.title}</span>
              <span className="block truncate text-2xs font-medium text-sidebar-muted">{model.brand.subtitle}</span>
            </span>
          )}
        </Link>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
            className={SIDEBAR_BUTTON}
          >
            <Icon name="chevron-right" size={16} className={cn('transition-transform', !collapsed && 'rotate-180')} />
          </button>
        )}
        {onClose && (
          <>
            <SidebarThemeToggle />
            <button type="button" onClick={onClose} aria-label="Đóng menu" title="Đóng menu" className={SIDEBAR_BUTTON}>
              <Icon name="x" size={18} />
            </button>
          </>
        )}
      </div>
      <nav aria-label="Chức năng chính" className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        <NavSection title="Danh mục chức năng" items={model.main} pathname={pathname} collapsed={collapsed} badges={badges} onNavigate={onNavigate} />
        {model.admin.length > 0 && <div aria-hidden="true" className="border-t border-sidebar-line" />}
        <NavSection title="Hệ thống & Quản trị" items={model.admin} pathname={pathname} collapsed={collapsed} badges={badges} onNavigate={onNavigate} />
      </nav>
      {footer && <div className={cn('border-t border-sidebar-line p-3', collapsed && 'px-2')}>{footer}</div>}
    </div>
  );
}
