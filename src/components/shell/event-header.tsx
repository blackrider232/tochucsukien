import type { ReactNode } from 'react';

/**
 * Header of every /events/[eventId]/* page: name and meta on the left, the switcher and the features'
 * eventActions slot on the right. The event layout renders it, with the sub-tab bar under it.
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
    <section aria-label="Thông tin sự kiện" className="flex flex-wrap items-start gap-x-4 gap-y-3">
      <div className="min-w-0 flex-1 basis-64 space-y-1">
        <h2 className="text-xl font-bold text-ink">{title}</h2>
        {meta && meta.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-ink-muted">
            {meta.map((m) => <li key={m}>{m}</li>)}
          </ul>
        )}
      </div>
      {(switcher || (actions && actions.length > 0)) && (
        <div className="flex flex-wrap items-center gap-2">
          {switcher}
          {actions}
        </div>
      )}
    </section>
  );
}
