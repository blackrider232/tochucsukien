// UI preferences, the only place localStorage is allowed (eslint enforces it).
// Holds device settings only: theme, sidebar collapse, check-in beep. No user data.

'use client';

import { useCallback, useSyncExternalStore } from 'react';

export type PrefKey = 'theme' | 'sce_sidebar_collapsed' | 'sce_beep';

const listeners = new Set<() => void>();

function readRaw(key: PrefKey): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: PrefKey, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // private mode or blocked storage: the preference lasts for this page view only
    memory.set(key, value);
  }
  for (const l of listeners) l();
}

const memory = new Map<PrefKey, string | null>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** String preference. `null` removes it. The server render and first hydration see `fallback`. */
export function usePref<T extends string>(key: PrefKey, fallback: T): [T, (next: T | null) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => (memory.has(key) ? memory.get(key)! : readRaw(key)),
    () => null,
  );
  const set = useCallback((next: T | null) => writeRaw(key, next), [key]);
  return [(value ?? fallback) as T, set];
}

export function useBoolPref(key: PrefKey, fallback: boolean): [boolean, (next: boolean) => void] {
  const [raw, setRaw] = usePref<'1' | '0'>(key, fallback ? '1' : '0');
  const set = useCallback((next: boolean) => setRaw(next ? '1' : '0'), [setRaw]);
  return [raw === '1', set];
}
