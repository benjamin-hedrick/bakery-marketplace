import { Environment, Network, RecordSource, Store } from 'relay-runtime';
import type { FetchFunction } from 'relay-runtime';
import { exportClientSpan } from './otlp';

// Relay has no public name for its serialized record map, so derive it from the constructor.
export type RelayRecords = NonNullable<ConstructorParameters<typeof RecordSource>[0]>;

const SERVER_GRAPHQL_URL = process.env.GRAPHQL_URL ?? 'http://localhost:4000/graphql';
const BROWSER_GRAPHQL_URL = '/api/graphql';

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Server only: one trace per environment (ADR-0016); every call gets its own span id, sent as the BFF's parent. */
interface Tracing {
  traceId: string;
  endpoint: string | undefined;
}

function makeFetch(url: string, headers: Record<string, string> = {}, tracing?: Tracing): FetchFunction {
  return async (params, variables) => {
    const startedAtMs = Date.now();
    const started = performance.now();
    const spanId = randomHex(8);
    const traceHeaders: Record<string, string> = tracing ? { traceparent: `00-${tracing.traceId}-${spanId}-01` } : {};
    const done = (statusCode: number | undefined, failed: boolean) => {
      if (!tracing) return;
      const durationMs = performance.now() - started;
      exportClientSpan(tracing.endpoint, {
        traceId: tracing.traceId,
        spanId,
        startedAtMs,
        durationMs,
        statusCode,
        failed,
      });
    };
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers, ...traceHeaders },
        body: JSON.stringify({ query: params.text, variables }),
      });
    } catch (e) {
      done(undefined, true);
      throw e;
    }
    if (!res.ok) {
      done(res.status, true);
      throw new Error(`GraphQL request failed: ${res.status}`);
    }
    const json = await res.json();
    done(res.status, !!json.errors?.length);
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
  // One trace per SSR request (ADR-0016): the BFF continues it and passes it on to the services. W3C `traceparent` only.
  const tracing = { traceId: randomHex(16), endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT };
  return new Environment({
    network: Network.create(makeFetch(SERVER_GRAPHQL_URL, headers, tracing)),
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
