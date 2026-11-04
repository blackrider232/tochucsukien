import { useId } from 'react';
import type { SectionCardProps } from './kit.types';
import { Icon } from './icons';

export function SectionCard({ title, subtitle, icon, accent = 'blue', actions, children }: SectionCardProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} data-tone={accent} className="rounded-card border border-line bg-surface shadow-card">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
        {icon && (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-(--tone-bg) text-(--tone-fg)">
            <Icon name={icon} size={18} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-base font-bold text-ink">{title}</h2>
          {subtitle && <p className="text-sm text-ink-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}
