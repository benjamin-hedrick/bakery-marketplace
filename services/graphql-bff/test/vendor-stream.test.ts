import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createClient } from 'graphql-sse';
import { toGlobalId } from '../src/global-id.ts';
import { createServer, type Logger } from '../src/server.ts';

// WI-QUE-003 step 4 (ADR-0021): the vendorOrderChanged subscription. The BFF opens ordering's event stream with the caller's token, shapes each
// order like the vendor queries, and serves it over the graphql-sse protocol (one POST per subscription). It decides nothing.

const TOKEN = 'header.payload.signature';
const auth = { authorization: `Bearer ${TOKEN}` };
const SUBSCRIBE = `subscription { vendorOrderChanged { id reference status sequence total { cents currency } updatedAt
  lines { listingId listingName quantity modifiers { id name } } } }`;

const order = (n: number, status = 'Placed', sequence = n) => ({
  id: `order-${n}`,
  reference: `REF${n}`,
  status,
  totalCents: 2400,
  currency: 'USD',
  lineCount: 1,
  itemCount: 2,
  fulfillmentType: 'Pickup',
  pickupWindow: null,
  automatic: false,
  cancelledBy: null,
  cancelReason: null,
  placedAt: '2026-11-02T13:00:00+00:00',
  updatedAt: '2026-11-02T13:00:00+00:00',
  lines: [{ listingId: 'listing-sourdough-001', listingName: 'Country Sourdough', modifiers: [], quantity: 2 }],
  pickupInstructions: null,
  lastSequence: sequence,
});

/** A stand-in for ordering's stream endpoint that the test drives. */
const fake = {
  mode: 'ok' as 'ok' | 'unauthorized' | 'forbidden' | 'unavailable',
  requests: [] as {
    url: string;
    authorization: string | undefined;
    accept: string | undefined;
    traceparent: string | undefined;
  }[],
  open: new Set<http.ServerResponse>(),
  closedByPeer: 0,
};
const ordering = http.createServer((req, res) => {
  if (req.url !== '/ordering/vendor/orders/stream') {
    res.writeHead(404).end();
    return;
  }
  fake.requests.push({
    url: req.url,
    authorization: req.headers.authorization,
    accept: req.headers.accept,
    traceparent: req.headers.traceparent as string | undefined,
  });
  if (fake.mode === 'unauthorized') return void res.writeHead(401).end();
  if (fake.mode === 'forbidden') return void res.writeHead(403).end();
  if (fake.mode === 'unavailable') {
    res
      .writeHead(503, { 'content-type': 'application/json' })
      .end('{"code":"stream_unavailable","message":"secret detail at http://redis.internal"}');
    return;
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.write('retry: 3000\n: connected\n\n');
  fake.open.add(res);
  res.once('close', () => {
    fake.open.delete(res);
    fake.closedByPeer++;
  });
});
const push = (o: object) =>
  [...fake.open].forEach((r) => r.write(`event: order\nid: x\ndata: ${JSON.stringify(o)}\n\n`));
const heartbeat = () => [...fake.open].forEach((r) => r.write(': heartbeat\n\n'));
const finish = (event: 'expired' | 'closed', reason = 'token') =>
  [...fake.open].forEach((r) => r.end(`event: ${event}\ndata: {"reason":"${reason}"}\n\n`));
const waitFor = async (cond: () => boolean, ms = 3000) => {
  const until = Date.now() + ms;
  while (!cond() && Date.now() < until) await new Promise((r) => setTimeout(r, 10));
  assert.ok(cond(), 'condition did not become true in time');
};

const logs: Record<string, unknown>[] = [];
const log: Logger = { info: (e) => logs.push(e), error: (e) => logs.push(e) };
let bff: http.Server;
let bffUrl: string;
let limited: http.Server; // a second BFF with a stream limit of one and a short silence limit
let limitedUrl: string;
const catalog = http.createServer((_req, res) => res.writeHead(404).end());
const port = (s: http.Server) => (s.address() as AddressInfo).port;

before(async () => {
  await new Promise<void>((r) => catalog.listen(0, '127.0.0.1', r));
  await new Promise<void>((r) => ordering.listen(0, '127.0.0.1', r));
  const base = {
    port: 0,
    catalogUrl: `http://127.0.0.1:${port(catalog)}`,
    orderingUrl: `http://127.0.0.1:${port(ordering)}`,
    timeoutMs: 300,
    checkoutTimeoutMs: 300,
  };
  bff = createServer({ ...base, streamIdleMs: 400 }, { log, exporter: () => {} });
  limited = createServer({ ...base, maxStreams: 1 }, { log, exporter: () => {} });
  await new Promise<void>((r) => bff.listen(0, '127.0.0.1', r));
  await new Promise<void>((r) => limited.listen(0, '127.0.0.1', r));
  bffUrl = `http://127.0.0.1:${port(bff)}/graphql`;
  limitedUrl = `http://127.0.0.1:${port(limited)}/graphql`;
});
after(() => {
  for (const r of fake.open) r.destroy();
  bff.closeAllConnections();
  limited.closeAllConnections();
  bff.close();
  limited.close();
  catalog.close();
  ordering.close();
});
beforeEach(() => {
  fake.mode = 'ok';
  fake.requests.length = 0;
  fake.closedByPeer = 0;
  logs.length = 0;
});
afterEach(() => {
  for (const r of fake.open) r.destroy();
});

interface Frame {
  event?: string;
  data?: string;
  comment?: string;
}

/** An open event stream from the BFF, read frame by frame. */
class Stream {
  readonly res: Response;
  private reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  private buffer = '';
  readonly abort = new AbortController();

  private constructor(res: Response, abort: AbortController) {
    this.res = res;
    this.abort = abort;
  }

  static async open(
    url = bffUrl,
    init: { headers?: Record<string, string>; query?: string; method?: string } = {},
  ): Promise<Stream> {
    const abort = new AbortController();
    const res = await fetch(url, {
      method: init.method ?? 'POST',
      headers: { accept: 'text/event-stream', 'content-type': 'application/json', ...(init.headers ?? auth) },
      body: init.method && init.method !== 'POST' ? null : JSON.stringify({ query: init.query ?? SUBSCRIBE }),
      signal: abort.signal,
    });
    return new Stream(res, abort);
  }

  /** The next frame (an event or a comment), or null at the end of the stream. */
  async next(ms = 3000): Promise<Frame | null> {
    const until = Date.now() + ms;
    for (;;) {
      const end = this.buffer.indexOf('\n\n');
      if (end >= 0) {
        const raw = this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end + 2);
        const frame: Frame = {};
        for (const line of raw.split('\n')) {
          if (line.startsWith(':')) frame.comment = line.slice(1).trim();
          else if (line.startsWith('event:')) frame.event = line.slice(6).trim();
          else if (line.startsWith('data:')) frame.data = line.slice(5).trim();
        }
        return frame;
      }
      const left = until - Date.now();
      if (left <= 0) throw new Error('no frame in time');
      this.reader ??= this.res.body!.getReader(); // taken only when frames are read, so a test may read the whole body as text instead
      const chunk = await Promise.race([
        this.reader.read(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('no frame in time')), left)),
      ]);
      if (chunk.done) return null;
      this.buffer += new TextDecoder().decode(chunk.value);
    }
  }

  /** The next `next` event's parsed payload, skipping comments. */
  async nextResult(ms = 3000) {
    for (;;) {
      const f = await this.next(ms);
      if (f === null) throw new Error('the stream ended');
      if (f.event === 'next')
        return JSON.parse(f.data ?? '{}') as {
          data?: { vendorOrderChanged: Record<string, unknown> };
          errors?: { message: string; extensions?: Record<string, unknown> }[];
        };
    }
  }

  close() {
    this.abort.abort();
  }
}

const globalId = (n: number) => toGlobalId('VendorOrder', `order-${n}`);

describe('Subscription.vendorOrderChanged', () => {
  test('forwards the vendor token unchanged to ordering and pushes each changed order in the vendor view', async () => {
    const s = await Stream.open();
    assert.equal(s.res.status, 200);
    await waitFor(() => fake.open.size === 1);

    push(order(1));
    const first = await s.nextResult();
    push(order(1, 'Confirmed', 2));
    const second = await s.nextResult();

    assert.equal(first.errors, undefined);
    assert.deepEqual(first.data?.vendorOrderChanged, {
      id: globalId(1),
      reference: 'REF1',
      status: 'PLACED',
      sequence: 1,
      total: { cents: 2400, currency: 'USD' },
      updatedAt: '2026-11-02T13:00:00+00:00',
      lines: [
        {
          listingId: toGlobalId('Listing', 'listing-sourdough-001'),
          listingName: 'Country Sourdough',
          quantity: 2,
          modifiers: [],
        },
      ],
    });
    assert.equal(second.data?.vendorOrderChanged.status, 'CONFIRMED');
    assert.equal(second.data?.vendorOrderChanged.sequence, 2);
    const request = fake.requests[0]!;
    assert.equal(request.authorization, `Bearer ${TOKEN}`);
    assert.equal(request.accept, 'text/event-stream');
    assert.match(request.traceparent ?? '', /^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/);
    s.close();
  });

  test('says it is ready, with a comment, as soon as the subscription is established, and not when it is refused', async () => {
    // The library follows it with an empty comment of its own on every stream (some browsers ignore a flushed header alone); "ready" is ours.
    const ok = await Stream.open();
    const comments: (string | undefined)[] = [];
    for (let frame = await ok.next(); frame; frame = await ok.next()) {
      comments.push(frame.comment);
      if (frame.comment === 'ready') break;
    }
    assert.deepEqual(comments, ['ready']); // the very first thing sent: before any change and long before the first ping
    ok.close();

    fake.mode = 'unauthorized';
    const refused = await Stream.open();
    const seen: Frame[] = [];
    for (let frame = await refused.next(); frame; frame = await refused.next()) {
      seen.push(frame);
      if (frame.event === 'next') break;
    }
    assert.equal(seen.at(-1)?.event, 'next'); // the error is what follows the library's empty comment
    assert.ok(!seen.some((f) => f.comment === 'ready'));
  });

  test('answers as an uncached event stream that carries the trace id', async () => {
    const s = await Stream.open();

    assert.match(s.res.headers.get('content-type') ?? '', /^text\/event-stream/);
    assert.equal(s.res.headers.get('cache-control'), 'private, no-store');
    assert.equal(s.res.headers.get('x-accel-buffering'), 'no');
    assert.match(s.res.headers.get('x-correlation-id') ?? '', /^[0-9a-f]{32}$/);
    assert.match(s.res.headers.get('traceparent') ?? '', new RegExp(`^00-${s.res.headers.get('x-correlation-id')}-`));
    s.close();
  });

  test('does not surface heartbeat comments from ordering as results', async () => {
    const s = await Stream.open();
    await waitFor(() => fake.open.size === 1);

    heartbeat();
    heartbeat();
    push(order(2));

    assert.equal((await s.nextResult()).data?.vendorOrderChanged.id, globalId(2));
    s.close();
  });

  test('completes when ordering ends the stream at the token expiry, and when it replaces it', async () => {
    const a = await Stream.open();
    await waitFor(() => fake.open.size === 1);
    finish('expired');
    let frame: Frame | null;
    do frame = await a.next();
    while (frame && frame.event !== 'complete');
    assert.equal(frame?.event, 'complete');

    const b = await Stream.open();
    await waitFor(() => fake.open.size === 1);
    finish('closed', 'replaced');
    do frame = await b.next();
    while (frame && frame.event !== 'complete');
    assert.equal(frame?.event, 'complete');
  });

  test('without a bearer token it answers UNAUTHENTICATED and never contacts ordering', async () => {
    const s = await Stream.open(bffUrl, { headers: {} });
    const result = await s.nextResult();

    assert.equal(result.errors?.[0]?.extensions?.code, 'UNAUTHENTICATED');
    assert.equal(fake.requests.length, 0);
  });

  test('maps ordering refusing the stream to UNAUTHENTICATED, FORBIDDEN, or the safe error without any detail', async () => {
    fake.mode = 'unauthorized';
    assert.equal((await (await Stream.open()).nextResult()).errors?.[0]?.extensions?.code, 'UNAUTHENTICATED');
    fake.mode = 'forbidden';
    assert.equal((await (await Stream.open()).nextResult()).errors?.[0]?.extensions?.code, 'FORBIDDEN');

    fake.mode = 'unavailable';
    const unavailable = await (await Stream.open()).nextResult();
    assert.equal(unavailable.errors?.[0]?.extensions?.code, 'INTERNAL');
    assert.doesNotMatch(JSON.stringify(unavailable), /redis|secret|stream_unavailable|127\.0\.0\.1/);
  });

  test('closes the connection to ordering at once when the client leaves, not at the silence limit', async () => {
    const s = await Stream.open(limitedUrl); // this BFF waits 45 seconds for a heartbeat
    await waitFor(() => fake.open.size === 1);
    const left = Date.now();

    s.close();

    await waitFor(() => fake.open.size === 0, 1500);
    assert.ok(Date.now() - left < 1000);
    assert.equal(fake.closedByPeer, 1);
    assert.equal(
      logs.some((l) => l.msg === 'subscription failed'),
      false,
    ); // leaving is not a failure
  });

  test('ends with the safe error, and closes ordering, when ordering goes silent past the limit', async () => {
    const s = await Stream.open(); // this BFF waits 400 ms for a heartbeat
    await waitFor(() => fake.open.size === 1);

    const result = await s.nextResult(3000);

    assert.equal(result.errors?.[0]?.extensions?.code, 'INTERNAL');
    assert.doesNotMatch(JSON.stringify(result), /silent|ordering/i);
    await waitFor(() => fake.open.size === 0);
  });

  test('a heartbeat keeps a quiet stream alive past the silence limit', async () => {
    const s = await Stream.open();
    await waitFor(() => fake.open.size === 1);

    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 200));
      heartbeat();
    }
    push(order(3));

    assert.equal((await s.nextResult()).data?.vendorOrderChanged.id, globalId(3)); // 800 ms in, twice the limit
    s.close();
  });

  test('ends with the safe error, not a hang, when ordering sends something that is not an order', async () => {
    const s = await Stream.open();
    await waitFor(() => fake.open.size === 1);

    [...fake.open].forEach((r) => r.write('event: order\ndata: not json at all\n\n'));
    const result = await s.nextResult();

    assert.equal(result.errors?.[0]?.extensions?.code, 'INTERNAL');
  });

  test('refuses a query or a mutation over an event stream, with a 400', async () => {
    const query = await Stream.open(bffUrl, { query: '{ vendorOrders { edges { cursor } } }' });
    assert.equal(query.res.status, 400);
    assert.match(await query.res.text(), /Only subscription operations/);

    const mutation = await Stream.open(bffUrl, { query: 'mutation { __typename }' });
    assert.equal(mutation.res.status, 400);
    assert.equal(fake.requests.length, 0);
  });

  test('refuses an invalid subscription with a 400 and the validation errors', async () => {
    const s = await Stream.open(bffUrl, { query: 'subscription { vendorOrderChanged { nope } }' });

    assert.equal(s.res.status, 400);
    assert.match(await s.res.text(), /Cannot query field/);
  });

  test('works with the graphql-sse client the apps will use', async () => {
    const client = createClient({ url: bffUrl, headers: auth, fetchFn: fetch, retryAttempts: 0 });
    const iterator = client.iterate({ query: SUBSCRIBE })[Symbol.asyncIterator]();
    await waitFor(() => fake.open.size === 1);

    push(order(7, 'InPreparation', 5));
    const { value } = await iterator.next();

    assert.equal(
      (value as { data: { vendorOrderChanged: { id: string; status: string; sequence: number } } }).data
        .vendorOrderChanged.id,
      globalId(7),
    );
    assert.equal(
      (value as { data: { vendorOrderChanged: { status: string } } }).data.vendorOrderChanged.status,
      'IN_PREPARATION',
    );
    await iterator.return?.();
    await waitFor(() => fake.open.size === 0);
    await client.dispose();
  });
});

describe('the event-stream route', () => {
  test('serves only POST /graphql: PUT (single-connection mode) and GET are 404 and register nothing', async () => {
    const put = await fetch(bffUrl, {
      method: 'PUT',
      headers: { accept: 'text/event-stream', 'x-graphql-event-stream-token': 'abc' },
    });
    const get = await fetch(`${bffUrl}?query=${encodeURIComponent(SUBSCRIBE)}`, {
      headers: { accept: 'text/event-stream', ...auth },
    });

    assert.equal(put.status, 404);
    assert.equal(get.status, 404);
    assert.equal(fake.requests.length, 0);
  });

  test('ignores a stream token header: every subscription is its own connection', async () => {
    const s = await Stream.open(bffUrl, { headers: { ...auth, 'x-graphql-event-stream-token': 'abc' } });

    assert.equal(s.res.status, 200);
    await waitFor(() => fake.open.size === 1);
    s.close();
  });

  test('requires a Content-Length and refuses a body over 64 KB before reading it', async () => {
    const big = await fetch(bffUrl, {
      method: 'POST',
      headers: { accept: 'text/event-stream', 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ query: SUBSCRIBE, variables: { pad: 'x'.repeat(70 * 1024) } }),
    });
    const noLength = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        bffUrl,
        {
          method: 'POST',
          headers: { accept: 'text/event-stream', 'content-type': 'application/json', 'transfer-encoding': 'chunked' },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on('error', reject);
      req.write('{"query":"subscription { vendorOrderChanged { id } }"}');
      req.end();
    });

    assert.equal(big.status, 413);
    assert.equal(noLength, 411);
    assert.equal(fake.requests.length, 0);
  });

  test('holds at most MAX_STREAMS subscriptions and tells the rest to poll, then frees the place', async () => {
    const first = await Stream.open(limitedUrl);
    await waitFor(() => fake.open.size === 1);

    const refused = await Stream.open(limitedUrl);

    assert.equal(refused.res.status, 503);
    assert.equal(refused.res.headers.get('retry-after'), '30');
    assert.match(await refused.res.text(), /STREAM_LIMIT/);

    first.close();
    await waitFor(() => fake.open.size === 0);
    await new Promise((r) => setTimeout(r, 50));
    const again = await Stream.open(limitedUrl);
    assert.equal(again.res.status, 200);
    again.close();
  });

  test('a request that sends its body slowly does not take a place among the streams', async () => {
    const slow = http.request(limitedUrl, {
      method: 'POST',
      headers: { accept: 'text/event-stream', 'content-type': 'application/json', 'content-length': '200', ...auth },
    });
    slow.on('error', () => undefined);
    slow.write('{"query":"subscription'); // 20 of 200 bytes, and then nothing
    await new Promise((r) => setTimeout(r, 100));

    const real = await Stream.open(limitedUrl); // this BFF holds one stream

    assert.equal(real.res.status, 200);
    await waitFor(() => fake.open.size === 1);
    real.close();
    slow.destroy();
  });

  test('leaves the JSON route as it was: a POST that does not ask for a stream is a normal query', async () => {
    const res = await fetch(bffUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ query: '{ __typename }' }),
    });

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { data: { __typename: 'Query' } });
  });

  test('never writes the token to a log line', async () => {
    const s = await Stream.open();
    await waitFor(() => fake.open.size === 1);
    push(order(9));
    await s.nextResult();
    s.close();
    await waitFor(() => fake.open.size === 0);
    await waitFor(() => logs.some((l) => l.msg === 'graphql subscription closed'));

    assert.doesNotMatch(JSON.stringify(logs), new RegExp(TOKEN.replaceAll('.', '\\.')));
  });
});
