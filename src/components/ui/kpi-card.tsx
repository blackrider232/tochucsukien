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
  // flex-col + justify-start: a <button> card would otherwise centre its content when the grid stretches it.
  const className = cn(
    'flex h-full w-full flex-col justify-start rounded-card border border-line p-4 text-left shadow-card',
    highlight ? 'bg-(--tone-bg)' : 'bg-surface',
    interactive && 'transition hover:border-control-border hover:shadow-pop active:translate-y-px',
  );

  const body: ReactNode = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink-muted">{label}</p>
          <p className="mt-1 flex items-baseline gap-1.5 font-heading text-2xl font-bold tabular-nums text-ink">
            {value}
            {ofTotal !== undefined && <span className="text-sm font-medium text-ink-muted">/ {ofTotal}</span>}
          </p>
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-surface-3 text-ink-2">
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
          <ProgressBar value={progress.value} max={progress.max} label={label} />
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
