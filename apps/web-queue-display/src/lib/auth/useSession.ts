import { useSyncExternalStore } from 'react';
import type { SessionClaims } from './claims.ts';
import { session } from './session.ts';

/** Who is logged in, for display; null when nobody is. Never contains the token. On the server (and the first render) it is always null. */
export function useSession(): SessionClaims | null {
  return useSyncExternalStore(session.subscribe, session.getClaims, () => null);
}
