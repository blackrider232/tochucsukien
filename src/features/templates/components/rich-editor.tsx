'use client';

// The admin's document editor: a contenteditable page with a toolbar. The kit has no editor and
// the package set is frozen, so this is built on the browser's editing commands. Two things make
// the toolbar reliable (m3 B22): it remembers the selection made inside the page and puts it back
// before every command, and what is pasted is sanitized before it lands. Whatever the page holds
// is sanitized again on the server when saved.

import { useEffect, useRef, useState } from 'react';
import { Button, Combobox, FormField, IconButton } from '@/components/ui';
import type { SanitizedHtml } from '@/core/brand';
import { sanitizeRichHtml } from '@/core/text';
import { NEW_TABLE_HTML } from '../domain/new-template';
import { MERGE_TAGS, tagToken, type MergeTag } from '../domain/merge-tags';

type Format = 'bold' | 'italic' | 'underline' | 'justifyLeft' | 'justifyCenter' | 'justifyRight' | 'justifyFull';

const FORMATS: ReadonlyArray<{ cmd: Format; short: string; label: string; cls?: string }> = [
  { cmd: 'bold', short: 'B', label: 'In đậm', cls: 'font-bold' },
  { cmd: 'italic', short: 'I', label: 'In nghiêng', cls: 'italic' },
  { cmd: 'underline', short: 'U', label: 'Gạch chân', cls: 'underline' },
  { cmd: 'justifyLeft', short: 'Trái', label: 'Căn trái' },
  { cmd: 'justifyCenter', short: 'Giữa', label: 'Căn giữa' },
  { cmd: 'justifyRight', short: 'Phải', label: 'Căn phải' },
  { cmd: 'justifyFull', short: 'Đều', label: 'Căn đều hai bên' },
];

const tagSearch = async (q: string): Promise<ReadonlyArray<MergeTag>> => {
  const needle = q.trim().toLowerCase();
  return MERGE_TAGS.filter((t) => !needle || t.label.toLowerCase().includes(needle) || t.tag.toLowerCase().includes(needle));
};

export function RichEditor({ initialHtml, onChange }: { initialHtml: string; onChange: (html: string) => void }) {
  const page = useRef<HTMLDivElement>(null);
  const saved = useRef<Range | null>(null);
  const [active, setActive] = useState<ReadonlySet<Format>>(new Set());

  // The initial document is set once, imperatively: React must never re-render over what the user types.
  useEffect(() => {
    if (page.current) page.current.innerHTML = sanitizeRichHtml(initialHtml);
  }, [initialHtml]);

  useEffect(() => {
    const onSelection = () => {
      const sel = document.getSelection();
      const el = page.current;
      if (!sel || sel.rangeCount === 0 || !el || !el.contains(sel.anchorNode)) return;
      saved.current = sel.getRangeAt(0).cloneRange();
      setActive(new Set(FORMATS.filter((f) => document.queryCommandState(f.cmd)).map((f) => f.cmd)));
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, []);

  const emit = () => onChange(page.current?.innerHTML ?? '');

  /** Focus the page, restore the remembered selection (or the end of the document), run the command. */
  const apply = (command: () => void) => {
    const el = page.current;
    if (!el) return;
    el.focus();
    const sel = document.getSelection();
    if (!sel) return;
    if (saved.current && el.contains(saved.current.commonAncestorContainer)) {
      sel.removeAllRanges();
      sel.addRange(saved.current);
    } else {
      const end = document.createRange();
      end.selectNodeContents(el);
      end.collapse(false);
      sel.removeAllRanges();
      sel.addRange(end);
    }
    command();
    emit();
  };
  const exec = (command: string, value?: string) => apply(() => document.execCommand(command, false, value));

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    const clean: SanitizedHtml | null = html ? sanitizeRichHtml(html) : null;
    apply(() => (clean ? document.execCommand('insertHTML', false, clean) : document.execCommand('insertText', false, text)));
  };

  return (
    <div className="space-y-2">
      <div role="toolbar" aria-label="Định dạng văn bản" className="flex flex-wrap items-center gap-1 rounded-control border border-line bg-surface-2 p-1">
        {FORMATS.map((f) => (
          <span key={f.cmd} className={f.cls}>
            <Button variant="ghost" pressed={active.has(f.cmd)} onClick={() => exec(f.cmd)}>
              <span aria-hidden="true">{f.short}</span>
              <span className="sr-only">{f.label}</span>
            </Button>
          </span>
        ))}
        <Button variant="ghost" icon="layers" onClick={() => exec('insertHTML', NEW_TABLE_HTML)}>Chèn bảng</Button>
        <IconButton icon="undo" label="Hoàn tác trong văn bản" onClick={() => exec('undo')} />
        <IconButton icon="redo" label="Làm lại trong văn bản" onClick={() => exec('redo')} />
      </div>
      <div className="max-w-md">
        <FormField label="Chèn thẻ trộn {{…}}" name="mergeTag" hint="Gõ để tìm. Thẻ được thay bằng dữ liệu của sự kiện khi dùng biểu mẫu.">
          <Combobox
            name="mergeTag"
            search={tagSearch}
            itemKey={(t) => t.tag}
            itemLabel={(t) => `${t.label} — ${tagToken(t.tag)}`}
            onPick={(t) => exec('insertText', tagToken(t.tag))}
          />
        </FormField>
      </div>
      <div
        ref={page}
        role="textbox"
        aria-multiline="true"
        aria-label="Nội dung biểu mẫu"
        contentEditable
        suppressContentEditableWarning
        spellCheck
        onInput={emit}
        onPaste={onPaste}
        className="h-96 overflow-auto rounded-control border border-control-border bg-paper p-4 font-serif text-print-base leading-snug text-paper-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      />
    </div>
  );
}
