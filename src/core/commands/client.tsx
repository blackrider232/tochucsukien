'use client';

// Client side of the write path: toasts, conflict refresh, the per-tab undo
// stack and router.refresh(). Toasts go through CommandFeedbackProvider, which
// the (app) layout wires to the kit's toast host, so core does not import UI.
// dispatch is imported on first send: @/core/commands re-exports this file, and
// a static import would close the cycle features -> @/core/commands -> dispatch
// -> registry -> features.

import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { CommandFailure, CommandId, CommandResult, Inverse, InputOf, OutputOf, RunOptions, UndoApi } from './index';

export interface CommandFeedback {
  notify(tone: 'success' | 'info' | 'warning' | 'error', text: string): void;
}

const NETWORK_FAILURE = 'Không kết nối được máy chủ. Vui lòng thử lại.';
const OFFLINE = 'Ngoại tuyến: chưa gửi được thay đổi. Chờ có mạng lại rồi thử lại.';
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

// Decision 6: no offline writes. Read at send time, not render time, so a dialog opened before the drop is refused too.
const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const OFFLINE_FAILURE: CommandFailure = { ok: false, kind: 'offline', message: OFFLINE };

async function send(id: CommandId, input: unknown): Promise<CommandResult<unknown>> {
  if (offline()) return OFFLINE_FAILURE;
  try {
    const { dispatch } = await import('./dispatch');
    return await dispatch(id, input as never);
  } catch {
    return { ok: false, kind: 'unavailable', message: NETWORK_FAILURE };
  }
}

/** Like useCommand, but answers the whole result, so a caller can word a refusal apart from a failed request. */
export function useCommandResult(): <K extends CommandId>(id: K, input: InputOf<K>, opts?: RunOptions) => Promise<CommandResult<OutputOf<K>>> {
  const router = useRouter();
  const feedback = useContext(FeedbackContext);
  return useCallback(
    async <K extends CommandId>(id: K, input: InputOf<K>, opts?: RunOptions): Promise<CommandResult<OutputOf<K>>> => {
      const result = (await send(id, input)) as CommandResult<OutputOf<K>>;
      if (!result.ok) {
        feedback.notify(result.kind === 'conflict' || result.kind === 'offline' ? 'warning' : 'error', result.message);
        if (result.kind === 'conflict' || result.kind === 'not_found' || result.kind === 'gate') router.refresh();
        return result;
      }
      if (result.unaudited) feedback.notify('warning', result.unaudited);
      else if (opts?.success) feedback.notify('success', opts.success);
      if (result.inverse && opts?.undoable !== false) {
        setHistory({ undo: [...history.undo, result.inverse].slice(-UNDO_DEPTH), redo: [] });
      }
      router.refresh();
      return result;
    },
    [feedback, router],
  );
}

export function useCommand(): <K extends CommandId>(id: K, input: InputOf<K>, opts?: RunOptions) => Promise<OutputOf<K> | undefined> {
  const run = useCommandResult();
  return useCallback(
    async <K extends CommandId>(id: K, input: InputOf<K>, opts?: RunOptions): Promise<OutputOf<K> | undefined> => {
      const result = await run(id, input, opts);
      return result.ok ? result.value : undefined;
    },
    [run],
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
      if (offline()) {
        feedback.notify('warning', OFFLINE);
        return;
      }
      const to = from === 'undo' ? 'redo' : 'undo';
      setHistory({ ...history, [from]: stack.slice(0, -1) });
      const result = await send(inverse.command, inverse.input);
      if (!result.ok) {
        feedback.notify('error', result.message);
        router.refresh();
        return;
      }
      if (result.inverse) setHistory({ ...history, [to]: [...history[to], result.inverse].slice(-UNDO_DEPTH) });
      if (result.unaudited) feedback.notify('warning', result.unaudited);
      else feedback.notify('info', from === 'undo' ? `Đã hoàn tác: ${inverse.label}` : `Đã làm lại: ${inverse.label}`);
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
