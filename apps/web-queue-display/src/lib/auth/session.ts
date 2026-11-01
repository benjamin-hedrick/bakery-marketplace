import { parseClaims, type SessionClaims } from './claims.ts';

/** A token this close to expiring counts as expired, so a request is not sent with one that dies in flight. */
const SKEW_MS = 30_000;

export interface SessionStore {
  /** Keeps the token in memory. Throws, and keeps any current session, when it is not a usable token or is already expired. */
  set(token: string): void;
  clear(): void;
  /** The token to send as a bearer credential, or null. Only the network layer should call this. */
  getAccessToken(): string | null;
  /** What the page may show. The same object until the session changes, so it suits `useSyncExternalStore`. Never contains the token. */
  getClaims(): SessionClaims | null;
  subscribe(listener: () => void): () => void;
}

interface Options {
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}

/**
 * The login session (ADR-0006: header-only, in-memory token). The token lives in this object and nowhere else: not in `localStorage`,
 * `sessionStorage` or a cookie, so a page reload ends the login (open item 24, accepted for now). A timer ends it at expiry so the
 * page can say so.
 */
export function createSessionStore(options: Options = {}): SessionStore {
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const cancel = options.cancel ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let token: string | null = null;
  let claims: SessionClaims | null = null;
  let timer: unknown;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  const live = () => claims !== null && now() < claims.expiresAt - SKEW_MS;

  function clear() {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
    const had = token !== null;
    token = null;
    claims = null;
    if (had) notify();
  }

  return {
    set(next) {
      const parsed = parseClaims(next);
      if (parsed === null) throw new Error('The token could not be read.');
      if (now() >= parsed.expiresAt - SKEW_MS) throw new Error('The token has already expired.');
      if (timer !== undefined) cancel(timer);
      token = next;
      claims = parsed;
      timer = schedule(clear, parsed.expiresAt - SKEW_MS - now());
      notify();
    },
    clear,
    getAccessToken() {
      if (live()) return token;
      if (token !== null) clear(); // expired: end the session so the page can say so
      return null;
    },
    getClaims: () => (live() ? claims : null),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The one session of this browser tab. Only ever created in the browser: the server never holds a user token (ADR-0012, item 26). */
export const session: SessionStore = createSessionStore();
