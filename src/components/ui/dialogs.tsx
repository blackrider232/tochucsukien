'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { ConfirmOptions, Dialogs, PromptOptions } from './kit.types';
import { DialogShell } from './dialog-shell';
import { Button } from './button';

type Request = { id: number } & (
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (v: string | null) => void }
  | { kind: 'alert'; options: Omit<ConfirmOptions, 'cancelLabel'>; resolve: () => void }
);
type NewRequest = Request extends infer R ? (R extends Request ? Omit<R, 'id'> : never) : never;

const DialogsContext = createContext<Dialogs | null>(null);

export function useDialogs(): Dialogs {
  const ctx = useContext(DialogsContext);
  if (!ctx) throw new Error('useDialogs needs <UiProviders> (or <DialogsProvider>) above it.');
  return ctx;
}

const CONFIRM_BUTTON = {
  primary: { variant: 'primary' as const },
  danger: { variant: 'danger' as const },
  success: { variant: 'primary' as const, accent: 'emerald' as const },
  warning: { variant: 'primary' as const, accent: 'amber' as const },
};

/** Promise-based confirm, prompt and alert. Text only: options are rendered as React text, never HTML. */
export function DialogsProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<ReadonlyArray<Request>>([]);

  const nextId = useRef(0);
  const push = useCallback((r: NewRequest) => setQueue((q) => [...q, { ...r, id: nextId.current++ } as Request]), []);
  const shift = useCallback(() => setQueue((q) => q.slice(1)), []);

  const api = useMemo<Dialogs>(
    () => ({
      confirm: (options) => new Promise<boolean>((resolve) => push({ kind: 'confirm', options, resolve })),
      prompt: (options) => new Promise<string | null>((resolve) => push({ kind: 'prompt', options, resolve })),
      alert: (options) => new Promise<void>((resolve) => push({ kind: 'alert', options, resolve })),
    }),
    [push],
  );

  const current = queue[0];
  return (
    <DialogsContext.Provider value={api}>
      {children}
      {current?.kind === 'confirm' && (
        <ConfirmView key={current.id} options={current.options} onDone={(v) => { current.resolve(v); shift(); }} />
      )}
      {current?.kind === 'prompt' && (
        <PromptView key={current.id} options={current.options} onDone={(v) => { current.resolve(v); shift(); }} />
      )}
      {current?.kind === 'alert' && (
        <ConfirmView key={current.id} options={{ ...current.options, cancelLabel: undefined }} alert onDone={() => { current.resolve(); shift(); }} />
      )}
    </DialogsContext.Provider>
  );
}

function ConfirmView({ options, onDone, alert }: { options: ConfirmOptions; onDone: (v: boolean) => void; alert?: boolean }) {
  const tone = options.tone ?? 'primary';
  const confirmProps = CONFIRM_BUTTON[tone];
  const dangerous = tone === 'danger';
  return (
    <DialogShell
      open
      role="alertdialog"
      size="sm"
      title={options.title}
      icon={dangerous || tone === 'warning' ? 'alert-triangle' : undefined}
      accent={dangerous ? 'rose' : tone === 'warning' ? 'amber' : 'blue'}
      hideClose
      closeOnBackdrop={false}
      onRequestClose={() => onDone(false)}
      footer={
        <>
          {!alert && (
            <span data-autofocus={dangerous ? '' : undefined}>
              <Button variant="secondary" onClick={() => onDone(false)}>{options.cancelLabel ?? 'Hủy'}</Button>
            </span>
          )}
          <span data-autofocus={dangerous ? undefined : ''}>
            <Button {...confirmProps} onClick={() => onDone(true)}>{options.confirmLabel ?? (alert ? 'Đã hiểu' : 'Xác nhận')}</Button>
          </span>
        </>
      }
    >
      {options.text && <p className="whitespace-pre-line text-sm text-ink-2">{options.text}</p>}
    </DialogShell>
  );
}

function PromptView({ options, onDone }: { options: PromptOptions; onDone: (v: string | null) => void }) {
  const [value, setValue] = useState(options.defaultValue ?? '');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tone = options.tone ?? 'primary';

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (options.required && value.trim() === '') {
      setError('Vui lòng nhập nội dung.');
      inputRef.current?.focus();
      return;
    }
    onDone(value);
  };

  return (
    <DialogShell
      open
      size="sm"
      title={options.title}
      closeOnBackdrop={false}
      onRequestClose={() => onDone(null)}
      footer={
        <>
          <Button variant="secondary" onClick={() => onDone(null)}>{options.cancelLabel ?? 'Hủy'}</Button>
          <Button {...CONFIRM_BUTTON[tone]} onClick={() => submit()}>{options.confirmLabel ?? 'Xác nhận'}</Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-2">
        {options.text && <p className="whitespace-pre-line text-sm text-ink-2">{options.text}</p>}
        <label htmlFor="sce-prompt-input" className="block text-sm font-semibold text-ink">
          {options.label}
          {options.required && <span aria-hidden="true" className="text-red-600"> *</span>}
        </label>
        <input
          id="sce-prompt-input"
          ref={inputRef}
          data-autofocus=""
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          aria-required={options.required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'sce-prompt-error' : undefined}
          className="min-h-touch w-full rounded-control border border-line-strong bg-surface px-3 text-sm text-ink aria-invalid:border-red-600"
        />
        {error && <p id="sce-prompt-error" role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      </form>
    </DialogShell>
  );
}
