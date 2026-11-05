'use client';

import Link from 'next/link';
import type { ButtonProps, IconButtonProps } from './kit.types';
import { cn } from './cn';
import { Icon, Spinner } from './icons';

const base =
  'inline-flex min-h-touch shrink-0 items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0 aria-busy:cursor-progress';

const VARIANT = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-hover',
  secondary: 'border border-control-border bg-surface text-ink hover:bg-surface-3 active:bg-surface-3 aria-pressed:border-link aria-pressed:bg-selected aria-pressed:text-link',
  ghost: 'text-ink-2 hover:bg-surface-3 active:bg-surface-3 aria-pressed:bg-selected aria-pressed:text-link',
  danger: 'bg-danger text-on-primary hover:bg-danger-hover active:bg-danger-hover',
} as const;

// The 700 step with white text in both themes: a confirm tone stays solid, never a pastel glow on dark.
const ACCENT_PRIMARY = 'bg-(--t700) text-on-primary hover:bg-(--t800) active:bg-(--t800)';

export function buttonClass(variant: NonNullable<ButtonProps['variant']>, accent?: ButtonProps['accent']): string {
  return cn(base, accent && variant === 'primary' ? ACCENT_PRIMARY : VARIANT[variant]);
}

export function Button({ variant = 'primary', accent, icon, loading, disabled, type = 'button', onClick, href, newTab, pressed, children }: ButtonProps) {
  const cls = buttonClass(variant, accent);
  const body = (
    <>
      {loading ? <Spinner /> : icon ? <Icon name={icon} /> : null}
      {children}
    </>
  );
  if (href && !disabled) {
    if (newTab) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" data-tone={accent} className={cls}>
          {body}
          {' '}
          <span className="sr-only">(mở tab mới)</span>
        </a>
      );
    }
    return <Link href={href} data-tone={accent} className={cls}>{body}</Link>;
  }
  return (
    <button
      type={type}
      onClick={(e) => {
        if (loading) e.preventDefault();
        else onClick?.();
      }}
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      aria-pressed={pressed}
      data-tone={accent}
      className={cls}
    >
      {body}
    </button>
  );
}

const ICON_BASE =
  'inline-flex size-touch shrink-0 items-center justify-center rounded-control transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50';

/** Icon-only: `label` is the accessible name and the tooltip. A tone colours the glyph and its hover tint. */
export function IconButton({ icon, label, onClick, href, disabled, tone, pressed }: IconButtonProps) {
  const cls = cn(ICON_BASE, tone ? 'text-(--tone-fg) hover:bg-(--tone-bg) active:bg-(--tone-bg)' : 'text-ink-muted hover:bg-surface-3 hover:text-ink active:bg-surface-3 aria-pressed:bg-selected aria-pressed:text-link');
  if (href && !disabled) {
    return (
      <Link href={href} aria-label={label} title={label} data-tone={tone} className={cls}>
        <Icon name={icon} size={18} />
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} aria-pressed={pressed} data-tone={tone} className={cls}>
      <Icon name={icon} size={18} />
    </button>
  );
}
