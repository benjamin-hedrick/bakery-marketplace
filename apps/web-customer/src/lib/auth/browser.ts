import { authConfig } from './config.ts';
import { buildAuthorizeUrl, completeLogin, type LoginDeps } from './login.ts';
import { challengeFor, randomUrlSafe } from './pkce.ts';
import { session } from './session.ts';

// Browser-only wiring of the login flow to the real session, storage and fetch. The logic itself is in login.ts, which the unit tests drive.

function browserDeps(): LoginDeps {
  if (typeof window === 'undefined') throw new Error('The login flow only runs in the browser.');
  return {
    storage: window.sessionStorage,
    session,
    now: Date.now,
    random: randomUrlSafe,
    challenge: challengeFor,
    config: authConfig(window.location.origin),
    fetch: (url, init) => window.fetch(url, init),
  };
}

/** Sends the browser to the issuer to log in, and back to `returnTo` (a path in this app) afterwards. */
export async function startLogin(returnTo: string): Promise<void> {
  window.location.assign(await buildAuthorizeUrl(returnTo, browserDeps()));
}

/** Called by the callback page with the query string the issuer sent back. */
export function finishLogin(search: URLSearchParams): Promise<{ returnTo: string }> {
  return completeLogin(search, browserDeps());
}

/** Ends the login. The token only ever existed in memory, so there is nothing else to remove. */
export function logout(): void {
  session.clear();
}
