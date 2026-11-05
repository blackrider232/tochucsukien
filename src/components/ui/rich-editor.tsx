'use client';

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import type { SanitizedHtml } from '@/core/brand';
import { sanitizeRichHtml } from '@/core/text';
import type { IconName, RichEditorApi, RichEditorProps } from './kit.types';
import { IconButton } from './button';

type Format = 'bold' | 'italic' | 'underline' | 'justifyLeft' | 'justifyCenter' | 'justifyRight' | 'justifyFull';

const FORMATS: ReadonlyArray<{ cmd: Format; icon: IconName; label: string }> = [
  { cmd: 'bold', icon: 'bold', label: 'In đậm' },
  { cmd: 'italic', icon: 'italic', label: 'In nghiêng' },
  { cmd: 'underline', icon: 'underline', label: 'Gạch chân' },
  { cmd: 'justifyLeft', icon: 'align-left', label: 'Căn trái' },
  { cmd: 'justifyCenter', icon: 'align-center', label: 'Căn giữa' },
  { cmd: 'justifyRight', icon: 'align-right', label: 'Căn phải' },
  { cmd: 'justifyFull', icon: 'align-justify', label: 'Căn đều hai bên' },
];

const EditorApi = createContext<RichEditorApi | null>(null);

/** For the toolbar extras and children of a RichEditor: inserts at the caret of the editor they sit in. */
export function useRichEditor(): RichEditorApi {
  const api = useContext(EditorApi);
  if (!api) throw new Error('useRichEditor is used inside a RichEditor');
  return api;
}

/**
 * A rich-text page with a text-format toolbar, on the browser's editing commands. The toolbar remembers the selection
 * made inside the page and puts it back before every command; what is pasted is sanitized before it lands; what
 * `onChange` receives is sanitized again, so the form never holds what the page holds raw. The page is one tab stop
 * and the toolbar another, with arrow keys, Home and End moving along it.
 */
export function RichEditor({ initialHtml, onChange, label, toolbarExtras, children }: RichEditorProps) {
  const page = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const saved = useRef<Range | null>(null);
  const stop = useRef(0);
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

  // Roving tabindex over whatever buttons the toolbar holds, extras included.
  const rove = useCallback(() => {
    bar.current?.querySelectorAll<HTMLElement>('button').forEach((b, i) => { b.tabIndex = i === stop.current ? 0 : -1; });
  }, []);
  useLayoutEffect(rove);

  const buttons = () => Array.from(bar.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []);
  const onBarKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = buttons();
    const from = items.indexOf(document.activeElement as HTMLElement);
    if (from < 0 || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (from + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    items[to]?.focus();
  };
  const onBarFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    const i = Array.from<Element>(bar.current?.querySelectorAll('button') ?? []).indexOf(e.target as Element);
    if (i >= 0) {
      stop.current = i;
      rove();
    }
  };

  const emit = () => onChange(sanitizeRichHtml(page.current?.innerHTML ?? ''));

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

  const api = useMemo<RichEditorApi>(() => ({
    insertHtml: (html: SanitizedHtml) => exec('insertHTML', html),
    insertText: (text: string) => exec('insertText', text),
  // exec closes over refs and the latest onChange only when called.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    apply(() => (html ? document.execCommand('insertHTML', false, sanitizeRichHtml(html)) : document.execCommand('insertText', false, text)));
  };

  return (
    <EditorApi.Provider value={api}>
    <div className="space-y-2">
      <div
        ref={bar}
        role="toolbar"
        aria-label="Định dạng văn bản"
        onKeyDown={onBarKeyDown}
        onFocus={onBarFocus}
        // The page keeps its selection while a toolbar button is pressed.
        onMouseDown={(e) => e.preventDefault()}
        className="flex flex-wrap items-center gap-1 rounded-control border border-line bg-surface-2 p-1"
      >
        {FORMATS.map((f) => (
          <IconButton key={f.cmd} icon={f.icon} label={f.label} pressed={active.has(f.cmd)} onClick={() => exec(f.cmd)} />
        ))}
        <IconButton icon="undo" label="Hoàn tác trong văn bản" onClick={() => exec('undo')} />
        <IconButton icon="redo" label="Làm lại trong văn bản" onClick={() => exec('redo')} />
        {toolbarExtras}
      </div>
      {children}
      <div
        ref={page}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        onInput={emit}
        onPaste={onPaste}
        className="h-96 max-w-full overflow-auto rounded-control border border-control-border bg-paper p-4 font-serif text-print-base leading-snug text-paper-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      />
    </div>
    </EditorApi.Provider>
  );
}
