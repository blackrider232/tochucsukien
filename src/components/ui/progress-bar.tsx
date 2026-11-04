import type { ProgressBarProps } from './kit.types';

/** Percent clamped to 0..100. A zero or negative max reads as 0%. */
export function progressPercent(value: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)));
}

export function ProgressBar({ value, max, tone, label }: ProgressBarProps) {
  const percent = progressPercent(value, max);
  const resolved = tone ?? (percent >= 100 ? 'emerald' : 'blue');
  return (
    <div data-tone={resolved} className="w-full">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        {label ? <span className="min-w-0 truncate font-medium text-ink-2">{label}</span> : <span />}
        <span className="shrink-0 font-semibold tabular-nums text-ink-2">{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max > 0 ? max : 0}
        aria-valuenow={Math.min(Math.max(value, 0), max > 0 ? max : 0)}
        aria-label={label ?? 'Tiến độ'}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-3"
      >
        <div className="h-full rounded-full bg-(--tone-solid) transition-[width] duration-300" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
