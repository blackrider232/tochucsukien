'use client';

import { useId, useState, type ChangeEvent, type FocusEventHandler, type Ref } from 'react';
import { useController, useWatch } from 'react-hook-form';
import type {
  CheckboxProps, DateInputProps, MoneyInputProps, NumberInputProps, RadioGroupProps, SelectProps, SwitchProps, TextareaProps,
  TextInputProps, TimeInputProps,
} from './kit.types';
import { cn } from './cn';
import { controlClass, errorClass, labelClass } from './control-class';
import { RequiredMark } from './form';
import { useAppContext } from '@/core/auth';
import { useControl, useControlMeta } from './use-control';

export function TextInput({ name, placeholder, type = 'text', autoComplete }: TextInputProps) {
  const { id, register, aria } = useControl(name);
  return <input id={id} type={type} placeholder={placeholder} autoComplete={autoComplete} className={controlClass} {...register} {...aria} />;
}

export function NumberInput({ name, min, max, step, disabled }: NumberInputProps) {
  const { id, register, aria } = useControl(name, {
    setValueAs: (v: unknown) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
  });
  return <input id={id} type="number" inputMode="decimal" min={min} max={max} step={step} disabled={disabled} className={`${controlClass} tabular-nums`} {...register} {...aria} />;
}

const MAX_MONEY_DIGITS = 15;

/** Whole dong with '.' thousands separators. The form value is a plain integer (or undefined when empty). */
export function MoneyInput({ name }: MoneyInputProps) {
  const { form } = useControlMeta(name);
  return form ? <MoneyInBound name={name} /> : <MoneyInFree name={name} />;
}

function MoneyInBound({ name }: MoneyInputProps) {
  const { id, aria } = useControlMeta(name);
  const { field } = useController({ name });
  const digits = typeof field.value === 'number' && Number.isFinite(field.value) ? String(Math.trunc(field.value)) : '';
  return (
    <MoneyBox
      id={id} name={name} digits={digits} aria={aria}
      inputRef={field.ref}
      onBlur={field.onBlur}
      onDigits={(clean) => field.onChange(clean === '' ? undefined : Number(clean))}
    />
  );
}

function MoneyInFree({ name }: MoneyInputProps) {
  const { id, aria } = useControlMeta(name);
  const [digits, setDigits] = useState('');
  return <MoneyBox id={id} name={name} digits={digits} aria={aria} onDigits={setDigits} />;
}

function MoneyBox({ id, name, digits, aria, inputRef, onBlur, onDigits }: {
  id: string; name: string; digits: string; aria: object;
  inputRef?: Ref<HTMLInputElement>; onBlur?: FocusEventHandler<HTMLInputElement>;
  onDigits: (clean: string) => void;
}) {
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[.\s,đ]/g, '');
    if (raw !== '' && !/^\d+$/.test(raw)) return;
    onDigits(raw.slice(0, MAX_MONEY_DIGITS).replace(/^0+(?=\d)/, ''));
  };
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        ref={inputRef}
        onBlur={onBlur}
        inputMode="numeric"
        autoComplete="off"
        value={digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
        onChange={onChange}
        className={`${controlClass} pr-9 text-right tabular-nums`}
        {...aria}
      />
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-ink-muted">đ</span>
    </div>
  );
}

export function DateInput({ name, min, max, showHolidays }: DateInputProps) {
  const { id, form, register, aria } = useControl(name);
  const noteId = useId();
  const note = showHolidays && form ? <HolidayNote name={name} id={noteId} /> : null;
  return (
    <>
      <input
        id={id}
        type="date"
        min={min}
        max={max}
        className={controlClass}
        {...register}
        {...aria}
        aria-describedby={[aria['aria-describedby'], note ? noteId : null].filter(Boolean).join(' ') || undefined}
      />
      {note}
    </>
  );
}

/** Reads the typed date from the form and names the holiday under the field. */
function HolidayNote({ name, id }: { name: string; id: string }) {
  const { holidays } = useAppContext();
  const value = useWatch({ name }) as unknown;
  const holiday = typeof value === 'string' ? holidays.find((h) => h.date === value && h.kind === 'holiday') : undefined;
  if (!holiday) return <span id={id} hidden />;
  return (
    <p id={id} className="mt-1 text-xs font-medium text-warning-ink">
      Ngày nghỉ lễ: {holiday.name}
    </p>
  );
}

export function TimeInput({ name, defaultValue }: TimeInputProps) {
  const { id, register, aria } = useControl(name);
  return <input id={id} type="time" step={60} defaultValue={defaultValue} className={controlClass} {...register} {...aria} />;
}

export function Select<K extends string>({ name, options, placeholder, defaultValue, value, onChange, label, disabled }: SelectProps<K>) {
  const { id, form, register, aria } = useControl(name);
  // Inside a Form the form owns the value; value and onChange are for a Select used on its own.
  const bound = form || value === undefined ? register : { name, value, onChange: (e: ChangeEvent<HTMLSelectElement>) => onChange?.(e.target.value as K | '') };
  return (
    <select id={id} aria-label={label} disabled={disabled} className={controlClass} defaultValue={form || value !== undefined ? undefined : defaultValue} {...bound} {...aria}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function Textarea({ name, placeholder, rows = 3 }: TextareaProps) {
  const { id, register, aria } = useControl(name);
  return <textarea id={id} rows={rows} placeholder={placeholder} className={`${controlClass} py-2`} {...register} {...aria} />;
}

const BOX = 'mt-0.5 size-5 shrink-0 accent-primary disabled:cursor-not-allowed';

/**
 * Own label and description, so it is used inside a form directly rather than inside FormField.
 * With checked and onChange it is a controlled checkbox outside any form (task lists).
 */
export function Checkbox({ name, label, description, checked, onChange, disabled, strike }: CheckboxProps) {
  const { id, register, aria, error } = useControl(name);
  const descId = `${id}-desc`;
  const errId = `${id}-error`;
  const controlled = checked !== undefined;
  const bound = controlled ? { name, checked, onChange: (e: ChangeEvent<HTMLInputElement>) => onChange?.(e.target.checked) } : register;
  return (
    <div>
      <label htmlFor={id} className="flex min-h-touch cursor-pointer items-start gap-3 py-1.5 has-disabled:cursor-not-allowed">
        <input
          id={id}
          type="checkbox"
          disabled={disabled}
          className={BOX}
          {...bound}
          aria-invalid={aria['aria-invalid']}
          aria-describedby={[description ? descId : null, error ? errId : null].filter(Boolean).join(' ') || undefined}
        />
        <span className="min-w-0">
          <span className={cn('block text-sm font-semibold', strike && checked ? 'text-ink-muted line-through' : 'text-ink')}>{label}</span>
          {description && <span id={descId} className="block text-xs text-ink-muted">{description}</span>}
        </span>
      </label>
      {error && <p id={errId} role="alert" className={errorClass}>{error}</p>}
    </div>
  );
}

/** A fieldset of radios with its legend, hint and error. The form value is the picked option's value. */
export function RadioGroup<K extends string>({ name, label, options, hint, required, orientation = 'vertical', defaultValue }: RadioGroupProps<K>) {
  const { id, form, register, error } = useControl(name);
  const hintId = `${id}-hint`;
  const errId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(' ') || undefined;
  return (
    <fieldset role="radiogroup" aria-describedby={describedBy} aria-invalid={error ? true : undefined} aria-required={required || undefined}>
      <legend className={labelClass}>
        {label}
        {required && <RequiredMark />}
      </legend>
      {hint && <p id={hintId} className="text-xs text-ink-muted">{hint}</p>}
      <div className={cn('mt-1 flex', orientation === 'vertical' ? 'flex-col' : 'flex-wrap gap-x-5')}>
        {options.map((o) => (
          <label key={o.value} className="flex min-h-touch cursor-pointer items-start gap-3 py-1.5">
            <input type="radio" value={o.value} defaultChecked={form ? undefined : o.value === defaultValue} className={BOX} {...register} />
            <span className="min-w-0">
              <span className="block text-sm text-ink">{o.label}</span>
              {o.description && <span className="block text-xs text-ink-muted">{o.description}</span>}
            </span>
          </label>
        ))}
      </div>
      {error && <p id={errId} role="alert" className={errorClass}>{error}</p>}
    </fieldset>
  );
}

/** role="switch": the change applies at once, so the caller saves on onChange and toasts the result. */
export function Switch({ checked, onChange, label, description, disabled }: SwitchProps) {
  const id = useId();
  const descId = `${id}-desc`;
  return (
    <div className="flex min-h-touch items-start justify-between gap-4 py-1.5">
      <span className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer text-sm font-semibold text-ink">{label}</label>
        {description && <span id={descId} className="block text-xs text-ink-muted">{description}</span>}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? descId : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-primary' : 'bg-control-border',
        )}
      >
        <span aria-hidden="true" className={cn('size-5 rounded-full bg-on-primary shadow-card transition-transform', checked ? 'translate-x-5.5' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}
