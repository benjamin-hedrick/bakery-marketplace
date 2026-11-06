import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { DownstreamError } from '../src/errors.ts';
import { fromGlobalId, serviceIdFor, toGlobalId } from '../src/global-id.ts';
import { createOrderingClient } from '../src/ordering-client.ts';
import { createServer, type Logger } from '../src/server.ts';
import { startTrace } from '../src/trace.ts';

// WI-SEC-005 step 2: generated inputs for the BFF's parsers and routes. A fixed seed and a fixed number of cases, so a failure can be repeated
// (the failing case is printed with its seed and index). Not coverage-guided fuzzing: a bounded random search for crashes, hangs, and answers
// that break the contract (a 5xx for a bad input, a non-JSON body, a downstream call that should not have been made).

const SEED = 20261102;
const CASES_ROUTE = Number(process.env.FUZZ_ROUTE_CASES ?? 1200);

function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n: number) => Math.floor(next() * n),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
  };
}
type Rng = ReturnType<typeof rng>;

const NASTY = [
  '',
  ' ',
  '\n',
  '\r\n',
  '\u0000',
  '‮',
  '😀',
  'é',
  '../',
  '%00',
  '"',
  '\\',
  '{',
  '}',
  '[',
  ']',
  '$',
  '__proto__',
  'constructor',
  '<script>',
  "' OR 1=1 --",
  'a'.repeat(5000),
  '9'.repeat(400),
  '-1',
  '0',
  '1e999',
  'NaN',
  'null',
  'undefined',
  'true',
];
const junk = (r: Rng) => (r.next() < 0.7 ? r.pick(NASTY) : String.fromCharCode(r.int(0x3000)));
const word = (r: Rng) => Array.from({ length: r.int(4) + 1 }, () => junk(r)).join('');

const ORDER = {
  id: 'order-1',
  reference: 'ABC123',
  status: 'Placed',
  totalCents: 100,
  currency: 'USD',
  lineCount: 1,
  itemCount: 1,
  fulfillmentType: 'Pickup',
  pickupWindow: null,
  automatic: false,
  cancelledBy: null,
  cancelReason: null,
  placedAt: '2026-11-02T13:00:00+00:00',
  updatedAt: '2026-11-02T13:00:00+00:00',
  lines: [{ listingId: 'listing-1', listingName: 'Loaf', modifiers: [], quantity: 1 }],
  pickupInstructions: null,
  lastSequence: 1,
};

describe('the reader of ordering’s event stream', () => {
  const trace = startTrace(undefined);

  /** A response whose body is the given chunks, then the end. */
  const streamOf = (chunks: Uint8Array[]) =>
    (async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            for (const chunk of chunks) c.enqueue(chunk);
            c.close();
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      )) as unknown as typeof fetch;

  const frame = (r: Rng): string => {
    switch (r.int(8)) {
      case 0:
        return `event: order\ndata: ${JSON.stringify({ ...ORDER, lastSequence: r.int(50), status: r.pick(['Placed', 'Confirmed', 'Mystery', 5]) })}\n\n`;
      case 1:
        return `event: order\ndata: ${word(r)}\n\n`;
      case 2:
        return `: heartbeat ${word(r)}\n\n`;
      case 3:
        return `event: ${r.pick(['expired', 'closed', 'other', word(r)])}\ndata: ${word(r)}\n\n`;
      case 4:
        return `data: ${word(r)}\n\n`;
      case 5:
        return `event: order\r\ndata: ${JSON.stringify(ORDER)}\r\n\r\n`;
      case 6:
        return word(r) + '\n';
      default:
        return `event: order\ndata: ${JSON.stringify(r.pick([null, [], 7, 'x', {}, { id: 1 }, { id: 'a', status: 'Placed' }, { id: 'a', status: 'Placed', lastSequence: 'x' }]))}\n\n`;
    }
  };

  test('for generated streams it ends, and yields orders with an id, a status and a sequence, or fails only with a DownstreamError', async () => {
    const r = rng(SEED);
    let yielded = 0;
    let failed = 0;
    for (let i = 0; i < 1500; i++) {
      const bytes = Buffer.from(Array.from({ length: r.int(10) + 1 }, () => frame(r)).join(''), 'utf8');
      const chunks: Uint8Array[] = [];
      for (let at = 0; at < bytes.length;) {
        const n = r.int(80) + 1; // cut anywhere, including inside a multi-byte character
        chunks.push(bytes.subarray(at, at + n));
        at += n;
      }
      const client = createOrderingClient('http://ordering.invalid', 1000, streamOf(chunks), 1000, 1000);
      try {
        const orders = await client.openVendorOrderStream('Bearer t', trace);
        for await (const order of orders) {
          assert.equal(typeof order.id, 'string', `seed ${SEED}, case ${i}`);
          assert.equal(typeof order.status, 'string', `seed ${SEED}, case ${i}`);
          assert.equal(typeof order.lastSequence, 'number', `seed ${SEED}, case ${i}`);
          yielded++;
        }
      } catch (e) {
        assert.ok(e instanceof DownstreamError, `seed ${SEED}, case ${i}: ${String(e)}`);
        assert.ok(
          !/ordering\.invalid|Bearer/.test((e as Error).message),
          `seed ${SEED}, case ${i}: leaked ${(e as Error).message}`,
        );
        failed++;
      }
    }
    assert.ok(
      yielded > 100 && failed > 100,
      `the generator should reach both outcomes (yielded ${yielded}, failed ${failed})`,
    );
  });

  test('random bytes, a frame without an end, and a frame over the size limit never hang or throw anything but a DownstreamError', async () => {
    const r = rng(SEED + 1);
    const cases: Uint8Array[][] = [];
    for (let i = 0; i < 300; i++) cases.push([Buffer.from(Array.from({ length: r.int(2000) }, () => r.int(256)))]);
    cases.push([Buffer.from('event: order\ndata: ' + 'x'.repeat(3 * 1024 * 1024))]); // never ends a frame
    cases.push([Buffer.from('event: order\ndata: {"id":"a"'), Buffer.from('}')]); // ends mid-frame
    for (const [i, chunks] of cases.entries()) {
      const client = createOrderingClient('http://ordering.invalid', 1000, streamOf(chunks), 1000, 1000);
      try {
        for await (const _ of await client.openVendorOrderStream('Bearer t', trace)) void _;
      } catch (e) {
        assert.ok(e instanceof DownstreamError, `case ${i}: ${String(e)}`);
      }
    }
  });
});

describe('global ids', () => {
  test('decoding never throws, accepts only canonical base64 of Type:id, and a made id round-trips', () => {
    const r = rng(SEED + 2);
    for (let i = 0; i < 20000; i++) {
      const input = r.next() < 0.5 ? word(r) : Buffer.from(word(r)).toString('base64');
      const decoded = fromGlobalId(input);
      if (decoded) {
        assert.equal(
          Buffer.from(input, 'base64').toString('base64'),
          input,
          `seed ${SEED + 2}, case ${i}: not canonical`,
        );
        assert.ok(decoded.type.length > 0 && decoded.serviceId.length > 0);
      }
      const id = word(r) || 'x';
      assert.equal(serviceIdFor('Order', toGlobalId('Order', id)), id);
      assert.equal(serviceIdFor('Order', toGlobalId('Listing', id)), null);
    }
  });
});

describe('the /graphql route with generated requests', () => {
  const downstream: string[] = [];
  let inflight = 0;
  let peak = 0;
  const reply = (res: http.ServerResponse, code: number, body: unknown) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const catalog = http.createServer((req, res) => {
    downstream.push(`catalog ${req.method} ${req.url}`);
    if (new URL(req.url ?? '/', 'http://x').pathname === '/catalog/listings')
      return reply(res, 200, { items: [], nextCursor: null });
    reply(res, 404, { code: 'not_found' });
  });
  const ordering = http.createServer((req, res) => {
    downstream.push(`ordering ${req.method} ${req.url}`);
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    if (path === '/ordering/vendor/orders') return reply(res, 200, { items: [ORDER], nextCursor: null });
    if (path.startsWith('/ordering/vendor/orders/')) return reply(res, 200, ORDER);
    if (path === '/ordering/pickup-windows') {
      inflight++;
      peak = Math.max(peak, inflight);
      return void setTimeout(() => {
        inflight--;
        reply(res, 200, { windows: [] });
      }, 20);
    }
    reply(res, 404, { code: 'not_found' });
  });
  const logs: Record<string, unknown>[] = [];
  const log: Logger = { info: (e) => logs.push(e), error: (e) => logs.push(e) };
  let bff: http.Server;
  let url: string;

  before(async () => {
    await new Promise<void>((r) => catalog.listen(0, '127.0.0.1', r));
    await new Promise<void>((r) => ordering.listen(0, '127.0.0.1', r));
    const port = (s: http.Server) => (s.address() as AddressInfo).port;
    bff = createServer(
      {
        port: 0,
        catalogUrl: `http://127.0.0.1:${port(catalog)}`,
        orderingUrl: `http://127.0.0.1:${port(ordering)}`,
        timeoutMs: 500,
        checkoutTimeoutMs: 500,
        rateLimitPerMinute: 100000,
      },
      { log, exporter: () => {} },
    );
    await new Promise<void>((r) => bff.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${port(bff)}`;
  });
  after(() => {
    bff.closeAllConnections();
    bff.close();
    catalog.close();
    ordering.close();
  });

  const OPERATIONS = [
    'query($id: ID!) { listing(id: $id) { id name } }',
    'query($id: ID!) { order(id: $id) { id status } }',
    'query($id: ID!) { vendorOrder(id: $id) { id status } }',
    'query($f: VendorOrderFilter, $n: Int, $a: String) { vendorOrders(status: $f, first: $n, after: $a) { edges { cursor node { id status } } } }',
    'query($n: Int, $a: String) { listings(first: $n, after: $a) { edges { cursor node { id } } } }',
    'query($v: ID!) { pickupWindows(vendorId: $v) { start end } }',
    'query($id: ID!) { node(id: $id) { id } }',
    'mutation($input: VendorOrderActionInput!) { vendorOrderAction(input: $input) { __typename } }',
    'mutation($input: PlaceOrderInput!) { placeOrder(input: $input) { __typename } }',
  ];

  const value = (r: Rng, depth = 0): unknown => {
    const kind = r.int(depth > 2 ? 6 : 9);
    switch (kind) {
      case 0:
        return word(r);
      case 1:
        return r.pick([0, -1, 1, 50, 51, 2 ** 31, 2 ** 53, -(2 ** 31), 1.5, 1e308]);
      case 2:
        return r.pick([true, false, null]);
      case 3:
        return toGlobalId(r.pick(['Order', 'VendorOrder', 'Listing', word(r)]), word(r));
      case 4:
        return r.pick(['ACTIVE', 'PLACED', 'CONFIRM', 'DECLINE', 'COMPLETE', 'MYSTERY', 'active']);
      case 5:
        return Buffer.from(word(r)).toString('base64');
      case 6:
        return Array.from({ length: r.int(4) }, () => value(r, depth + 1));
      case 7:
        return Object.fromEntries(
          Array.from({ length: r.int(4) }, () => [
            r.pick([
              'orderId',
              'action',
              'idempotencyKey',
              'paymentMethodId',
              'vendorId',
              'lineItems',
              'pickupWindow',
              '__proto__',
              word(r),
            ]),
            value(r, depth + 1),
          ]),
        );
      default:
        return { orderId: value(r, depth + 1), action: value(r, depth + 1) };
    }
  };

  const request = async (r: Rng) => {
    const shape = r.int(6);
    let body: string;
    let contentType = 'application/json';
    if (shape === 0) body = Buffer.from(Array.from({ length: r.int(300) }, () => r.int(256))).toString('latin1');
    else if (shape === 1) body = word(r);
    else if (shape === 2) body = JSON.stringify(value(r));
    else if (shape === 3) {
      body = JSON.stringify({ query: word(r) + r.pick(OPERATIONS), variables: value(r) });
    } else {
      const query = r.pick(OPERATIONS);
      body = JSON.stringify({
        query,
        variables: { id: value(r), v: value(r), f: value(r), n: value(r), a: value(r), input: value(r) },
        operationName: r.next() < 0.2 ? word(r) : undefined,
      });
    }
    if (r.next() < 0.1)
      contentType = r.pick([
        'text/plain',
        'application/x-www-form-urlencoded',
        '',
        word(r).replace(/[^\x20-\x7e]/g, 'x'),
      ]);
    const headers: Record<string, string> = { 'content-type': contentType || 'application/json' };
    if (r.next() < 0.5)
      headers.authorization = 'Bearer ' + (r.next() < 0.5 ? 'a.b.c' : word(r).replace(/[^\x20-\x7e]/g, 'x'));
    if (r.next() < 0.2) headers.traceparent = word(r).replace(/[^\x20-\x7e]/g, 'x');
    let res: Response;
    let text: string;
    try {
      res = await fetch(`${url}/graphql`, { method: 'POST', headers, body, signal: AbortSignal.timeout(5000) });
      text = await res.text();
    } catch (e) {
      assert.fail(
        `no answer within 5 s (${String(e)}): headers ${JSON.stringify(headers)}, body ${JSON.stringify(body.slice(0, 400))}`,
      );
    }
    return { res, text, body };
  };

  test('every generated request gets a 4xx or a 200 with a JSON body, and the BFF is still serving afterwards', async () => {
    const r = rng(SEED + 3);
    const statuses = new Map<number, number>();
    const codes = new Map<string, number>();
    const slow: string[] = [];
    const internalSamples: string[] = [];
    const opCounts = new Map<string, number>();
    for (let i = 0; i < CASES_ROUTE; i++) {
      const started = Date.now();
      const { res, text, body } = await request(r);
      if (Date.now() - started > 300) slow.push(`case ${i} ${Date.now() - started} ms: ${body.slice(0, 120)}`);
      statuses.set(res.status, (statuses.get(res.status) ?? 0) + 1);
      const where = `seed ${SEED + 3}, case ${i}, body ${JSON.stringify(body.slice(0, 200))}`;
      assert.ok(res.status < 500, `${where}: status ${res.status}`);
      let json: { data?: unknown; errors?: { message: string; extensions?: { code?: string } }[] };
      try {
        json = JSON.parse(text);
      } catch {
        assert.fail(`${where}: the answer is not JSON: ${text.slice(0, 100)}`);
      }
      assert.ok(json.data !== undefined || json.errors !== undefined, `${where}: neither data nor errors`);
      for (const e of json.errors ?? []) {
        const code = e.extensions?.code ?? 'none';
        codes.set(code, (codes.get(code) ?? 0) + 1);
        if (code === 'INTERNAL') {
          try {
            const q = (JSON.parse(body) as { query?: string }).query ?? '';
            const k = (q.match(/\{\s*(\w+)/)?.[1] ?? '?') + ' ' + JSON.stringify(e.message);
            opCounts.set(k, (opCounts.get(k) ?? 0) + 1);
          } catch {
            opCounts.set('unparsed', 1);
          }
          if (internalSamples.length < 3) internalSamples.push(body.slice(0, 300));
        }
        assert.ok(
          !/ordering|catalog|127\.0\.0\.1|Bearer|stack|at .*\.ts/i.test(JSON.stringify(e)) ||
            /Cannot query field|Unknown|Variable|Expected|Syntax/.test(e.message),
          `${where}: error text may leak: ${JSON.stringify(e).slice(0, 200)}`,
        );
      }
    }
    console.log(`fuzz /graphql: ${slow.length} slow of ${CASES_ROUTE}; first: ${JSON.stringify(slow.slice(0, 5))}`);
    assert.equal((await fetch(`${url}/healthz`)).status, 200);
    // INTERNAL is the BFF's answer to something it did not expect. Report how often it happened so the record shows it.
    console.log(`fuzz /graphql: statuses ${JSON.stringify([...statuses])}, error codes ${JSON.stringify([...codes])}`);
    const failures = new Map<string, number>();
    for (const l of logs)
      if (l.msg === 'resolver failed')
        failures.set(JSON.stringify(l.error), (failures.get(JSON.stringify(l.error)) ?? 0) + 1);
    console.log(`fuzz /graphql: INTERNAL by operation ${JSON.stringify([...opCounts])}`);
    console.log(`fuzz /graphql: resolver failures ${JSON.stringify([...failures])}`);
    if (internalSamples.length) console.log(`fuzz /graphql: INTERNAL samples ${JSON.stringify(internalSamples)}`);
    assert.equal(codes.get('INTERNAL') ?? 0, 0, `INTERNAL errors for generated inputs: ${codes.get('INTERNAL')}`);
  });

  test('generated requests to the event-stream path never end the process or hang, and never answer 5xx', async () => {
    const r = rng(SEED + 4);
    for (let i = 0; i < 300; i++) {
      const bodyText =
        r.next() < 0.3
          ? word(r)
          : JSON.stringify({
              query: r.pick([
                'subscription { vendorOrderChanged { id } }',
                'subscription { nope }',
                word(r),
                r.pick(OPERATIONS),
              ]),
              variables: r.next() < 0.5 ? value(r) : undefined,
              operationName: r.next() < 0.3 ? value(r) : undefined,
              extensions: r.next() < 0.3 ? value(r) : undefined,
            });
      const headers: Record<string, string> = {
        'content-type': r.pick(['application/json', 'text/plain', 'application/json; charset=utf-8']),
        accept: 'text/event-stream',
      };
      if (r.next() < 0.7) headers.authorization = 'Bearer a.b.c';
      let res: Response;
      try {
        res = await fetch(`${url}/graphql`, {
          method: 'POST',
          headers,
          body: bodyText,
          signal: AbortSignal.timeout(3000),
        });
      } catch (e) {
        assert.fail(
          `seed ${SEED + 4}, case ${i}: no response headers within 3 s (${String(e)}): ${JSON.stringify(bodyText.slice(0, 300))}`,
        );
      }
      assert.ok(
        res.status < 500,
        `seed ${SEED + 4}, case ${i}: status ${res.status}: ${JSON.stringify(bodyText.slice(0, 300))}`,
      );
      await res.body?.cancel().catch(() => undefined);
    }
    assert.equal((await fetch(`${url}/healthz`)).status, 200);
  });

  test('an operation with as many aliases as fit in the body limit is answered, and what it costs downstream is recorded (register item 135)', async () => {
    const alias = (i: number) => `a${i}: pickupWindows(vendorId: "v") { start }`;
    const parts: string[] = [];
    let size = 4;
    for (let i = 0; size + alias(i).length + 1 < 60_000; i++) {
      parts.push(alias(i));
      size += alias(i).length + 1;
    }
    const before = downstream.filter((d) => d.includes('pickup-windows')).length;
    peak = 0;
    const body = JSON.stringify({ query: `{ ${parts.join(' ')} }` });
    assert.ok(body.length < 64 * 1024, 'the request must fit the body limit to be a fair test');
    const res = await fetch(`${url}/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    const json = (await res.json()) as {
      data?: Record<string, unknown>;
      errors?: { message: string; extensions?: { code?: string } }[];
    };
    console.log(`alias request: status ${res.status}, ${json.errors?.length ?? 0} errors`);
    const calls = downstream.filter((d) => d.includes('pickup-windows')).length - before;
    // Before register item 135 was fixed this request made 57 downstream calls, 56 of them at once, and then failed. It is now refused by validation.
    console.log(
      `fuzz /graphql: one ${body.length}-byte request with ${parts.length} aliases made ${calls} calls to ordering and was answered ${JSON.stringify(json.errors?.[0]?.extensions)}`,
    );
    assert.equal(calls, 0);
    assert.equal(json.errors?.[0]?.extensions?.code, 'OPERATION_TOO_COMPLEX');
    assert.ok(res.status < 500);
  });
});
