import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createAuthHandlers, createGraphqlHandler, type ApiRequest, type ApiResponse } from '../src/handlers.ts';
import { buildAuthorizeUrl, exchangeCode, refreshTokens, TokenError } from '../src/oidc.ts';
import { createSessionService } from '../src/service.ts';
import { createMemoryStore } from '../src/store.ts';
import { ManualClock, errorResponse, fakeIssuer, fakeJwt, newSealer, testConfig, tokenResponse } from './helpers.ts';

const ORIGIN = 'http://localhost:3100';
const MINUTE = 60_000;

function req(
  method: string,
  headers: Record<string, string> = {},
  options: { url?: string; query?: Record<string, string>; body?: string } = {},
): ApiRequest {
  const chunks = options.body === undefined ? [] : [Buffer.from(options.body)];
  return {
    method,
    url: options.url ?? '/',
    headers,
    query: options.query ?? {},
    async *[Symbol.asyncIterator]() {
      yield* chunks;
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
  const api: ApiResponse = {
    status(code) {
      out.statusCode = code;
      return api;
    },
    setHeader(name, value) {
      out.headers[name.toLowerCase()] = value;
      return api;
    },
    json(body) {
      out.body = body;
      out.ended = true;
      return api;
    },
    send(body) {
      out.body = body;
      out.ended = true;
      return api;
    },
    end() {
      out.ended = true;
      return api;
    },
  };
  return { api, out };
}

function rig(answer?: Parameters<typeof fakeIssuer>[0]) {
  const clock = new ManualClock();
  const config = testConfig();
  const store = createMemoryStore(newSealer(), clock.now);
  const issuer = fakeIssuer(
    answer ?? (() => tokenResponse({ access: fakeJwt({}, clock.time + 3_600_000), refresh: 'refresh-1' })),
  );
  const service = createSessionService({ config, store, fetch: issuer.fetchImpl, clock });
  const bff: { url: string; headers: Record<string, string>; body: string }[] = [];
  const bffFetch = (async (url: string, init: RequestInit) => {
    bff.push({
      url,
      headers: init.headers as Record<string, string>,
      body: Buffer.from(init.body as Uint8Array).toString(),
    });
    return new Response('{"data":{"ok":true}}', { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  const auth = createAuthHandlers({ config, service });
  const graphql = createGraphqlHandler({
    config,
    service,
    target: () => 'http://bff.internal:4100/graphql',
    fetchImpl: bffFetch,
  });
  return { clock, config, store, issuer, service, bff, auth, graphql };
}

/** Logs in through the handlers and returns the cookie header the browser would send afterwards. */
async function loggedIn(r: ReturnType<typeof rig>): Promise<string> {
  const start = res();
  await r.auth.login(req('GET', {}, { query: { returnTo: '/' } }), start.api);
  const loginCookie = (start.out.headers['set-cookie'] as string[])[0]!.split(';')[0]!;
  const state = new URL(start.out.headers['location'] as string).searchParams.get('state')!;
  const done = res();
  await r.auth.callback(
    req('GET', { cookie: loginCookie }, { url: `/api/auth/callback?code=c&state=${state}` }),
    done.api,
  );
  return (done.out.headers['set-cookie'] as string[])[0]!.split(';')[0]!;
}

const post = (cookie?: string, extra: Record<string, string> = {}) => ({
  origin: ORIGIN,
  'content-type': 'application/json',
  ...(cookie ? { cookie } : {}),
  ...extra,
});

describe('the token endpoint calls', () => {
  const config = testConfig();

  test('the authorize address carries PKCE and the registered redirect address', () => {
    const url = new URL(buildAuthorizeUrl(config, 'st&ate', 'chal'));

    assert.equal(url.searchParams.get('state'), 'st&ate');
    assert.equal(url.searchParams.get('code_challenge'), 'chal');
    assert.equal(url.searchParams.get('redirect_uri'), `${ORIGIN}/api/auth/callback`);
  });

  test('a code exchange and a refresh give the tokens and say how long the access token lives', async () => {
    const issuer = fakeIssuer(() => tokenResponse({ access: 'a', refresh: 'r', expiresIn: 1800 }));

    const first = await exchangeCode(config, 'code', 'verifier', issuer.fetchImpl);
    const second = await refreshTokens(config, 'r0', issuer.fetchImpl);

    assert.deepEqual(first, { accessToken: 'a', refreshToken: 'r', expiresInSeconds: 1800 });
    assert.deepEqual(second, first);
    assert.equal(issuer.calls[0]!.body.get('code_verifier'), 'verifier');
    assert.equal(issuer.calls[1]!.body.get('refresh_token'), 'r0');
    assert.ok(
      issuer.calls.every(
        (c) => c.body.get('client_secret') === null && c.body.get('client_id') === 'web-queue-display',
      ),
    );
  });

  test('failures are told apart: the grant is bad, the request is rejected, or the issuer is not there', async () => {
    const reason = async (answer: () => Response | Promise<Response>) => {
      try {
        await exchangeCode(config, 'c', 'v', fakeIssuer(answer).fetchImpl);
        return 'none';
      } catch (e) {
        assert.ok(e instanceof TokenError);
        assert.doesNotMatch(e.message, /secret-detail|boom/);
        return e.reason;
      }
    };

    assert.equal(await reason(() => errorResponse('invalid_grant')), 'invalid_grant');
    assert.equal(await reason(() => errorResponse('invalid_client', 401)), 'rejected');
    assert.equal(await reason(() => new Response('secret-detail boom', { status: 400 })), 'rejected');
    assert.equal(await reason(() => new Response('boom', { status: 502 })), 'unavailable');
    assert.equal(
      await reason(() => {
        throw new Error('secret-detail ECONNREFUSED');
      }),
      'unavailable',
    );
    assert.equal(await reason(() => new Response('<html>', { status: 200 })), 'unavailable');
    assert.equal(await reason(() => Response.json({ access_token: 'a' })), 'unavailable'); // no expiry: not a usable answer
    assert.equal(await reason(() => Response.json({ access_token: 'a', expires_in: -5 })), 'unavailable');
  });

  test('a refresh that gives no new refresh token leaves it undefined, for the caller to keep the old one', async () => {
    const issuer = fakeIssuer(() => tokenResponse({ access: 'a', refresh: null }));

    assert.equal((await refreshTokens(config, 'r0', issuer.fetchImpl)).refreshToken, undefined);
  });
});

describe('the login handlers', () => {
  test('login redirects to the issuer, sets the pending cookie, and is not cacheable', async () => {
    const r = rig();
    const out = res();

    await r.auth.login(req('GET', {}, { query: { returnTo: '/orders' } }), out.api);

    assert.equal(out.out.statusCode, 302);
    assert.match(out.out.headers['location'] as string, /^http:\/\/localhost:5100\/authorize\?/);
    assert.match((out.out.headers['set-cookie'] as string[])[0]!, /^bakery-login-web-queue-display=/);
    assert.equal(out.out.headers['cache-control'], 'no-store');
  });

  test('only the right method is accepted', async () => {
    const r = rig();
    for (const [handler, method, allow] of [
      [r.auth.login, 'POST', 'GET'],
      [r.auth.callback, 'POST', 'GET'],
      [r.auth.logout, 'GET', 'POST'],
      [r.auth.me, 'POST', 'GET'],
    ] as const) {
      const out = res();
      await handler(req(method), out.api);
      assert.equal(out.out.statusCode, 405, method);
      assert.equal(out.out.headers['allow'], allow);
    }
  });

  test('the callback exchanges the code, sets the session cookie, goes to the page the user was on, and sends no referrer', async () => {
    const r = rig();
    const start = res();
    await r.auth.login(req('GET', {}, { query: { returnTo: '/orders/1' } }), start.api);
    const loginCookie = (start.out.headers['set-cookie'] as string[])[0]!.split(';')[0]!;
    const state = new URL(start.out.headers['location'] as string).searchParams.get('state')!;

    const out = res();
    await r.auth.callback(
      req('GET', { cookie: loginCookie }, { url: `/api/auth/callback?code=abc&state=${state}` }),
      out.api,
    );

    assert.equal(out.out.statusCode, 302);
    assert.equal(out.out.headers['location'], '/orders/1');
    assert.equal(out.out.headers['referrer-policy'], 'no-referrer');
    assert.equal(out.out.headers['cache-control'], 'no-store');
    const cookies = out.out.headers['set-cookie'] as string[];
    assert.match(cookies[0]!, /^bakery-session-web-queue-display=[A-Za-z0-9_-]{43}; .*HttpOnly/);
    assert.ok(!cookies.join().includes('eyJ')); // no token in any cookie
  });

  test('a failed callback goes to the error page with a code and no detail', async () => {
    const r = rig(() => errorResponse('invalid_grant'));
    const start = res();
    await r.auth.login(req('GET'), start.api);
    const loginCookie = (start.out.headers['set-cookie'] as string[])[0]!.split(';')[0]!;
    const state = new URL(start.out.headers['location'] as string).searchParams.get('state')!;

    const out = res();
    await r.auth.callback(
      req('GET', { cookie: loginCookie }, { url: `/api/auth/callback?code=abc&state=${state}` }),
      out.api,
    );
    const again = res();
    await r.auth.callback(
      req('GET', { cookie: loginCookie }, { url: `/api/auth/callback?code=abc&state=${state}` }),
      again.api,
    );

    assert.equal(out.out.headers['location'], '/auth/error?code=exchange_failed');
    assert.equal(again.out.headers['location'], '/auth/error?code=no_pending');
    assert.equal(out.out.headers['set-cookie'], undefined);
  });

  test('me says who is logged in without a token, and says nobody otherwise', async () => {
    const r = rig();
    const cookie = await loggedIn(r);

    const user = res();
    await r.auth.me(req('GET', { cookie }), user.api);
    const nobody = res();
    await r.auth.me(req('GET'), nobody.api);

    assert.deepEqual((user.out.body as { authenticated: boolean }).authenticated, true);
    assert.equal((user.out.body as { user: { subject: string } }).user.subject, 'vendor-shop-001');
    assert.doesNotMatch(JSON.stringify(user.out.body), /eyJ|refresh|access/i);
    assert.deepEqual(nobody.out.body, { authenticated: false });
    assert.equal(user.out.headers['cache-control'], 'no-store');
  });

  test('logout needs the app origin and a JSON request, then ends the session and clears the cookie', async () => {
    const r = rig();
    const cookie = await loggedIn(r);

    const forged = res();
    await r.auth.logout(
      req('POST', { cookie, origin: 'http://evil.example', 'content-type': 'application/json' }),
      forged.api,
    );
    const form = res();
    await r.auth.logout(
      req('POST', { cookie, origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' }),
      form.api,
    );
    const stillThere = res();
    await r.auth.me(req('GET', { cookie }), stillThere.api);
    const real = res();
    await r.auth.logout(req('POST', post(cookie)), real.api);
    const gone = res();
    await r.auth.me(req('GET', { cookie }), gone.api);

    assert.equal(forged.out.statusCode, 403);
    assert.equal(form.out.statusCode, 403);
    assert.equal((stillThere.out.body as { authenticated: boolean }).authenticated, true);
    assert.equal(real.out.statusCode, 204);
    assert.match(real.out.headers['set-cookie'] as string, /^bakery-session-web-queue-display=; .*Max-Age=0/);
    assert.equal((gone.out.body as { authenticated: boolean }).authenticated, false);
  });
});

describe('the GraphQL handler', () => {
  const body = '{"query":"{ listings { edges { node { id } } } }"}';

  test('refuses a request that fails the CSRF checks and calls nothing', async () => {
    const r = rig();
    const cookie = await loggedIn(r);
    const cases: Record<string, string>[] = [
      { origin: 'http://evil.example', 'content-type': 'application/json', cookie },
      { 'content-type': 'application/json', cookie },
      { origin: ORIGIN, 'content-type': 'text/plain', cookie },
      { origin: ORIGIN, 'content-type': 'application/json', 'sec-fetch-site': 'cross-site', cookie },
    ];
    for (const headers of cases) {
      const out = res();
      await r.graphql(req('POST', headers, { body }), out.api);
      assert.equal(out.out.statusCode, 403, JSON.stringify(headers));
    }

    assert.equal(r.bff.length, 0);
  });

  test('an anonymous request goes on without a bearer header, for the public pages', async () => {
    const r = rig();
    const out = res();

    await r.graphql(req('POST', post(), { body }), out.api);

    assert.equal(out.out.statusCode, 200);
    assert.equal(r.bff.length, 1);
    assert.equal(r.bff[0]!.headers['authorization'], undefined);
    assert.equal(r.bff[0]!.body, body);
  });

  test('a logged-in request carries the session token as the bearer header, and never the cookie or a header the browser sent', async () => {
    const r = rig();
    const cookie = await loggedIn(r);
    const stored = [...(await Promise.all([r.store.get(cookie.split('=')[1]!)]))][0]!;
    const out = res();

    await r.graphql(req('POST', post(cookie, { authorization: 'Bearer forged-by-the-browser' }), { body }), out.api);

    assert.equal(r.bff[0]!.headers['authorization'], `Bearer ${stored.accessToken}`);
    assert.ok(!JSON.stringify(r.bff[0]!.headers).includes('bakery-session-web-queue-display'));
    assert.ok(!JSON.stringify(r.bff[0]!.headers).includes('forged'));
  });

  test('a token about to expire is renewed before the request goes on', async () => {
    const r = rig((call, n) =>
      tokenResponse({ access: fakeJwt({}, r.clock.time + 3_600_000), refresh: `refresh-${n}` }),
    );
    const cookie = await loggedIn(r);
    r.clock.advance(59 * MINUTE + 30_000);
    const out = res();

    await r.graphql(req('POST', post(cookie), { body }), out.api);

    assert.equal(r.issuer.calls[1]!.body.get('grant_type'), 'refresh_token');
    const renewed = (await r.store.get(cookie.split('=')[1]!))!;
    assert.equal(r.bff[0]!.headers['authorization'], `Bearer ${renewed.accessToken}`);
  });

  test('a session the issuer ended is cleared, and the request carries on anonymously for the BFF to refuse', async () => {
    const r = rig((call, n) =>
      n === 1 ? tokenResponse({ access: fakeJwt({}, r.clock.time + 3_600_000) }) : errorResponse('invalid_grant'),
    );
    const cookie = await loggedIn(r);
    r.clock.advance(59 * MINUTE + 30_000);
    const out = res();

    await r.graphql(req('POST', post(cookie), { body }), out.api);

    assert.match(out.out.headers['set-cookie'] as string, /^bakery-session-web-queue-display=; .*Max-Age=0/);
    assert.equal(r.bff[0]!.headers['authorization'], undefined);
  });

  test('an issuer outage that leaves no usable token is a 503 and the BFF is not called', async () => {
    const r = rig((call, n) => {
      if (n === 1) return tokenResponse({ access: fakeJwt({}, r.clock.time + 3_600_000) });
      throw new Error('ECONNREFUSED');
    });
    const cookie = await loggedIn(r);
    r.clock.advance(61 * MINUTE);
    const out = res();

    await r.graphql(req('POST', post(cookie), { body }), out.api);

    assert.equal(out.out.statusCode, 503);
    assert.equal(r.bff.length, 0);
  });
});
