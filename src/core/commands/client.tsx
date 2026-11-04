'use client';

// Client side of the write path: toasts, conflict refresh, the per-tab undo
// stack and router.refresh(). Toasts go through CommandFeedbackProvider, which
// the (app) layout wires to the kit's toast host, so core does not import UI.

import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { dispatch } from './dispatch';
import type { CommandId, CommandResult, Inverse, InputOf, OutputOf, RunOptions, UndoApi } from './index';

export interface CommandFeedback {
  notify(tone: 'success' | 'info' | 'warning' | 'error', text: string): void;
}

const NETWORK_FAILURE = 'Không kết nối được máy chủ. Vui lòng thử lại.';
const UNDO_DEPTH = 30;

const FeedbackContext = createContext<CommandFeedback>({
  notify: (tone, text) => {
    if (tone === 'error' || tone === 'warning') console.warn(text);
  },
});

export function CommandFeedbackProvider({ value, children }: { value: CommandFeedback; children: ReactNode }) {
  return <FeedbackContext.Provider value={value}>{children}</FeedbackContext.Provider>;
}

// One undo/redo history per tab, in memory only (core §3.6).
interface History {
  undo: ReadonlyArray<Inverse>;
  redo: ReadonlyArray<Inverse>;
}
let history: History = { undo: [], redo: [] };
const listeners = new Set<() => void>();
function setHistory(next: History) {
  history = next;
  for (const l of listeners) l();
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const EMPTY: History = { undo: [], redo: [] };

/** Called on sign-out. */
export function clearUndo(): void {
  setHistory(EMPTY);
}

async function send(id: CommandId, input: unknown): Promise<CommandResult<unknown>> {
  try {
    return await dispatch(id, input as never);
  } catch {
    return { ok: false, kind: 'unavailable', message: NETWORK_FAILURE };
  }
}

export function useCommand(): <K extends CommandId>(id: K, input: InputOf<K>, opts?: RunOptions) => Promise<OutputOf<K> | undefined> {
  const router = useRouter();
  const feedback = useContext(FeedbackContext);
  return useCallback(
    async <K extends CommandId>(id: K, input: InputOf<K>, opts?: RunOptions): Promise<OutputOf<K> | undefined> => {
      const result = await send(id, input);
      if (!result.ok) {
        feedback.notify(result.kind === 'conflict' ? 'warning' : 'error', result.message);
        if (result.kind === 'conflict' || result.kind === 'not_found' || result.kind === 'gate') router.refresh();
        return undefined;
      }
      if (opts?.success) feedback.notify('success', opts.success);
      if (result.inverse && opts?.undoable !== false) {
        setHistory({ undo: [...history.undo, result.inverse].slice(-UNDO_DEPTH), redo: [] });
      }
      router.refresh();
      return result.value as OutputOf<K>;
    },
    [feedback, router],
  );
}

export function useUndo(): UndoApi {
  const router = useRouter();
  const feedback = useContext(FeedbackContext);
  const h = useSyncExternalStore(subscribe, () => history, () => EMPTY);

  const step = useCallback(
    async (from: 'undo' | 'redo') => {
      const stack = history[from];
      const inverse = stack[stack.length - 1];
      if (!inverse) return;
      const to = from === 'undo' ? 'redo' : 'undo';
      setHistory({ ...history, [from]: stack.slice(0, -1) });
      const result = await send(inverse.command, inverse.input);
      if (!result.ok) {
        feedback.notify('error', result.message);
        router.refresh();
        return;
      }
      if (result.inverse) setHistory({ ...history, [to]: [...history[to], result.inverse].slice(-UNDO_DEPTH) });
      feedback.notify('info', from === 'undo' ? `Đã hoàn tác: ${inverse.label}` : `Đã làm lại: ${inverse.label}`);
      router.refresh();
    },
    [feedback, router],
  );

  return {
    canUndo: h.undo.length > 0,
    canRedo: h.redo.length > 0,
    undoLabel: h.undo[h.undo.length - 1]?.label ?? null,
    redoLabel: h.redo[h.redo.length - 1]?.label ?? null,
    undo: () => step('undo'),
    redo: () => step('redo'),
  };
}
