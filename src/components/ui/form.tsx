'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createContext, useContext, useId, type FormEvent, type ReactNode } from 'react';
import {
  FormProvider, get, useForm, useFormContext,
  type DefaultValues, type FieldValues, type SubmitHandler, type UseFormProps, type UseFormReturn,
} from 'react-hook-form';
import type { z } from 'zod';
import type { FormFieldProps } from './kit.types';
import { errorClass, labelClass } from './control-class';

/**
 * One form hook for every screen: react-hook-form + the zod schema the command
 * parses on the server, so client and server validation agree. Errors appear
 * after the first submit, then update on change.
 */
export function useZodForm<S extends z.ZodType>(
  schema: S,
  options?: Omit<UseFormProps<z.input<S> & FieldValues, unknown, z.output<S> & FieldValues>, 'resolver'> & {
    defaultValues?: DefaultValues<z.input<S> & FieldValues>;
  },
): UseFormReturn<z.input<S> & FieldValues, unknown, z.output<S> & FieldValues> {
  return useForm<z.input<S> & FieldValues, unknown, z.output<S> & FieldValues>({
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    ...options,
    resolver: zodResolver(schema as never) as never,
  });
}

/** Provides the form to every control and submits through handleSubmit (noValidate: zod is the validator). */
export function Form<V extends FieldValues, O extends FieldValues>({
  form, onSubmit, children, className, id,
}: {
  form: UseFormReturn<V, unknown, O>;
  onSubmit: SubmitHandler<O>;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    void form.handleSubmit(onSubmit)(e);
  };
  return (
    <FormProvider {...(form as unknown as UseFormReturn<FieldValues>)}>
      <form id={id} noValidate onSubmit={submit} className={className}>
        {children}
      </form>
    </FormProvider>
  );
}

interface FieldState {
  name: string;
  id: string;
  describedBy: string | undefined;
  required: boolean;
  invalid: boolean;
}
const FieldContext = createContext<FieldState | null>(null);

export function useFieldState(): FieldState | null {
  return useContext(FieldContext);
}

/** Resolves the error message of `name` from the surrounding form, if any. */
export function useFieldError(name: string): string | undefined {
  const form = useFormContext();
  const error = (form ? get(form.formState.errors, name) : undefined) as { message?: unknown } | undefined;
  return typeof error?.message === 'string' ? error.message : undefined;
}

/** The red star plus "(bắt buộc)" for screen readers; colour is never the only marker. */
export function RequiredMark() {
  return (
    <>
      <span aria-hidden="true" className="ml-0.5 text-danger-ink">*</span>
      <span className="sr-only"> (bắt buộc)</span>
    </>
  );
}

/** Label, control, unit, hint and error as one unit; the control gets id, aria-invalid and aria-describedby. */
export function FormField({ label, name, required, hint, suffix, children }: FormFieldProps) {
  const id = useId();
  const error = useFieldError(name);
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <FieldContext.Provider value={{ name, id, describedBy, required: Boolean(required), invalid: Boolean(error) }}>
      <div className="space-y-1">
        <label htmlFor={id} className={labelClass}>
          {label}
          {required && <RequiredMark />}
        </label>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">{children}</div>
          {suffix && <span className="shrink-0 text-sm text-ink-muted">{suffix}</span>}
        </div>
        {hint && <p id={hintId} className="text-xs text-ink-muted">{hint}</p>}
        {error && <p id={errorId} role="alert" className={errorClass}>{error}</p>}
      </div>
    </FieldContext.Provider>
  );
}
