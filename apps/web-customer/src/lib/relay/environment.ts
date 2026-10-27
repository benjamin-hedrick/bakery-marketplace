import { Environment, Network, RecordSource, Store } from 'relay-runtime';
import type { FetchFunction } from 'relay-runtime';

// Relay has no public name for its serialized record map, so derive it from the constructor.
export type RelayRecords = NonNullable<ConstructorParameters<typeof RecordSource>[0]>;

const SERVER_GRAPHQL_URL = process.env.GRAPHQL_URL ?? 'http://localhost:4000/graphql';
const BROWSER_GRAPHQL_URL = '/api/graphql';

function makeFetch(url: string, headers: Record<string, string> = {}): FetchFunction {
  return async (params, variables) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ query: params.text, variables }),
    });
    if (!res.ok) throw new Error(`GraphQL request failed: ${res.status}`);
    const json = await res.json();
    if (json.errors?.length) {
      throw new Error(`GraphQL errors: ${json.errors.map((e: { message: string }) => e.message).join('; ')}`);
    }
    return json;
  };
}

/**
 * New environment per call. Used by getServerSideProps, so every SSR request gets its own store
 * (ADR-0012/0014: no module-level request state on the server).
 */
export function createServerEnvironment(headers: Record<string, string> = {}): Environment {
  return new Environment({
    network: Network.create(makeFetch(SERVER_GRAPHQL_URL, headers)),
    store: new Store(new RecordSource()),
  });
}

/**
 * Environment used only to render React on the server from records already fetched in getServerSideProps.
 * It cannot reach the network, so a render can never fetch data (or fetch it with the wrong identity).
 */
export function createRenderEnvironment(records: RelayRecords = {}): Environment {
  return new Environment({
    network: Network.create(() => {
      throw new Error('Unexpected network request while rendering on the server');
    }),
    store: new Store(new RecordSource(records)),
  });
}

let browserEnvironment: Environment | undefined;

/** One environment per browser session (ADR-0014 layer 2). Never reachable from server code paths. */
export function getBrowserEnvironment(): Environment {
  if (typeof window === 'undefined') throw new Error('getBrowserEnvironment() called on the server');
  browserEnvironment ??= new Environment({
    network: Network.create(makeFetch(BROWSER_GRAPHQL_URL)),
    store: new Store(new RecordSource()),
  });
  return browserEnvironment;
}

/** Plain-JSON snapshot of a store, safe to return from getServerSideProps (Next escapes it for the HTML). */
export function snapshotRecords(environment: Environment): RelayRecords {
  return JSON.parse(JSON.stringify(environment.getStore().getSource().toJSON()));
}

/** Test-only hooks, off unless ENABLE_TEST_HOOKS=1: lets the harness pick fixture data per request. */
export function forwardTestHeaders(incoming: Record<string, string | string[] | undefined>): Record<string, string> {
  if (process.env.ENABLE_TEST_HOOKS !== '1') return {};
  const out: Record<string, string> = {};
  for (const name of ['x-fixture', 'x-delay-ms']) {
    const v = incoming[name];
    if (typeof v === 'string') out[name] = v;
  }
  return out;
}
