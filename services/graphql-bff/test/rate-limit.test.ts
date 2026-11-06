import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { loadConfig } from '../src/config.ts';
import {
  connectionAddress,
  createTokenBucketLimiter,
  DEFAULT_PER_MINUTE,
  ratePerMinuteFromEnv,
} from '../src/rate-limit.ts';
import { createServer, type Logger } from '../src/server.ts';

// WI-RATE-001: the BFF's coarse backstop. The per-login limits are at the web apps (packages/web-session).

describe('the token bucket', () => {
  test('bursts to the limit, refuses with how long to wait, allows again as time passes, and keeps keys apart', () => {
    let t = 0;
    const limiter = createTokenBucketLimiter(3, () => t);
    assert.deepEqual(
      [1, 2, 3].map(() => limiter.take('a').allowed),
      [true, true, true],
    );
    const refused = limiter.take('a');
    assert.deepEqual(refused, { allowed: false, retryAfterSeconds: 20 });
    assert.equal(limiter.take('b').allowed, true);
    t += 20_000;
    assert.equal(limiter.take('a').allowed, true);
    assert.equal(limiter.take('a').allowed, false);
    t += 600_000; // a long quiet time banks no more than a full bucket
    assert.deepEqual(
      [1, 2, 3, 4].map(() => limiter.take('a').allowed),
      [true, true, true, false],
    );
  });

  test('memory is bounded under a flood of different keys', () => {
    const limiter = createTokenBucketLimiter(1, () => 0);
    for (let i = 0; i < 25_000; i++) limiter.take(`k${i}`);
    assert.equal(limiter.take('k0').allowed, true); // the oldest was forgotten, so it starts full
    assert.equal(limiter.take('k24999').allowed, false); // the newest is still held
  });

  test('refuses nonsense', () => {
    assert.throws(() => createTokenBucketLimiter(0));
    assert.throws(() => createTokenBucketLimiter(2.5));
  });
});

describe('the setting', () => {
  test('defaults to 600, reads a whole number, and a bad value stops the start naming the variable only', () => {
    assert.equal(ratePerMinuteFromEnv({}), DEFAULT_PER_MINUTE);
    assert.equal(DEFAULT_PER_MINUTE, 600);
    assert.equal(ratePerMinuteFromEnv({ BFF_RATE_LIMIT_PER_MINUTE: '50' }), 50);
    for (const bad of ['0', '-1', '1.5', 'secret-word', '100001', '1e3']) {
      assert.throws(
        () => loadConfig({ BFF_RATE_LIMIT_PER_MINUTE: bad }),
        (e: Error) => e.message.includes('BFF_RATE_LIMIT_PER_MINUTE') && (bad.length < 4 || !e.message.includes(bad)),
      );
    }
    assert.equal(loadConfig({}).rateLimitPerMinute, 600);
  });

  test('the address is the connection, an IPv4 address inside IPv6 is IPv4, and nothing is "unknown"', () => {
    assert.equal(connectionAddress({ remoteAddress: '::ffff:10.1.2.3' }), '10.1.2.3');
    assert.equal(connectionAddress({ remoteAddress: '10.1.2.3' }), '10.1.2.3');
    assert.equal(connectionAddress(undefined), 'unknown');
  });
});

describe('/graphql', () => {
  const orderingCalls: string[] = [];
  const reply = (res: http.ServerResponse, code: number, body: unknown) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const catalog = http.createServer((req, res) => {
    orderingCalls.push(`catalog ${req.url}`);
    reply(res, 200, { items: [], nextCursor: null });
  });
  const ordering = http.createServer((req, res) => {
    orderingCalls.push(`ordering ${req.url}`);
    reply(res, 404, {});
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
        timeoutMs: 300,
        checkoutTimeoutMs: 300,
        rateLimitPerMinute: 4,
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
  beforeEach(() => {
    orderingCalls.length = 0;
  });

  const query = (headers: Record<string, string> = {}) =>
    fetch(`${url}/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ query: '{ listings { edges { cursor } } }' }),
    });

  test('past the ceiling a request is refused with 429, Retry-After and a code, and nothing is called; health checks are not counted', async () => {
    // The first window of this server: 4 allowed. Health checks first, to show they do not use the allowance.
    for (let i = 0; i < 10; i++) assert.equal((await fetch(`${url}/healthz`)).status, 200);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await query()).status);
    assert.deepEqual(statuses, [200, 200, 200, 200, 429, 429]);
    assert.equal(orderingCalls.length, 4); // the catalog was called for the four that got through, and for no refused one

    const refused = await query();
    const body = (await refused.json()) as { errors: { message: string; extensions: { code: string } }[] };
    assert.equal(refused.status, 429);
    assert.match(refused.headers.get('retry-after') ?? '', /^\d+$/);
    assert.equal(body.errors[0]!.extensions.code, 'RATE_LIMITED');
    assert.equal(body.errors[0]!.message, 'Too many requests. Please wait a moment and try again.');
    assert.equal(refused.headers.get('cache-control'), 'private, no-store');
    assert.ok(logs.some((l) => l.msg === 'graphql request refused: rate limit'));
  });

  test('a forged X-Forwarded-For does not change who is counted', async () => {
    const refused = await query({ 'x-forwarded-for': '203.0.113.77' });
    assert.equal(refused.status, 429);
  });

  test('a stream request is counted by the same ceiling', async () => {
    const res = await fetch(`${url}/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream', 'content-length': '2' },
      body: '{}',
    });
    assert.equal(res.status, 429);
  });
});
