'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { KpiCardProps } from './kit.types';
import { cn } from './cn';
import { Icon } from './icons';
import { Badge } from './badge';
import { ProgressBar } from './progress-bar';

/** A clickable card is a real button or link; a plain one is a div. */
export function KpiCard({ label, value, icon, accent, ofTotal, caption, progress, badge, highlight, onClick, href }: KpiCardProps) {
  const interactive = Boolean(onClick || href);
  const className = cn(
    'block w-full rounded-card border bg-surface p-4 text-left shadow-card',
    highlight ? 'border-(--tone-solid) ring-1 ring-(--tone-solid)' : 'border-line',
    interactive && 'transition hover:border-(--tone-solid) hover:shadow-pop',
  );

  const body: ReactNode = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
          <p className="mt-1 flex items-baseline gap-1.5 text-2xl font-bold tabular-nums text-ink">
            {value}
            {ofTotal !== undefined && <span className="text-sm font-medium text-ink-muted">/ {ofTotal}</span>}
          </p>
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-(--tone-bg) text-(--tone-fg)">
          <Icon name={icon} size={20} />
        </span>
      </div>
      {(caption || badge) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {badge && <Badge tone={badge.tone} pulse={badge.pulse}>{badge.text}</Badge>}
          {caption && <p className="text-xs text-ink-muted">{caption}</p>}
        </div>
      )}
      {progress && (
        <div className="mt-3">
          <ProgressBar value={progress.value} max={progress.max} tone={accent} label={label} />
        </div>
      )}
    </>
  );

  if (href) {
    return <Link href={href} data-tone={accent} className={className}>{body}</Link>;
  }
  if (onClick) {
    return <button type="button" onClick={onClick} data-tone={accent} className={className}>{body}</button>;
  }
  return <div data-tone={accent} className={className}>{body}</div>;
}
