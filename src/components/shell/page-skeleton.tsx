// Shown by loading.tsx while a page's data is read, so a click answers at once and the sidebar and header stay put.
export function PageSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="space-y-4">
      <span className="sr-only">Đang tải…</span>
      <div className="h-8 w-1/3 animate-pulse rounded-card bg-surface-3" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-card bg-surface-3" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-card bg-surface-3" />
    </div>
  );
}
