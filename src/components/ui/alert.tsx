import type { AlertProps, IconName } from './kit.types';
import type { Tone } from '@/core/vocab';
import { Icon } from './icons';

const LOOK: Record<AlertProps['tone'], { tone: Tone; icon: IconName; label: string }> = {
  info: { tone: 'blue', icon: 'info', label: 'Thông tin' },
  success: { tone: 'emerald', icon: 'circle-check', label: 'Thành công' },
  warning: { tone: 'amber', icon: 'alert-triangle', label: 'Cảnh báo' },
  danger: { tone: 'red', icon: 'circle-x', label: 'Lỗi' },
};

/** Tinted callout with a distinct icon per tone, so the meaning never rests on colour alone. */
export function Alert({ tone, title, children, action }: AlertProps) {
  const look = LOOK[tone];
  return (
    <div
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      data-tone={look.tone}
      className="flex flex-wrap items-start gap-3 rounded-card border border-(--tone-bd) bg-(--tone-bg) p-3 text-(--tone-fg) sm:flex-nowrap"
    >
      <Icon name={look.icon} size={20} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 basis-56 text-sm">
        <span className="sr-only">{look.label}: </span>
        {title && <p className="font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
