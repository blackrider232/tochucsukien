'use client';

import { useId } from 'react';
import { useFormContext, type RegisterOptions } from 'react-hook-form';
import { useFieldError, useFieldState } from './form';

/** Id, ARIA state and form access for a control, without registering it. */
export function useControlMeta(name: string) {
  const field = useFieldState();
  const ownId = useId();
  const form = useFormContext();
  const error = useFieldError(name);
  const inField = field?.name === name;

  return {
    id: inField ? field.id : ownId,
    form: form ?? null,
    error,
    aria: {
      'aria-invalid': error ? true : undefined,
      'aria-describedby': inField ? field.describedBy : undefined,
      'aria-required': inField && field.required ? true : undefined,
    } as const,
  };
}

/** Shared wiring of a native control to its FormField and form: id, ARIA state, register props. */
export function useControl(name: string, options?: RegisterOptions) {
  const meta = useControlMeta(name);
  return { ...meta, register: meta.form ? meta.form.register(name, options) : { name } };
}
