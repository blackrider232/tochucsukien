'use client';

import type { RefObject } from 'react';
import { Icon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';
import { clearUndo } from '@/core/commands';
import type { ShellModel } from './nav-model';
import { SIDEBAR_BUTTON } from './sidebar';
import { SIGN_OUT_PATH } from './session';

/** Who is signed in, plus the sign-out button (a form POST, also used by the idle timer). */
export function AccountMenu({ user, collapsed, formRef }: { user: ShellModel['user']; collapsed: boolean; formRef: RefObject<HTMLFormElement | null> }) {
  const initials = user.name.split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase() || '?';
  return (
    <div className={cn('flex items-center gap-2.5', collapsed && 'flex-col')}>
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-active text-xs font-bold text-on-primary">{initials}</span>
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-sidebar-ink">{user.name}</p>
          <p className="truncate text-2xs text-sidebar-muted">{user.roleLabel}{user.department ? ` · ${user.department}` : ''}</p>
        </div>
      )}
      <form ref={formRef} method="post" action={SIGN_OUT_PATH} onSubmit={() => clearUndo()}>
        <button
          type="submit"
          aria-label="Đăng xuất"
          title="Đăng xuất"
          className={SIDEBAR_BUTTON}
        >
          <Icon name="log-out" size={18} />
        </button>
      </form>
    </div>
  );
}
