import { useId } from 'react';
import type { SectionCardProps } from './kit.types';
import { Icon } from './icons';

/** `accent` is accepted for compatibility and ignored: icon tiles are neutral, so a tint always means a status. */
export function SectionCard({ title, subtitle, icon, actions, children }: SectionCardProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="rounded-card border border-line bg-surface shadow-card">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
        {icon && (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-surface-3 text-ink-2">
            <Icon name={icon} size={18} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="font-heading text-base font-bold text-ink">{title}</h2>
          {subtitle && <p className="text-sm text-ink-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}
