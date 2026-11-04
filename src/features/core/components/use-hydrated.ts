import { useSyncExternalStore } from 'react';

const noopSubscribe = () => () => {};

/**
 * False until React has hydrated. The kit Form has no method, so a submit before
 * hydration is a native GET that puts the typed password in the URL; the auth
 * forms keep their submit button disabled until then.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
