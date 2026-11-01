import { Environment, Network, RecordSource, Store } from 'relay-runtime';
import type { FetchFunction } from 'relay-runtime';
import { session } from '../auth/session.ts';

// The display is client-rendered only (ADR-0012: no server rendering where there is nothing public to render), so there is one Relay environment,
// in the browser, and the server never fetches or holds anything. It talks to the GraphQL BFF through this app's own origin (ADR-0013).

const BROWSER_GRAPHQL_URL = '/api/graphql';

/** The BFF said the login is missing or no longer accepted. The session has been ended; the page should offer to log in again. */
export class UnauthenticatedError extends Error {
  constructor() {
    super('Your login has ended. Please log in again.');
    this.name = 'UnauthenticatedError';
  }
}

interface GraphQLErrorEntry {
  message: string;
  extensions?: { code?: string; reference?: string };
}

/** The BFF answered with errors. `codes` are its stable codes (FORBIDDEN, INTERNAL, ...); `reference` is the trace id to quote when asking for help. */
export class GraphQLRequestError extends Error {
  readonly codes: string[];
  readonly reference: string | undefined;
  constructor(errors: GraphQLErrorEntry[]) {
    super(`GraphQL errors: ${errors.map((e) => e.message).join('; ')}`);
    this.name = 'GraphQLRequestError';
    this.codes = errors.map((e) => e.extensions?.code).filter((c): c is string => typeof c === 'string');
    this.reference = errors.find((e) => typeof e.extensions?.reference === 'string')?.extensions?.reference;
  }
}

/** The bearer token of the current login, as request headers. Evaluated per request, because the login can change at any time. */
function sessionHeaders(): Record<string, string> {
  const token = session.getAccessToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

const fetchGraphQL: FetchFunction = async (params, variables) => {
  const res = await fetch(BROWSER_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...sessionHeaders() },
    body: JSON.stringify({ query: params.text, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL request failed: ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) {
    if (json.errors.some((e: { extensions?: { code?: string } }) => e.extensions?.code === 'UNAUTHENTICATED')) {
      session.clear(); // the token was missing, expired or refused: the login is over
      throw new UnauthenticatedError();
    }
    throw new GraphQLRequestError(json.errors);
  }
  return json;
};

let browserEnvironment: Environment | undefined;

/** One environment per browser tab. The token goes only to our own origin, and only from the browser (ADR-0012, register item 26). */
export function getBrowserEnvironment(): Environment {
  if (typeof window === 'undefined') throw new Error('getBrowserEnvironment() called on the server');
  browserEnvironment ??= new Environment({
    network: Network.create(fetchGraphQL),
    store: new Store(new RecordSource()),
  });
  return browserEnvironment;
}
