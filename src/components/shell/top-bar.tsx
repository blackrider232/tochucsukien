'use client';

import type { ReactNode } from 'react';
import { IconButton } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme';
import { OfflineIndicator } from './offline-indicator';
import { UndoControls } from './undo-controls';

export function TopBar({
  title, subtitle, badge, headerActions, onOpenMenu,
}: {
  title: string;
  subtitle?: string;
  /** From the active feature's topBarBadge slot. */
  badge?: ReactNode;
  headerActions: ReadonlyArray<ReactNode>;
  onOpenMenu: () => void;
}) {
  return (
    <header data-shell className="sticky top-0 z-30 bg-surface shadow-[inset_0_-1px_0_var(--line)]">
      {/* One 56 px row on every width: on phones the theme switch is in the drawer and redo hides. */}
      <div className="flex min-h-14 flex-nowrap items-center gap-2 px-3 py-1.5 sm:px-5">
        <div className="md:hidden">
          <IconButton icon="menu" label="Mở menu" onClick={onOpenMenu} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold leading-tight text-ink sm:text-lg">{title}</h1>
          {subtitle && <p className="truncate text-xs text-ink-muted">{subtitle}</p>}
        </div>
        {badge}
        <OfflineIndicator />
        <div className="flex shrink-0 items-center">
          <UndoControls />
          <span className="max-md:hidden"><ThemeToggle /></span>
        </div>
        {headerActions.length > 0 && <div className="flex shrink-0 items-center gap-2">{headerActions}</div>}
      </div>
    </header>
  );
}
