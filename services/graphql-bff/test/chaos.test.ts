import { after, afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { ChaosRuntime, validate } from '@bakery/chaos';
import { BffChaos } from '../src/chaos.ts';
import { SAFE_INTERNAL_MESSAGE } from '../src/errors.ts';
import { toGlobalId } from '../src/global-id.ts';
import { createServer, type Logger } from '../src/server.ts';

// ADR-0024: the BFF's gate and client wrappers. Every test names its scenario and asserts the journal shows the fault before it asserts the effect.
// The equivalence tests compare what a caller sees when a service really fails (refused, 500, not JSON, silent) with what it sees when chaos injects
// the same class of failure: the outward result must be the same.

const silent: Logger = { info: () => undefined, error: () => undefined };
const LISTING = {
  id: 'listing-1',
  vendorId: 'vendor-1',
  name: 'Loaf',
  description: null,
  category: 'bread',
  priceCents: 800,
  currency: 'USD',
  modifiers: [],
  allergenFlags: [],
  sponsored: false,
  status: 'Published',
  createdAt: '2026-01-01T00:00:00+00:00',
  updatedAt: '2026-01-01T00:00:00+00:00',
};

let catalogMode: 'ok' | 'error' | 'badjson' | 'hang' = 'ok';
let catalogCalls = 0;
const catalog = http.createServer((req, res) => {
  catalogCalls++;
  if (catalogMode === 'hang') return; // never answers
  if (catalogMode === 'error') {
    res.writeHead(500, { 'content-type': 'application/json' });
    return res.end('{"code":"boom"}');
  }
  if (catalogMode === 'badjson') {
    res.writeHead(200);
    return res.end('<html>nope');
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ items: [LISTING], nextCursor: null }));
});
await new Promise<void>((r) => catalog.listen(0, '127.0.0.1', r));
const catalogUrl = `http://127.0.0.1:${(catalog.address() as AddressInfo).port}`;

after(() => {
  catalog.closeAllConnections();
  catalog.close();
});

interface Started {
  url: string;
  runtime: ChaosRuntime | undefined;
  stop: () => void;
}
const running: Started[] = [];
afterEach(() => {
  for (const s of running.splice(0)) s.stop();
  catalogMode = 'ok';
  catalogCalls = 0;
});

async function start(
  layers: Record<string, Record<string, number>> | undefined,
  options: { seed?: bigint; orderingUrl?: string } = {},
): Promise<Started> {
  const runtime = layers ? new ChaosRuntime(validate('bff-test', options.seed ?? 1n, layers)) : undefined;
  const server = createServer(
    {
      port: 0,
      catalogUrl,
      orderingUrl: options.orderingUrl ?? 'http://127.0.0.1:1',
      timeoutMs: 300,
      checkoutTimeoutMs: 300,
    },
    { log: silent, exporter: () => undefined, ...(runtime ? { chaos: new BffChaos(runtime) } : {}) },
  );
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const started = {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    runtime,
    stop: () => {
      server.closeAllConnections();
      server.close();
    },
  };
  running.push(started);
  return started;
}

const LISTINGS = 'query { listings(first: 5) { edges { node { id name } } } }';
const WINDOWS = `query { pickupWindows(vendorId: "${toGlobalId('Vendor', 'vendor-1')}") { start end } }`;

async function gql(base: string, query: string, headers: Record<string, string> = {}, timeoutMs = 3000) {
  const res = await fetch(`${base}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return res;
}

/** What a caller can see of a failed operation, without the trace reference (which is different on every request). */
async function outcomeOf(base: string, query: string) {
  const res = await gql(base, query);
  const body = (await res.json()) as { data?: unknown; errors?: { message: string; extensions?: { code?: string } }[] };
  return {
    status: res.status,
    errors: body.errors?.map((e) => ({ message: e.message, code: e.extensions?.code })),
    data: body.data,
  };
}

describe('the gate at the door (layer bff)', () => {
  test('a rejected request is answered with the chosen status and never reaches a service', async () => {
    const s = await start({ bff: { rejectRate: 1, rejectStatus: 503 } });

    const res = await gql(s.url, LISTINGS);
    const body = (await res.json()) as {
      errors: { extensions: { code: string } }[];
      extensions: { chaos: { scenario: string; injected: string[] } };
    };

    assert.equal(s.runtime!.journal.count('bff', 'reject'), 1); // the fault happened
    assert.equal(res.status, 503);
    assert.equal(body.errors[0]!.extensions.code, 'UNAVAILABLE');
    assert.equal(res.headers.get('x-chaos-scenario'), 'bff-test');
    assert.equal(res.headers.get('x-chaos-injected'), 'bff:reject');
    assert.deepEqual(body.extensions.chaos, { scenario: 'bff-test', injected: ['bff:reject'] });
    assert.equal(catalogCalls, 0);
  });

  test('a 429 carries retry-after and the RATE_LIMITED code the apps already handle', async () => {
    const s = await start({ bff: { rejectRate: 1, rejectStatus: 429 } });

    const res = await gql(s.url, LISTINGS);

    assert.equal(s.runtime!.journal.count('bff', 'reject'), 1);
    assert.equal(res.status, 429);
    assert.equal(res.headers.get('retry-after'), '1');
    assert.equal(
      ((await res.json()) as { errors: { extensions: { code: string } }[] }).errors[0]!.extensions.code,
      'RATE_LIMITED',
    );
  });

  test('a malformed reply is a 200 whose body is not JSON', async () => {
    const s = await start({ bff: { malformedRate: 1 } });

    const res = await gql(s.url, LISTINGS);
    const text = await res.text();

    assert.equal(s.runtime!.journal.count('bff', 'malformed'), 1);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/html');
    assert.throws(() => JSON.parse(text));
    assert.equal(catalogCalls, 0);
  });

  test('a reset closes the connection without an answer', async () => {
    const s = await start({ bff: { resetRate: 1 } });

    await assert.rejects(() => gql(s.url, LISTINGS));

    assert.equal(s.runtime!.journal.count('bff', 'reset'), 1);
    assert.equal(catalogCalls, 0);
  });

  test('a hang never answers; the caller gives up and the server frees the request', async () => {
    const s = await start({ bff: { hangRate: 1 } });

    await assert.rejects(
      () => gql(s.url, LISTINGS, {}, 300),
      (e: unknown) => e instanceof Error && e.name === 'TimeoutError',
    );

    assert.equal(s.runtime!.journal.count('bff', 'hang'), 1);
    assert.equal(catalogCalls, 0);
  });

  test('latency delays the answer and an outage window rejects, then recovers', async () => {
    const slow = await start({ bff: { latencyMs: 200 } });
    const started = Date.now();
    const ok = await gql(slow.url, LISTINGS);
    assert.equal(slow.runtime!.journal.count('bff', 'latency'), 1);
    assert.ok(Date.now() - started >= 180);
    assert.equal(ok.status, 200);

    const outage = await start({ bff: { outageWindowSeconds: 0.4 } });
    assert.equal((await gql(outage.url, LISTINGS)).status, 503);
    assert.equal(outage.runtime!.journal.count('bff', 'outage'), 1);
    await new Promise((r) => setTimeout(r, 500));
    assert.equal((await gql(outage.url, LISTINGS)).status, 200); // recovered
  });

  test('/healthz is never disturbed', async () => {
    const s = await start({ bff: { rejectRate: 1 } });

    const res = await fetch(`${s.url}/healthz`);

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal(s.runtime!.journal.entries.length, 0);
  });

  test('a request that chooses its trace id chooses which requests are hit; the same scenario hits the same ones on every run', async () => {
    const traceIds = Array.from({ length: 24 }, (_, i) => i.toString(16).padStart(32, 'a'));
    const run = async (seed: bigint) => {
      const s = await start({ bff: { rejectRate: 0.5 } }, { seed });
      let outcome = '';
      for (const id of traceIds) {
        const res = await gql(s.url, LISTINGS, { traceparent: `00-${id}-00f067aa0ba902b7-01` });
        outcome += res.status === 503 ? 'x' : 'o';
      }
      return outcome;
    };
    const first = await run(42n);
    assert.equal(first, await run(42n));
    assert.notEqual(first, await run(43n));
    assert.ok(first.includes('o') && first.includes('x'));
  });

  test('the indicator is response-only: with chaos off no header appears, and a request header cannot switch anything on', async () => {
    const off = await start(undefined);

    const res = await gql(off.url, LISTINGS, {
      'x-chaos-scenario': 'bff-test',
      'x-chaos': 'on',
      'x-chaos-injected': 'bff:reject',
    });

    assert.equal(res.headers.get('x-chaos-scenario'), null);
    assert.equal(res.headers.get('x-chaos-injected'), null);
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { extensions?: unknown }).extensions, undefined);
  });

  test('with chaos on but no fault applied, the answer says which scenario is on and nothing else', async () => {
    const s = await start({ bff: { rejectRate: 0 } });

    const res = await gql(s.url, LISTINGS);

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-chaos-scenario'), 'bff-test');
    assert.equal(res.headers.get('x-chaos-injected'), null);
    assert.deepEqual(((await res.json()) as { extensions: { chaos: unknown } }).extensions.chaos, {
      scenario: 'bff-test',
      injected: [],
    });
  });
});

describe('the wrappers on the service clients (layers bffCatalog and bffOrdering)', () => {
  test('a call can fail as an unreachable service does, answer a 5xx, answer a non-JSON body, or lose its answer; the caller sees the same safe error every time', async () => {
    const seen: { setting: string; outcome: Awaited<ReturnType<typeof outcomeOf>>; calls: number; faults: string }[] =
      [];
    for (const setting of ['unavailableRate', 'serverErrorRate', 'malformedRate', 'lostResponseRate']) {
      const s = await start({ bffCatalog: { [setting]: 1 } });
      catalogCalls = 0;

      const outcome = await outcomeOf(s.url, LISTINGS);

      assert.ok(s.runtime!.journal.entries.length >= 1, `${setting}: chaos must have injected the fault`);
      seen.push({ setting, outcome, calls: catalogCalls, faults: Object.keys(s.runtime!.journal.summary()).join(',') });
    }

    for (const { setting, outcome } of seen) {
      assert.deepEqual(outcome.errors, [{ message: SAFE_INTERNAL_MESSAGE, code: 'INTERNAL' }], setting);
      assert.equal(outcome.status, 200, setting); // GraphQL: the failure is in the body
    }
    // The first three never reach the service; a lost response reached it, did the work, and lost the answer.
    assert.deepEqual(
      seen.map((s) => s.calls),
      [0, 0, 0, 1],
    );
    assert.deepEqual(
      seen.map((s) => s.faults),
      ['bffCatalog:unavailable', 'bffCatalog:serverError', 'bffCatalog:malformed', 'bffCatalog:lostResponse'],
    );
  });

  test('EQUIVALENCE: an injected failure is indistinguishable from the real one to the caller (catalog)', async () => {
    const real = await start(undefined);

    catalogMode = 'error';
    const realFiveHundred = await outcomeOf(real.url, LISTINGS);
    catalogMode = 'badjson';
    const realNotJson = await outcomeOf(real.url, LISTINGS);
    catalogMode = 'hang';
    const realSilent = await outcomeOf(real.url, LISTINGS); // the BFF's own downstream timeout (300 ms here)
    catalogMode = 'ok';

    const injectedFiveHundred = await outcomeOf((await start({ bffCatalog: { serverErrorRate: 1 } })).url, LISTINGS);
    const injectedNotJson = await outcomeOf((await start({ bffCatalog: { malformedRate: 1 } })).url, LISTINGS);
    const injectedUnreachable = await outcomeOf((await start({ bffCatalog: { unavailableRate: 1 } })).url, LISTINGS);

    assert.deepEqual(injectedFiveHundred, realFiveHundred);
    assert.deepEqual(injectedNotJson, realNotJson);
    assert.deepEqual(injectedUnreachable, realSilent); // an unreachable service and a silent one end the same way
    assert.deepEqual(realFiveHundred.errors, [{ message: SAFE_INTERNAL_MESSAGE, code: 'INTERNAL' }]);
  });

  test('EQUIVALENCE: a refused connection to ordering and an injected "unreachable" look the same (ordering)', async () => {
    const refused = await start(undefined, { orderingUrl: 'http://127.0.0.1:1' }); // nothing listens: connection refused
    const injected = await start({ bffOrdering: { unavailableRate: 1 } }, { orderingUrl: 'http://127.0.0.1:1' });

    const real = await outcomeOf(refused.url, WINDOWS);
    const chaos = await outcomeOf(injected.url, WINDOWS);

    assert.equal(injected.runtime!.journal.count('bffOrdering', 'unavailable'), 1);
    assert.deepEqual(chaos, real);
    assert.deepEqual(real.errors, [{ message: SAFE_INTERNAL_MESSAGE, code: 'INTERNAL' }]);
  });

  test('the same scenario fails the same operations on every run, and a retry is judged afresh', async () => {
    const run = async (seed: bigint) => {
      const s = await start({ bffCatalog: { unavailableRate: 0.5 } }, { seed });
      let outcome = '';
      for (let i = 0; i < 20; i++) outcome += (await outcomeOf(s.url, LISTINGS)).errors ? 'x' : 'o';
      return outcome;
    };

    const first = await run(7n);

    assert.equal(first, await run(7n));
    assert.notEqual(first, await run(8n));
    assert.ok(first.includes('o') && first.includes('x'));
  });

  test('a layer the scenario does not have leaves the client untouched', async () => {
    const s = await start({ bff: { rejectRate: 0 } }); // no bffCatalog layer

    const outcome = await outcomeOf(s.url, LISTINGS);

    assert.equal(outcome.errors, undefined);
    assert.equal(catalogCalls, 1);
  });
});
