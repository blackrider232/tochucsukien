'use client';

import { useId, useState, type ChangeEvent, type FocusEventHandler, type Ref } from 'react';
import { useController, useWatch } from 'react-hook-form';
import type {
  CheckboxProps, DateInputProps, MoneyInputProps, NumberInputProps, SelectProps, TextInputProps, TimeInputProps,
} from './kit.types';
import { controlClass } from './filter-bar';
import { useAppContext } from '@/core/auth';
import { useControl, useControlMeta } from './use-control';

export function TextInput({ name, placeholder, type = 'text', autoComplete }: TextInputProps) {
  const { id, register, aria } = useControl(name);
  return <input id={id} type={type} placeholder={placeholder} autoComplete={autoComplete} className={controlClass} {...register} {...aria} />;
}

export function NumberInput({ name, min, max, step }: NumberInputProps) {
  const { id, register, aria } = useControl(name, {
    setValueAs: (v: unknown) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
  });
  return <input id={id} type="number" inputMode="decimal" min={min} max={max} step={step} className={`${controlClass} tabular-nums`} {...register} {...aria} />;
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
    <p id={id} className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-300">
      Ngày nghỉ lễ: {holiday.name}
    </p>
  );
}

export function TimeInput({ name, defaultValue }: TimeInputProps) {
  const { id, register, aria } = useControl(name);
  return <input id={id} type="time" step={60} defaultValue={defaultValue} className={controlClass} {...register} {...aria} />;
}

export function Select<K extends string>({ name, options, placeholder }: SelectProps<K>) {
  const { id, register, aria } = useControl(name);
  return (
    <select id={id} className={controlClass} {...register} {...aria}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/** Own label and description, so it is used inside a form directly rather than inside FormField. */
export function Checkbox({ name, label, description }: CheckboxProps) {
  const { id, register, aria, error } = useControl(name);
  const descId = `${id}-desc`;
  const errId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="flex min-h-touch cursor-pointer items-start gap-3 py-1.5">
        <input
          id={id}
          type="checkbox"
          className="mt-0.5 size-5 shrink-0 accent-primary"
          {...register}
          aria-invalid={aria['aria-invalid']}
          aria-describedby={[description ? descId : null, error ? errId : null].filter(Boolean).join(' ') || undefined}
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">{label}</span>
          {description && <span id={descId} className="block text-xs text-ink-muted">{description}</span>}
        </span>
      </label>
      {error && <p id={errId} role="alert" className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>}
    </div>
  );
}
