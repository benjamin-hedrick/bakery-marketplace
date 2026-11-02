import { useEffect, useSyncExternalStore } from 'react';

// What the page knows about the login (ADR-0019). The page holds NO token: the session lives on the server behind an HttpOnly cookie, so the
// only things asked of it are "who am I" (GET /api/auth/me) and "end it" (POST /api/auth/logout). This is for display and for choosing what
// to show; the services decide what the login may do.

export interface SessionUser {
  subject: string;
  name?: string | undefined;
  email?: string | undefined;
  roles: string[];
  /** When the session ends at the latest, in milliseconds since the epoch. */
  sessionExpiresAt: number;
}

export type SessionState = { status: 'unknown' } | { status: 'anonymous' } | { status: 'user'; user: SessionUser };

const UNKNOWN: SessionState = { status: 'unknown' };
const ANONYMOUS: SessionState = { status: 'anonymous' };

let state: SessionState = UNKNOWN;
let started = false;
const listeners = new Set<() => void>();

function set(next: SessionState) {
  state = next;
  listeners.forEach((listener) => listener());
}

/** Asks the server who is logged in. A failed answer is "nobody": the page then offers the login, and the services still decide. */
export async function refreshSession(): Promise<void> {
  try {
    const response = await fetch('/api/auth/me', {
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
    });
    const body = response.ok ? ((await response.json()) as { authenticated?: boolean; user?: SessionUser }) : undefined;
    set(body?.authenticated && body.user ? { status: 'user', user: body.user } : ANONYMOUS);
  } catch {
    set(ANONYMOUS);
  }
}

/** The service said the login is over (UNAUTHENTICATED): show the login again without another round trip. */
export function markLoggedOut(): void {
  set(ANONYMOUS);
}

export function useSession(): SessionState {
  const current = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => UNKNOWN,
  );
  useEffect(() => {
    if (started) return;
    started = true;
    void refreshSession();
  }, []);
  return current;
}

/** Sends the browser to log in and back to `returnTo` (a path in this app; the server checks it again). */
export function startLogin(returnTo: string): void {
  // A full navigation on purpose: the login is a redirect through the server and the issuer, not a page of this app.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
}

/**
 * Ends the login on the server, then reloads the home page: only a reload empties what the page fetched with the login (Relay keeps it in memory),
 * so whoever logs in next on this screen can never be shown the previous vendor's orders.
 */
export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: '{}',
    });
  } finally {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/');
  }
}
