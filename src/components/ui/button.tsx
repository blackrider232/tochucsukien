'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import type { ButtonProps, IconButtonProps } from './kit.types';
import { cn } from './cn';
import { Icon } from './icons';

const base =
  'inline-flex min-h-touch shrink-0 items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

const VARIANT = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-surface-3',
  ghost: 'text-ink-2 hover:bg-surface-3',
  danger: 'bg-red-700 text-white hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-500',
} as const;

const ACCENT_PRIMARY = 'bg-(--tone-solid) text-(--tone-on-solid) hover:opacity-90';

export function Button({ variant = 'primary', accent, icon, loading, disabled, type = 'button', onClick, children }: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-tone={accent}
      className={cn(base, accent && variant === 'primary' ? ACCENT_PRIMARY : VARIANT[variant])}
    >
      {loading ? <Loader2 aria-hidden="true" width={16} height={16} className="animate-spin" /> : icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

const TONE_ICON: Record<string, string> = {
  red: 'text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40',
  rose: 'text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40',
  emerald: 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40',
  amber: 'text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40',
};

/** Icon-only: `label` is the accessible name and the tooltip. */
export function IconButton({ icon, label, onClick, href, disabled, tone }: IconButtonProps) {
  const cls = cn(
    'inline-flex size-touch shrink-0 items-center justify-center rounded-control transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    (tone && TONE_ICON[tone]) ?? 'text-ink-muted hover:bg-surface-3 hover:text-ink',
  );
  if (href && !disabled) {
    return (
      <Link href={href} aria-label={label} title={label} className={cls}>
        <Icon name={icon} size={18} />
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={cls}>
      <Icon name={icon} size={18} />
    </button>
  );
}
