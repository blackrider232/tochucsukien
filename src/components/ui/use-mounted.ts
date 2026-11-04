import { useSyncExternalStore } from 'react';

const noopSubscribe = () => () => {};

/** False during the server render and hydration, true afterwards. Gates portals and browser-only output. */
export function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
