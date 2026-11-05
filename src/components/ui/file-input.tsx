'use client';

import { useId, useRef, useState, type ChangeEvent } from 'react';
import type { FileInputProps } from './kit.types';
import { cn } from './cn';
import { errorClass } from './control-class';
import { Icon } from './icons';
import { IconButton } from './button';
import { useControlMeta } from './use-control';

const KB = 1024;
const MB = KB * KB;

function sizeText(bytes: number): string {
  if (bytes < KB) return `${bytes} B`;
  if (bytes < MB) return `${Math.round(bytes / KB)} KB`;
  return `${String(Math.round((bytes / MB) * 10) / 10).replace('.', ',')} MB`;
}

/** Whether `file` is covered by an <input accept> list: extensions (.csv), MIME types (text/csv) and families (image/*). */
function accepted(file: File, accept: string | undefined): boolean {
  const tokens = (accept ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (tokens.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return tokens.some((t) => (t.startsWith('.') ? name.endsWith(t) : t.endsWith('/*') ? type.startsWith(t.slice(0, -1)) : type === t));
}

/**
 * A file picker that checks the type and size before it hands the file over. The native input is the tab stop and
 * covers a button-looking face, so Enter and Space open the picker and the form label names it. A refused file is
 * never passed on: `onChange(null)` and a message say so.
 */
export function FileInput({ name, accept, maxBytes, label, onChange, disabled }: FileInputProps) {
  const { id, form, aria } = useControlMeta(name);
  const errId = useId();
  const field = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const take = (next: File | null, refusal: string | null) => {
    setFile(next);
    setProblem(refusal);
    if (!next && field.current) field.current.value = '';
    form?.setValue(name, next ?? undefined, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
    onChange(next);
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    if (!picked) return take(null, null);
    if (!accepted(picked, accept)) return take(null, `Chỉ nhận tệp ${(accept ?? '').split(',').map((t) => t.trim()).join(', ')}.`);
    if (maxBytes !== undefined && picked.size > maxBytes) return take(null, `Tệp lớn hơn ${sizeText(maxBytes)}. Chọn tệp nhỏ hơn.`);
    take(picked, null);
  };

  const describedBy = [aria['aria-describedby'], problem ? errId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative inline-flex rounded-control has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus">
          <span
            aria-hidden="true"
            className={cn(
              'inline-flex min-h-touch items-center gap-2 rounded-control border bg-surface px-3.5 text-sm font-semibold text-ink',
              problem || aria['aria-invalid'] ? 'border-danger-ink' : 'border-control-border',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <Icon name="upload" size={16} />
            {file ? 'Đổi tệp' : 'Chọn tệp'}
          </span>
          <input
            ref={field}
            id={id}
            name={name}
            type="file"
            accept={accept}
            disabled={disabled}
            aria-label={label}
            aria-invalid={problem || aria['aria-invalid'] ? true : undefined}
            aria-describedby={describedBy}
            aria-required={aria['aria-required']}
            onChange={onPick}
            className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
        </div>
        {file ? (
          <>
            <span className="min-w-0 break-all text-sm font-semibold text-ink">{file.name}</span>
            <span className="text-sm text-ink-muted">{sizeText(file.size)}</span>
            <IconButton icon="x" label="Xóa tệp đã chọn" onClick={() => take(null, null)} disabled={disabled} />
          </>
        ) : (
          <span className="text-sm text-ink-muted">Chưa chọn tệp</span>
        )}
      </div>
      {problem && <p id={errId} role="alert" className={errorClass}>{problem}</p>}
    </div>
  );
}
