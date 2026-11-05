'use client';

import { createContext, useContext, useEffect } from 'react';

type SetCount = (subTabId: string, count: number | string | null) => void;

/** Provided by the app shell, which owns the sub-tab bar. Outside a shell the hook does nothing. */
export const SubTabCountContext = createContext<SetCount | null>(null);

/**
 * Puts a count badge on the sub-tab with this registry id ('4/10', 12) while the calling page is mounted.
 * Sub-tabs live in the shell, and the number is the page's data, so the page hands it over instead of the registry.
 */
export function useSubTabCount(subTabId: string, count: number | string | null): void {
  const set = useContext(SubTabCountContext);
  useEffect(() => {
    set?.(subTabId, count);
    return () => set?.(subTabId, null);
  }, [set, subTabId, count]);
}
