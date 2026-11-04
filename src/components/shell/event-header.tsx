import type { ReactNode } from 'react';

/**
 * Header of every /events/[eventId]/* page: title and meta on the left, the features' eventActions slot
 * on the right, the switcher above. The event layout renders it; the sub-tab bar comes from the shell.
 */
export function EventHeader({
  title, meta, switcher, actions,
}: {
  title: string;
  /** Date, venue, department as short text lines. */
  meta?: ReadonlyArray<string>;
  switcher?: ReactNode;
  actions?: ReadonlyArray<ReactNode>;
}) {
  return (
    <section aria-label="Thông tin sự kiện" className="mb-4 flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1 basis-64 space-y-1">
        {switcher}
        <h2 className="text-xl font-bold text-ink">{title}</h2>
        {meta && meta.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-ink-muted">
            {meta.map((m) => <li key={m}>{m}</li>)}
          </ul>
        )}
      </div>
      {actions && actions.length > 0 && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </section>
  );
}
