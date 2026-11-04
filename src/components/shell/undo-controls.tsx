'use client';

import { useEffect } from 'react';
import { IconButton } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { useUndo } from '@/core/commands';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Undo and redo buttons plus Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y. Keys are left alone while typing. */
export function UndoControls() {
  const undo = useUndo();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey && undo.canUndo) {
        e.preventDefault();
        void undo.undo();
      } else if (((key === 'z' && e.shiftKey) || key === 'y') && undo.canRedo) {
        e.preventDefault();
        void undo.redo();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [undo]);

  return (
    <>
      <span className={cn(!undo.canUndo && 'max-sm:hidden')}>
        <IconButton icon="undo" label={undo.undoLabel ? `Hoàn tác: ${undo.undoLabel}` : 'Hoàn tác'} disabled={!undo.canUndo} onClick={() => void undo.undo()} />
      </span>
      <span className="max-sm:hidden">
        <IconButton icon="redo" label={undo.redoLabel ? `Làm lại: ${undo.redoLabel}` : 'Làm lại'} disabled={!undo.canRedo} onClick={() => void undo.redo()} />
      </span>
    </>
  );
}
