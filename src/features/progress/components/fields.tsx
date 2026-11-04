'use client';

// Two controls the kit does not have yet: a multi-line text field bound to the
// surrounding FormField, and a standalone checkbox for toggles outside a form.

import { useId } from 'react';
import { controlClass } from '@/components/ui/filter-bar';
import { useControl } from '@/components/ui/use-control';

export function TextArea({ name, placeholder, rows = 3 }: { name: string; placeholder?: string; rows?: number }) {
  const { id, register, aria } = useControl(name);
  return <textarea id={id} rows={rows} placeholder={placeholder} className={`${controlClass} py-2`} {...register} {...aria} />;
}

export function CheckToggle({ checked, onChange, label, description, disabled, strike }: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  /** Line-through the label when checked (sub-tasks). */
  strike?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-touch cursor-pointer items-start gap-2.5 py-1 has-disabled:cursor-not-allowed has-disabled:opacity-60">
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-emerald-600" />
      <span className="min-w-0">
        <span className={`block text-sm ${checked && strike ? 'text-ink-muted line-through' : 'text-ink'}`}>{label}</span>
        {description && <span className="block text-xs text-ink-muted">{description}</span>}
      </span>
    </label>
  );
}
