import { fetchAuthSettings, toAuthConfig } from './config.ts';
import { buildAuthorizeUrl, completeLogin, type LoginDeps } from './login.ts';
import { challengeFor, randomUrlSafe } from './pkce.ts';
import { session } from './session.ts';

// Browser-only wiring of the login flow to the real session, storage and fetch. The logic itself is in login.ts, which the unit tests drive.
// Where to log in comes from this app's server (GET /api/config), not from the build.

async function browserDeps(): Promise<LoginDeps> {
  if (typeof window === 'undefined') throw new Error('The login flow only runs in the browser.');
  return {
    storage: window.sessionStorage,
    session,
    now: Date.now,
    random: randomUrlSafe,
    challenge: challengeFor,
    config: toAuthConfig(await fetchAuthSettings(), window.location.origin),
    fetch: (url, init) => window.fetch(url, init),
  };
}

/** Sends the browser to the issuer to log in, and back to `returnTo` (a path in this app) afterwards. */
export async function startLogin(returnTo: string): Promise<void> {
  window.location.assign(await buildAuthorizeUrl(returnTo, await browserDeps()));
}

/** Called by the callback page with the query string the issuer sent back. */
export function finishLogin(search: URLSearchParams): Promise<{ returnTo: string }> {
  return browserDeps().then((deps) => completeLogin(search, deps));
}

/**
 * Ends the login. The token only ever existed in memory, so there is nothing else to remove, except what the page has learned with it:
 * Relay keeps what it fetched (an order, say) in the page's memory. A full reload drops all of it, so whoever logs in next on this tab
 * can never be shown the previous vendor's orders.
 */
export function logout(): void {
  session.clear();
  // A full navigation on purpose, not router.push: only a reload empties the page's memory.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign('/');
}
