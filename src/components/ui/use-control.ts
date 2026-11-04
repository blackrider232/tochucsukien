'use client';

import { useId } from 'react';
import { useFormContext, type RegisterOptions } from 'react-hook-form';
import { useFieldError, useFieldState } from './form';

/** Shared wiring of a control to its FormField and form: id, ARIA state, register props. */
export function useControl(name: string, options?: RegisterOptions) {
  const field = useFieldState();
  const ownId = useId();
  const form = useFormContext();
  const error = useFieldError(name);
  const inField = field?.name === name;
  const id = inField ? field.id : ownId;

  return {
    id,
    form: form ?? null,
    error,
    aria: {
      'aria-invalid': error ? true : undefined,
      'aria-describedby': inField ? field.describedBy : undefined,
      'aria-required': inField && field.required ? true : undefined,
    } as const,
    register: form ? form.register(name, options) : { name },
  };
}
