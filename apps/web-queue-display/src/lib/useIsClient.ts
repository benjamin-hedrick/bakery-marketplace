import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False on the server and during hydration, true afterwards in the browser. Lets a page render only what the server can know, then switch
 * to what needs the browser (a login, a request through Relay) without a hydration mismatch.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
