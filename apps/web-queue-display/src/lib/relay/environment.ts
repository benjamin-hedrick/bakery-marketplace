import { Environment, Network, RecordSource, Store } from 'relay-runtime';
import type { FetchFunction } from 'relay-runtime';
import { GraphQLRequestError, UnauthenticatedError } from '@bakery/web-session/errors';
import { markLoggedOut } from '../session.ts';

// The display is client-rendered only (ADR-0012: no server rendering where there is nothing public to render), so there is one Relay environment,
// in the browser, and the server never fetches or holds anything. It talks to the GraphQL BFF through this app's own origin (ADR-0013).

const BROWSER_GRAPHQL_URL = '/api/graphql';

export { GraphQLRequestError, UnauthenticatedError } from '@bakery/web-session/errors';

/** The browser's network function. Exported for the equivalence tests (WI-CHAOS-005), which run it against real faults and injected ones. */
export const fetchGraphQL: FetchFunction = async (params, variables) => {
  const timeout = startTimeout();
  try {
    // The login is the HttpOnly cookie, which the browser sends to our own origin by itself; this server attaches the bearer token (ADR-0019).
    const res = await fetch(BROWSER_GRAPHQL_URL, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: params.text, variables }),
      signal: timeout.signal,
    });
    if (res.headers.get('x-session-ended') === '1') markLoggedOut(); // the server ended the session (renewal refused): the page offers the login
    if (!res.ok) throw new Error(`GraphQL request failed: ${res.status}`);
    const json = await res.json();
    if (json.errors?.length) {
      if (json.errors.some((e: { extensions?: { code?: string } }) => e.extensions?.code === 'UNAUTHENTICATED')) {
        markLoggedOut(); // the login is over: the page offers it again
        throw new UnauthenticatedError();
      }
      throw new GraphQLRequestError(json.errors);
    }
    return json;
  } finally {
    timeout.clear();
  }
};

/**
 * How long a GraphQL call may go without an answer (register 196). Past it the call fails as a reset connection does, and the screen shows its failure
 * notice instead of waiting for ever. Longer than the web route's own wait for the BFF (UPSTREAM_TIMEOUT_MS, 30 s), so a slow BFF still comes back as the
 * route's answer. The same value as the customer app's.
 */
export const GRAPHQL_TIMEOUT_MS = 35_000;

/** An abort signal that fires after GRAPHQL_TIMEOUT_MS with a TimeoutError, and a way to cancel it once the answer has been read. */
function startTimeout(): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException(`No answer within ${GRAPHQL_TIMEOUT_MS / 1000} s`, 'TimeoutError')),
    GRAPHQL_TIMEOUT_MS,
  );
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

let browserEnvironment: Environment | undefined;

/** One environment per browser tab. It sends no token: the page has none (ADR-0019). */
export function getBrowserEnvironment(): Environment {
  if (typeof window === 'undefined') throw new Error('getBrowserEnvironment() called on the server');
  browserEnvironment ??= new Environment({
    network: Network.create(fetchGraphQL),
    store: new Store(new RecordSource()),
  });
  return browserEnvironment;
}
