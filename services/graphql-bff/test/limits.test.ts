import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { parse } from 'graphql';
import { loadConfig } from '../src/config.ts';
import { DEFAULT_LIMITS, limitsFromEnv, operationSizes, TOO_COMPLEX_MESSAGE } from '../src/limits.ts';
import { createServer, type Logger } from '../src/server.ts';

// WI-SEC-005 (register item 135): limits on the size of a GraphQL operation, checked by validation, so an operation over a limit is refused
// before anything is resolved or called.

describe('operationSizes', () => {
  test('counts depth, root fields and fields for a plain query', () => {
    const [size] = operationSizes(
      parse('{ listings(first: 2) { edges { node { id name } } } pickupWindows(vendorId: "v") { start } }'),
    );
    assert.deepEqual(size, { name: null, depth: 4, rootFields: 2, fields: 7 });
  });

  test('expands fragments each time they are used, and through inline fragments', () => {
    const [size] = operationSizes(
      parse(`query Q { a: listings { ...F ...F } b: listings { ... on ListingConnection { ...F } } }
        fragment F on ListingConnection { edges { node { id } } }`),
    );
    assert.equal(size!.rootFields, 2);
    assert.equal(size!.depth, 4);
    assert.equal(size!.fields, 2 + 3 + 3 + 3); // a, b; then edges+node+id three times
  });

  test('a fragment that spreads itself, or two that spread each other, is finite', () => {
    const sizes = operationSizes(
      parse(
        `{ listings { ...A } } fragment A on ListingConnection { edges { ...B } } fragment B on ListingEdge { cursor ...A }`,
      ),
    );
    assert.ok(Number.isFinite(sizes[0]!.fields));
  });

  test('an exponential chain of fragments is measured quickly and comes out over every limit', () => {
    let doc = '{ listings { ...F0 } }';
    for (let i = 0; i < 40; i++) doc += ` fragment F${i} on ListingConnection { ...F${i + 1} ...F${i + 1} }`;
    doc += ' fragment F40 on ListingConnection { edges { node { id } } }';
    const started = performance.now();
    const [size] = operationSizes(parse(doc));
    assert.ok(performance.now() - started < 200, 'measuring must not expand the fragments one by one');
    assert.ok(size!.fields > DEFAULT_LIMITS.maxFields);
  });

  test('names each operation and measures each', () => {
    const sizes = operationSizes(
      parse('query A { listings { edges { cursor } } } query B { pickupWindows(vendorId: "v") { start } }'),
    );
    assert.deepEqual(
      sizes.map((s) => s.name),
      ['A', 'B'],
    );
  });
});

describe('limitsFromEnv', () => {
  test('defaults, overrides, and a bad number is named and not echoed', () => {
    assert.deepEqual(limitsFromEnv({}), DEFAULT_LIMITS);
    assert.deepEqual(
      limitsFromEnv({
        BFF_MAX_QUERY_DEPTH: '4',
        BFF_MAX_ROOT_FIELDS: '2',
        BFF_MAX_FIELDS: '30',
        BFF_DISABLE_INTROSPECTION: '1',
      }),
      {
        maxDepth: 4,
        maxRootFields: 2,
        maxFields: 30,
        disableIntrospection: true,
      },
    );
    for (const [name, bad] of [
      ['BFF_MAX_QUERY_DEPTH', '0'],
      ['BFF_MAX_ROOT_FIELDS', '-3'],
      ['BFF_MAX_FIELDS', 'many-secret'],
      ['BFF_MAX_FIELDS', '100000'],
    ] as const) {
      assert.throws(
        () => loadConfig({ [name]: bad }),
        (e: Error) => e.message.includes(name) && (bad.length < 4 || !e.message.includes(bad)),
        `${name}=${bad}`,
      );
    }
  });
});

describe('the /graphql route with the limits', () => {
  const calls: string[] = [];
  const reply = (res: http.ServerResponse, code: number, body: unknown) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const catalog = http.createServer((req, res) => {
    calls.push(`catalog ${req.url}`);
    reply(res, 200, { items: [], nextCursor: null });
  });
  const ordering = http.createServer((req, res) => {
    calls.push(`ordering ${req.url}`);
    reply(res, 200, { windows: [] });
  });
  const logs: Record<string, unknown>[] = [];
  const log: Logger = { info: (e) => logs.push(e), error: (e) => logs.push(e) };
  const servers: http.Server[] = [];

  /** A BFF with the given limits, over the two stubs. */
  async function bff(limits: Partial<typeof DEFAULT_LIMITS> = {}): Promise<string> {
    const port = (s: http.Server) => (s.address() as AddressInfo).port;
    const server = createServer(
      {
        port: 0,
        catalogUrl: `http://127.0.0.1:${port(catalog)}`,
        orderingUrl: `http://127.0.0.1:${port(ordering)}`,
        timeoutMs: 500,
        checkoutTimeoutMs: 500,
        testHooks: false,
        rateLimitPerMinute: 100000,
        operationLimits: { ...DEFAULT_LIMITS, ...limits },
      },
      { log, exporter: () => {} },
    );
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    servers.push(server);
    return `http://127.0.0.1:${port(server)}`;
  }

  before(async () => {
    await new Promise<void>((r) => catalog.listen(0, '127.0.0.1', r));
    await new Promise<void>((r) => ordering.listen(0, '127.0.0.1', r));
  });
  after(() => {
    for (const s of servers) {
      s.closeAllConnections();
      s.close();
    }
    catalog.close();
    ordering.close();
  });

  const run = async (url: string, query: string) => {
    const res = await fetch(`${url}/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    return (await res.json()) as { data?: unknown; errors?: { message: string; extensions?: { code?: string } }[] };
  };

  test('an operation with far too many root fields is refused with fixed text and nothing is called', async () => {
    const url = await bff();
    calls.length = 0;
    const aliases = Array.from({ length: 1300 }, (_, i) => `a${i}: pickupWindows(vendorId: "v") { start }`).join(' ');
    const json = await run(url, `{ ${aliases} }`);

    assert.equal(json.data, undefined);
    assert.equal(json.errors!.length, 1);
    assert.equal(json.errors![0]!.message, TOO_COMPLEX_MESSAGE);
    assert.equal(json.errors![0]!.extensions?.code, 'OPERATION_TOO_COMPLEX');
    assert.deepEqual(calls, []);
  });

  test('the number of root fields is the limit: 8 are answered, 9 are refused', async () => {
    const url = await bff();
    const make = (n: number) =>
      `{ ${Array.from({ length: n }, (_, i) => `a${i}: pickupWindows(vendorId: "v") { start }`).join(' ')} }`;
    calls.length = 0;
    assert.equal((await run(url, make(8))).errors, undefined);
    assert.equal(calls.length, 8);
    assert.equal((await run(url, make(9))).errors?.[0]?.extensions?.code, 'OPERATION_TOO_COMPLEX');
    assert.equal(calls.length, 8, 'the refused one called nothing');
  });

  test('a very deeply nested operation (through introspection) is refused', async () => {
    const url = await bff();
    const deep = `{ __type(name: "Query") { fields { type ${'{ ofType '.repeat(20)}{ name }${' }'.repeat(20)} } } }`;
    const json = await run(url, deep);
    assert.equal(json.errors![0]!.extensions?.code, 'OPERATION_TOO_COMPLEX');
  });

  test('an operation with too many fields in all is refused, through fragments too', async () => {
    const url = await bff({ maxFields: 20 });
    const wide = `{ listings { edges { node { ${Array.from({ length: 25 }, () => 'id').join(' ')} } } } }`;
    assert.equal((await run(url, wide)).errors![0]!.extensions?.code, 'OPERATION_TOO_COMPLEX');
    const viaFragments = `{ listings { ...F ...F ...F ...F ...F ...F ...F } } fragment F on ListingConnection { edges { node { id name } } }`;
    assert.equal((await run(url, viaFragments)).errors![0]!.extensions?.code, 'OPERATION_TOO_COMPLEX');
  });

  test('an exponential fragment bomb is refused quickly', async () => {
    const url = await bff();
    let doc = '{ listings { ...F0 } }';
    for (let i = 0; i < 40; i++) doc += ` fragment F${i} on ListingConnection { ...F${i + 1} ...F${i + 1} }`;
    doc += ' fragment F40 on ListingConnection { edges { node { id } } }';
    const started = performance.now();
    const json = await run(url, doc);
    assert.ok(performance.now() - started < 1000);
    assert.equal(json.errors![0]!.extensions?.code, 'OPERATION_TOO_COMPLEX');
  });

  test('the operations the apps send are far inside the limits', async () => {
    const url = await bff();
    const queue = `query QueueBoardQuery { vendorOrders(status: ACTIVE, first: 50) { edges { node { id reference status sequence itemCount automatic placedAt updatedAt
      pickupWindow { start end } pickupInstructions lines { listingId listingName quantity modifiers { id name } } } } } }`;
    const place = `mutation($input: PlaceOrderInput!) { placeOrder(input: $input) { __typename ... on PlaceOrderSuccess { order { id status vendorId total { cents currency }
      pickupWindow { start end } createdAt lineItems { listingId modifierIds quantity price { cents } } } }
      ... on PlaceOrderRejected { code message fields { field message } shortfalls { listingId available } } } }`;
    for (const q of [queue, place]) {
      const sizes = operationSizes(parse(q));
      assert.ok(sizes[0]!.depth <= 8 && sizes[0]!.fields <= 60 && sizes[0]!.rootFields <= 2, JSON.stringify(sizes));
      const json = await run(url, q);
      assert.notEqual(json.errors?.[0]?.extensions?.code, 'OPERATION_TOO_COMPLEX');
    }
  });

  test('introspection works by default and is refused when the BFF is told to refuse it, with the rest unaffected', async () => {
    const open = await bff();
    assert.ok((await run(open, '{ __schema { queryType { name } } }')).data);
    const closed = await bff({ disableIntrospection: true });
    const refused = await run(closed, '{ __schema { queryType { name } } }');
    assert.equal(refused.data, undefined);
    assert.match(refused.errors![0]!.message, /introspection/i);
    assert.equal((await run(closed, '{ pickupWindows(vendorId: "v") { start } }')).errors, undefined);
  });

  test('a subscription over the limits is refused on the event-stream path too', async () => {
    const url = await bff({ maxRootFields: 1 });
    const res = await fetch(`${url}/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream', authorization: 'Bearer a.b.c' },
      body: JSON.stringify({ query: 'subscription { a: vendorOrderChanged { id } b: vendorOrderChanged { id } }' }),
    });
    const text = await res.text();
    assert.ok(
      res.status === 400 || /OPERATION_TOO_COMPLEX|too large/.test(text),
      `${res.status} ${text.slice(0, 200)}`,
    );
    assert.ok(!/event: next\ndata:.*"vendorOrderChanged"/.test(text));
  });
});
