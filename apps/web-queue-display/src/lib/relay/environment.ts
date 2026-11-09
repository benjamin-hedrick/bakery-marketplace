import { Environment, Network, RecordSource, Store } from 'relay-runtime';
import type { FetchFunction } from 'relay-runtime';
import { GraphQLRequestError, UnauthenticatedError } from '@bakery/web-session/errors';
import { markLoggedOut } from '../session';

// The display is client-rendered only (ADR-0012: no server rendering where there is nothing public to render), so there is one Relay environment,
// in the browser, and the server never fetches or holds anything. It talks to the GraphQL BFF through this app's own origin (ADR-0013).

const BROWSER_GRAPHQL_URL = '/api/graphql';

export { GraphQLRequestError, UnauthenticatedError } from '@bakery/web-session/errors';

const fetchGraphQL: FetchFunction = async (params, variables) => {
  // The login is the HttpOnly cookie, which the browser sends to our own origin by itself; this server attaches the bearer token (ADR-0019).
  const res = await fetch(BROWSER_GRAPHQL_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: params.text, variables }),
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
};

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
