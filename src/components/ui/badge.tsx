import type { BadgeProps, StatusBadgeProps } from './kit.types';
import { cn } from './cn';
import { Icon } from './icons';

/** Toned chip. The text always carries the meaning; colour only reinforces it. */
export function Badge({ tone, pulse, icon, children }: BadgeProps) {
  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-flex max-w-full items-center gap-1 break-words rounded-full bg-(--tone-bg) px-2 py-0.5 text-left text-xs font-semibold text-(--tone-fg)',
        pulse && 'animate-pulse-soft',
      )}
    >
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

/** Label and tone come from the vocabulary registry, so one status looks the same on every screen. */
export function StatusBadge<K extends string>({ registry, value, size = 'md', pulse }: StatusBadgeProps<K>) {
  const entry = registry[value] as { label: string; short: string; tone: BadgeProps['tone'] } | undefined;
  return (
    <Badge tone={entry?.tone ?? 'slate'} pulse={pulse}>
      {entry ? (size === 'sm' ? entry.short : entry.label) : value}
    </Badge>
  );
}
