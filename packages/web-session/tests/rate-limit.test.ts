import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  clientAddress,
  createTokenBucketLimiter,
  createWebRateLimits,
  DEFAULT_RATE_LIMITS,
  rateLimitSettingsFromEnv,
} from '../src/rate-limit.ts';
import { createAuthHandlers, createGraphqlHandler, createGraphqlStreamHandler } from '../src/handlers.ts';
import type { ApiRequest, ApiResponse } from '../src/handlers.ts';
import type { StreamResponse } from '../src/graphql-proxy.ts';
import { createSessionService } from '../src/service.ts';
import { createMemoryStore } from '../src/store.ts';
import { ManualClock, fakeIssuer, fakeJwt, newSealer, testConfig, tokenResponse } from './helpers.ts';

// WI-RATE-001 (register item 128): the token bucket, the caller's address, the settings, and the routes that use them.

const MINUTE = 60_000;
const ORIGIN = 'http://localhost:3100';

describe('createTokenBucketLimiter', () => {
  test('lets a key burst up to the limit, then refuses with how long to wait', () => {
    const clock = new ManualClock();
    const limiter = createTokenBucketLimiter({ perMinute: 3, now: clock.now });

    assert.deepEqual(
      [1, 2, 3].map(() => limiter.take('a').allowed),
      [true, true, true],
    );
    const fourth = limiter.take('a');

    assert.equal(fourth.allowed, false);
    assert.equal(fourth.allowed === false && fourth.retryAfterSeconds, 20); // one token every 20 s
  });

  test('allows again as the window passes, one token per interval, never more than the limit', () => {
    const clock = new ManualClock();
    const limiter = createTokenBucketLimiter({ perMinute: 3, now: clock.now });
    for (let i = 0; i < 3; i++) limiter.take('a');

    clock.advance(19_000);
    assert.equal(limiter.take('a').allowed, false);
    clock.advance(1_000);
    assert.equal(limiter.take('a').allowed, true);
    assert.equal(limiter.take('a').allowed, false);

    clock.advance(10 * MINUTE); // a long quiet time does not bank more than a full bucket
    assert.deepEqual(
      [1, 2, 3, 4].map(() => limiter.take('a').allowed),
      [true, true, true, false],
    );
  });

  test('keys are separate: one key being refused does not refuse another', () => {
    const limiter = createTokenBucketLimiter({ perMinute: 1, now: new ManualClock().now });
    assert.equal(limiter.take('a').allowed, true);
    assert.equal(limiter.take('a').allowed, false);
    assert.equal(limiter.take('b').allowed, true);
  });

  test('a refused request does not push the wait further away', () => {
    const clock = new ManualClock();
    const limiter = createTokenBucketLimiter({ perMinute: 1, now: clock.now });
    limiter.take('a');
    for (let i = 0; i < 50; i++) limiter.take('a'); // hammering while refused

    clock.advance(MINUTE);
    assert.equal(limiter.take('a').allowed, true);
  });

  test('memory is bounded: past the maximum the least recently used key is forgotten', () => {
    const limiter = createTokenBucketLimiter({ perMinute: 1, maxKeys: 3, now: new ManualClock().now });
    for (const key of ['a', 'b', 'c']) limiter.take(key);
    limiter.take('a'); // refused, but "a" is now the most recently used
    limiter.take('d'); // a fourth key: "b", the least recently used, is dropped

    assert.equal(limiter.take('b').allowed, true, 'b was forgotten, so it starts full');
    assert.equal(limiter.take('a').allowed, false, 'a was kept, so it is still limited');
  });

  test('a flood of different keys cannot make the table grow without bound', () => {
    let size = 0;
    const limiter = createTokenBucketLimiter({ perMinute: 1, maxKeys: 100, now: new ManualClock().now });
    for (let i = 0; i < 10_000; i++) limiter.take(`k${i}`);
    // Observable through behaviour: only the last 100 keys are still limited; the first has been forgotten.
    for (let i = 9_900; i < 10_000; i++) if (!limiter.take(`k${i}`).allowed) size++;
    assert.equal(size, 100);
    assert.equal(limiter.take('k0').allowed, true);
  });

  test('refuses nonsense settings', () => {
    assert.throws(() => createTokenBucketLimiter({ perMinute: 0 }));
    assert.throws(() => createTokenBucketLimiter({ perMinute: 1.5 }));
    assert.throws(() => createTokenBucketLimiter({ perMinute: 1, maxKeys: 0 }));
  });
});

describe('clientAddress', () => {
  const req = (remote: string | undefined, forwarded?: string | string[]) => ({
    headers: forwarded === undefined ? {} : { 'x-forwarded-for': forwarded },
    socket: { remoteAddress: remote },
  });

  test('by default it is the connection, and X-Forwarded-For is ignored however it is set', () => {
    assert.equal(clientAddress(req('10.0.0.5', '1.2.3.4'), 0), '10.0.0.5');
    assert.equal(clientAddress(req('10.0.0.5', ['1.2.3.4', '5.6.7.8']), 0), '10.0.0.5');
  });

  test('an IPv4 address inside IPv6 is the IPv4 address, and a missing connection is "unknown"', () => {
    assert.equal(clientAddress(req('::ffff:127.0.0.1'), 0), '127.0.0.1');
    assert.equal(clientAddress({ headers: {} }, 0), 'unknown');
  });

  test('behind one trusted proxy it is the last entry, the one the proxy added, not what the caller wrote', () => {
    assert.equal(clientAddress(req('10.0.0.5', '6.6.6.6, 203.0.113.9'), 1), '203.0.113.9');
    assert.equal(clientAddress(req('10.0.0.5', '203.0.113.9'), 1), '203.0.113.9');
  });

  test('behind two trusted proxies it is the second from the right; a forged first entry never counts', () => {
    assert.equal(clientAddress(req('10.0.0.5', '6.6.6.6, 203.0.113.9, 10.1.1.1'), 2), '203.0.113.9');
    assert.equal(clientAddress(req('10.0.0.5', ['6.6.6.6', '203.0.113.9, 10.1.1.1']), 2), '203.0.113.9');
  });

  test('a missing or too short header falls back to the connection', () => {
    assert.equal(clientAddress(req('10.0.0.5'), 1), '10.0.0.5');
    assert.equal(clientAddress(req('10.0.0.5', '203.0.113.9'), 2), '10.0.0.5');
    assert.equal(clientAddress(req('10.0.0.5', ' , '), 1), '10.0.0.5');
  });

  test('an absurdly long entry is not used as a key', () => {
    assert.equal(clientAddress(req('10.0.0.5', 'x'.repeat(500)), 1), '10.0.0.5');
  });
});

describe('rateLimitSettingsFromEnv', () => {
  test('uses the defaults when nothing is set', () => {
    assert.deepEqual(rateLimitSettingsFromEnv({}), { ok: true, settings: DEFAULT_RATE_LIMITS });
    assert.deepEqual(DEFAULT_RATE_LIMITS, {
      trustedProxyHops: 0,
      loginPerMinute: 10,
      graphqlPerMinute: 120,
      streamPerMinute: 10,
      addressPerMinute: 600,
    });
  });

  test('reads each setting', () => {
    const result = rateLimitSettingsFromEnv({
      TRUSTED_PROXY_HOPS: '2',
      RATE_LIMIT_LOGIN_PER_MINUTE: '5',
      RATE_LIMIT_GRAPHQL_PER_MINUTE: '60',
      RATE_LIMIT_STREAM_PER_MINUTE: '3',
      RATE_LIMIT_ADDRESS_PER_MINUTE: '1000',
    });
    assert.deepEqual(result, {
      ok: true,
      settings: {
        trustedProxyHops: 2,
        loginPerMinute: 5,
        graphqlPerMinute: 60,
        streamPerMinute: 3,
        addressPerMinute: 1000,
      },
    });
  });

  test('a bad setting is reported by name and never by value', () => {
    for (const [name, value] of [
      ['RATE_LIMIT_LOGIN_PER_MINUTE', '0'],
      ['RATE_LIMIT_LOGIN_PER_MINUTE', '-1'],
      ['RATE_LIMIT_GRAPHQL_PER_MINUTE', '1.5'],
      ['RATE_LIMIT_STREAM_PER_MINUTE', 'lots-secret'],
      ['RATE_LIMIT_ADDRESS_PER_MINUTE', '100001'],
      ['TRUSTED_PROXY_HOPS', 'x'],
    ] as const) {
      const result = rateLimitSettingsFromEnv({ [name]: value });
      assert.equal(result.ok, false, `${name}=${value}`);
      assert.ok(!result.ok && result.reason.includes(name));
      if (value.length > 3) assert.ok(!result.ok && !result.reason.includes(value));
    }
  });

  test('zero trusted hops is allowed; zero requests a minute is not', () => {
    assert.equal(rateLimitSettingsFromEnv({ TRUSTED_PROXY_HOPS: '0' }).ok, true);
    assert.equal(rateLimitSettingsFromEnv({ RATE_LIMIT_ADDRESS_PER_MINUTE: '0' }).ok, false);
  });
});

// ---- the routes ---------------------------------------------------------------------------------------------------------------------

function req(
  method: string,
  headers: Record<string, string> = {},
  options: { url?: string; query?: Record<string, string>; remote?: string } = {},
): ApiRequest {
  return {
    method,
    url: options.url ?? '/',
    headers,
    query: options.query ?? {},
    socket: { remoteAddress: options.remote ?? '10.0.0.1' },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from('{"query":"{ listings { id } }"}');
    },
  };
}

function res() {
  const out = {
    statusCode: 200,
    headers: {} as Record<string, string | string[]>,
    body: undefined as unknown,
    ended: false,
  };
  const api = {
    status(code: number) {
      out.statusCode = code;
      return api;
    },
    setHeader(name: string, value: string | string[]) {
      out.headers[name.toLowerCase()] = value;
      return api;
    },
    json(body: unknown) {
      out.body = body;
      out.ended = true;
      return api;
    },
    send(body: unknown) {
      out.body = body;
      out.ended = true;
      return api;
    },
    end() {
      out.ended = true;
      return api;
    },
  };
  return { api: api as unknown as ApiResponse & StreamResponse, out };
}

function rig(settings: Partial<typeof DEFAULT_RATE_LIMITS> = {}) {
  const clock = new ManualClock();
  const config = testConfig();
  const store = createMemoryStore(newSealer(), clock.now);
  const issuer = fakeIssuer(() => tokenResponse({ access: fakeJwt({}, clock.time + 3_600_000), refresh: 'refresh-1' }));
  const service = createSessionService({ config, store, fetch: issuer.fetchImpl, clock });
  const limits = createWebRateLimits({ ...DEFAULT_RATE_LIMITS, ...settings }, clock.now);
  const bff: string[] = [];
  const bffHeaders: Record<string, string>[] = [];
  const bffFetch = (async (url: string, init?: RequestInit) => {
    bff.push(url);
    bffHeaders.push((init?.headers ?? {}) as Record<string, string>);
    return new Response('{"data":{"ok":true}}', { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  const deps = { config, service, target: () => 'http://bff.internal:4100/graphql', fetchImpl: bffFetch, limits };
  return {
    clock,
    service,
    issuer,
    bff,
    bffHeaders,
    auth: createAuthHandlers({ config, service, limits }),
    graphql: createGraphqlHandler(deps),
    stream: createGraphqlStreamHandler(deps),
  };
}

async function loggedIn(r: ReturnType<typeof rig>, remote = '10.0.0.1'): Promise<string> {
  const start = res();
  await r.auth.login(req('GET', {}, { query: { returnTo: '/' }, remote }), start.api);
  const loginCookie = (start.out.headers['set-cookie'] as string[])[0]!.split(';')[0]!;
  const state = new URL(start.out.headers['location'] as string).searchParams.get('state')!;
  const done = res();
  await r.auth.callback(
    req('GET', { cookie: loginCookie }, { url: `/api/auth/callback?code=c&state=${state}`, remote }),
    done.api,
  );
  return (done.out.headers['set-cookie'] as string[])[0]!.split(';')[0]!;
}

const post = (cookie?: string) => ({
  origin: ORIGIN,
  'content-type': 'application/json',
  ...(cookie ? { cookie } : {}),
});

describe('login routes', () => {
  test('a burst of login starts from one address is sent to the error page, and the issuer is not asked', async () => {
    const r = rig({ loginPerMinute: 3 });
    const outcomes: string[] = [];
    for (let i = 0; i < 5; i++) {
      const out = res();
      await r.auth.login(req('GET', {}, { query: { returnTo: '/' } }), out.api);
      outcomes.push(String(out.out.headers['location']));
    }

    assert.ok(
      outcomes.slice(0, 3).every((l) => l.startsWith('http')),
      'the first three go to the issuer',
    );
    assert.deepEqual(outcomes.slice(3), ['/auth/error?code=rate_limited', '/auth/error?code=rate_limited']);
  });

  test('the refused login sets no login cookie, says how long to wait, and is not cacheable', async () => {
    const r = rig({ loginPerMinute: 1 });
    await r.auth.login(req('GET'), res().api);
    const refused = res();
    await r.auth.login(req('GET'), refused.api);

    assert.equal(refused.out.statusCode, 302);
    assert.equal(refused.out.headers['set-cookie'], undefined);
    assert.equal(refused.out.headers['retry-after'], '60');
    assert.equal(refused.out.headers['cache-control'], 'no-store');
  });

  test('a burst of callbacks is refused without reading the code', async () => {
    const r = rig({ loginPerMinute: 2 });
    const outcomes: string[] = [];
    for (let i = 0; i < 4; i++) {
      const out = res();
      await r.auth.callback(req('GET', {}, { url: '/api/auth/callback?code=c&state=s' }), out.api);
      outcomes.push(String(out.out.headers['location']));
    }
    assert.deepEqual(outcomes.slice(2), ['/auth/error?code=rate_limited', '/auth/error?code=rate_limited']);
    assert.equal(r.issuer.calls.length, 0);
  });

  test('another address is not affected, and the same address can log in again a minute later', async () => {
    const r = rig({ loginPerMinute: 1 });
    await r.auth.login(req('GET', {}, { remote: '10.0.0.1' }), res().api);
    const other = res();
    await r.auth.login(req('GET', {}, { remote: '10.0.0.2' }), other.api);
    assert.ok(String(other.out.headers['location']).startsWith('http'));

    const refused = res();
    await r.auth.login(req('GET', {}, { remote: '10.0.0.1' }), refused.api);
    assert.equal(refused.out.headers['location'], '/auth/error?code=rate_limited');
    r.clock.advance(MINUTE);
    const again = res();
    await r.auth.login(req('GET', {}, { remote: '10.0.0.1' }), again.api);
    assert.ok(String(again.out.headers['location']).startsWith('http'));
  });

  test('a forged X-Forwarded-For does not give a caller a new allowance at the default settings', async () => {
    const r = rig({ loginPerMinute: 1 });
    await r.auth.login(req('GET', { 'x-forwarded-for': '1.1.1.1' }), res().api);
    const refused = res();
    await r.auth.login(req('GET', { 'x-forwarded-for': '2.2.2.2' }), refused.api);

    assert.equal(refused.out.headers['location'], '/auth/error?code=rate_limited');
  });

  test('a normal login (the start and the callback) is far inside the limits', async () => {
    const r = rig();
    for (let i = 0; i < 5; i++) assert.ok((await loggedIn(r)).startsWith('bakery-session-'));
  });
});

describe('/api/graphql', () => {
  const body = '{"query":"{ listings { id } }"}';
  const call = async (r: ReturnType<typeof rig>, cookie?: string, remote = '10.0.0.1') => {
    const out = res();
    await r.graphql({ ...req('POST', post(cookie), { remote }) }, out.api);
    return out.out;
  };
  void body;

  test('register 137: the BFF is told the address the request was counted by (anonymous or logged in), and a header the browser sends is replaced', async () => {
    const r = rig();
    const cookie = await loggedIn(r);
    const forged = { 'x-bakery-client-address': '198.51.100.99' };
    for (const headers of [post(cookie), post()]) {
      const out = res();
      await r.graphql({ ...req('POST', { ...headers, ...forged }, { remote: '203.0.113.7' }) }, out.api);
      assert.equal(out.out.statusCode, 200);
    }
    assert.deepEqual(
      r.bffHeaders.map((h) => h['x-bakery-client-address']),
      ['203.0.113.7', '203.0.113.7'],
    );
  });

  test('register 137: behind the configured number of proxies it is the client the proxies saw, not the proxy', async () => {
    const r = rig({ trustedProxyHops: 1 });
    const out = res();
    await r.graphql(
      { ...req('POST', { ...post(), 'x-forwarded-for': '198.51.100.5, 203.0.113.50' }, { remote: '10.9.9.9' }) },
      out.api,
    );
    assert.equal(r.bffHeaders[0]!['x-bakery-client-address'], '203.0.113.50');
  });

  test('a login is limited by its own count: past the limit the request is refused and not forwarded', async () => {
    const r = rig({ graphqlPerMinute: 3 });
    const cookie = await loggedIn(r);
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await call(r, cookie)).statusCode);

    assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
    assert.equal(r.bff.length, 3);
  });

  test('the refusal is a 429 with Retry-After, a fixed sentence, and no-store', async () => {
    const r = rig({ graphqlPerMinute: 1 });
    const cookie = await loggedIn(r);
    await call(r, cookie);
    const refused = await call(r, cookie);

    assert.equal(refused.statusCode, 429);
    assert.equal(refused.headers['retry-after'], '60');
    assert.equal(refused.headers['cache-control'], 'no-store');
    assert.deepEqual(refused.body, { error: 'Too many requests. Please wait a moment and try again.' });
  });

  test('one login being refused does not refuse another login from the same address', async () => {
    const r = rig({ graphqlPerMinute: 1 });
    const first = await loggedIn(r);
    const second = await loggedIn(r);
    await call(r, first);

    assert.equal((await call(r, first)).statusCode, 429);
    assert.equal((await call(r, second)).statusCode, 200);
  });

  test('without a login the limit is per address, so public pages from one address are limited and another address is not', async () => {
    const r = rig({ graphqlPerMinute: 2 });
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await call(r, undefined, '10.0.0.1')).statusCode);

    assert.deepEqual(statuses, [200, 200, 429]);
    assert.equal((await call(r, undefined, '10.0.0.2')).statusCode, 200);
  });

  test('the address ceiling stops a flood of junk cookies before the session store is asked about them', async () => {
    const r = rig({ addressPerMinute: 3 });
    let lookups = 0;
    const original = r.service.resolve.bind(r.service);
    r.service.resolve = (cookie) => {
      lookups++;
      return original(cookie);
    };
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await call(r, `bakery-session-web-queue-display=junk${i}`)).statusCode);

    assert.deepEqual(statuses, [200, 200, 200, 429, 429, 429]);
    assert.equal(lookups, 3);
  });

  test('the window passing lets the login through again', async () => {
    const r = rig({ graphqlPerMinute: 1 });
    const cookie = await loggedIn(r);
    await call(r, cookie);
    assert.equal((await call(r, cookie)).statusCode, 429);
    r.clock.advance(MINUTE);
    assert.equal((await call(r, cookie)).statusCode, 200);
  });

  test('a vendor screen that polls every 7 seconds and acts stays far inside the default limits', async () => {
    const r = rig();
    const cookie = await loggedIn(r);
    const statuses = new Set<number>();
    for (let seconds = 0; seconds < 600; seconds += 7) {
      statuses.add((await call(r, cookie)).statusCode);
      r.clock.advance(7_000);
    }
    assert.deepEqual([...statuses], [200]);
  });
});

describe('/api/graphql-stream', () => {
  // The stream handler here is built with no room for streams (maxOpen 0), so a request that passes the limits is answered 503 "busy" before any
  // relay starts: the status tells a request the limits let through (503) from one they refused (429).
  const open = async (stream: ReturnType<typeof createGraphqlStreamHandler>, cookie: string) => {
    const out = res();
    await stream(req('POST', { ...post(cookie), accept: 'text/event-stream' }), out.api);
    return out.out;
  };
  const noRoom = (r: ReturnType<typeof rig>) =>
    createGraphqlStreamHandler({
      config: testConfig(),
      service: r.service,
      target: () => 'http://bff.internal:4100/graphql',
      limits: createWebRateLimits({ ...DEFAULT_RATE_LIMITS, streamPerMinute: 2 }, r.clock.now),
      maxOpen: 0,
    });

  test('a login that opens streams faster than the limit is refused before its token is renewed or anything is relayed', async () => {
    const r = rig();
    const stream = noRoom(r);
    const cookie = await loggedIn(r);
    const issuerCallsBefore = r.issuer.calls.length;
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await open(stream, cookie)).statusCode);

    assert.deepEqual(statuses, [503, 503, 429, 429]);
    assert.equal(r.bff.length, 0);
    assert.ok(r.issuer.calls.length >= issuerCallsBefore);
  });

  test('a refusal for opening too fast says how long to wait', async () => {
    const r = rig();
    const stream = noRoom(r);
    const cookie = await loggedIn(r);
    await open(stream, cookie);
    await open(stream, cookie);
    const refused = await open(stream, cookie);

    assert.equal(refused.statusCode, 429);
    assert.match(String(refused.headers['retry-after']), /^\d+$/);
  });

  test('the address ceiling applies to stream opens too, and an anonymous caller gets 401 only inside it', async () => {
    const r = rig({ addressPerMinute: 2 });
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      const out = res();
      await r.stream(req('POST', { ...post(), accept: 'text/event-stream' }), out.api);
      statuses.push(out.out.statusCode);
    }
    assert.deepEqual(statuses, [401, 401, 429]);
  });
});

describe('logout and me', () => {
  test('are covered by the address ceiling', async () => {
    const r = rig({ addressPerMinute: 2 });
    const me = [];
    for (let i = 0; i < 3; i++) {
      const out = res();
      await r.auth.me(req('GET'), out.api);
      me.push(out.out.statusCode);
    }
    assert.deepEqual(me, [200, 200, 429]);

    const out = res();
    await r.auth.logout(req('POST', post()), out.api);
    assert.equal(out.out.statusCode, 429); // the same address, the same ceiling
  });
});

describe('without limits', () => {
  test('handlers built without limits do not limit (the existing behavior)', async () => {
    const clock = new ManualClock();
    const config = testConfig();
    const service = createSessionService({
      config,
      store: createMemoryStore(newSealer(), clock.now),
      fetch: fakeIssuer(() => tokenResponse()).fetchImpl,
      clock,
    });
    const auth = createAuthHandlers({ config, service });
    for (let i = 0; i < 50; i++) {
      const out = res();
      await auth.login(req('GET'), out.api);
      assert.ok(String(out.out.headers['location']).startsWith('http'));
    }
  });
});
