import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { challengeFor } from '../src/pkce.ts';
import { LoginError, createSessionService } from '../src/service.ts';
import { createMemoryStore, newMemoryBacking } from '../src/store.ts';
import { ManualClock, errorResponse, fakeIssuer, fakeJwt, newSealer, testConfig, tokenResponse } from './helpers.ts';
import type { Call } from './helpers.ts';
import type { Sealer } from '../src/crypto.ts';

const MINUTE = 60_000;

function setup(answer?: (call: Call, n: number) => Response | Promise<Response>) {
  const clock = new ManualClock();
  const sealer = newSealer();
  const backing = newMemoryBacking();
  const store = createMemoryStore(sealer, clock.now, backing);
  const issuer = fakeIssuer(answer ?? (() => tokenResponse({ access: fakeJwt({}, clock.time + 3_600_000) })));
  const events: string[] = [];
  const config = testConfig();
  const make = (extra: Partial<Parameters<typeof createSessionService>[0]> = {}) =>
    createSessionService({ config, store, fetch: issuer.fetchImpl, clock, log: (e) => events.push(e), ...extra });
  return { clock, sealer, backing, store, issuer, events, config, service: make(), make };
}

/** The value of a cookie from a Set-Cookie line. */
const valueOf = (setCookie: string) => setCookie.split(';')[0]!.split('=')[1]!;
const cookieHeader = (name: string, value: string) => `${name}=${value}`;

async function login(s: ReturnType<typeof setup>, returnTo = '/') {
  const start = await s.service.startLogin(returnTo);
  const state = new URL(start.location).searchParams.get('state')!;
  const done = await s.service.finishLogin(
    new URLSearchParams({ code: 'code-1', state }),
    cookieHeader(s.config.loginCookieName, valueOf(start.setCookies[0]!)),
  );
  return { start, state, done, sessionId: valueOf(done.setCookies[0]!) };
}

describe('starting a login', () => {
  test('sends the browser to the issuer with PKCE and keeps the verifier on the server', async () => {
    const s = setup();

    const start = await s.service.startLogin('/orders/1');
    const url = new URL(start.location);

    assert.equal(url.origin + url.pathname, 'http://localhost:5100/authorize');
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.equal(url.searchParams.get('client_id'), 'web-queue-display');
    assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:3100/api/auth/callback');
    assert.equal(url.searchParams.get('scope'), 'openid offline_access');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.match(url.searchParams.get('state')!, /^[A-Za-z0-9_-]{16,}$/);
    assert.ok(!start.location.includes('verifier'));
  });

  test('the browser gets only the id of a pending record, in a short-lived HttpOnly cookie', async () => {
    const s = setup();

    const start = await s.service.startLogin('/');

    assert.equal(start.setCookies.length, 1);
    assert.match(
      start.setCookies[0]!,
      /^bakery-login-web-queue-display=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=600$/,
    );
    assert.ok(!start.setCookies[0]!.includes(new URL(start.location).searchParams.get('state')!));
  });
});

describe('finishing a login', () => {
  test('exchanges the code from the server with the verifier, no secret, and makes a session', async () => {
    const s = setup();

    const { start, done, sessionId } = await login(s, '/orders/1');

    assert.equal(s.issuer.calls.length, 1);
    const body = s.issuer.calls[0]!.body;
    assert.equal(s.issuer.calls[0]!.url, 'http://localhost:5100/token');
    assert.equal(body.get('grant_type'), 'authorization_code');
    assert.equal(body.get('code'), 'code-1');
    assert.equal(body.get('redirect_uri'), 'http://localhost:3100/api/auth/callback');
    assert.equal(body.get('client_id'), 'web-queue-display');
    assert.equal(body.get('client_secret'), null); // a public client
    assert.equal(
      await challengeFor(body.get('code_verifier')!),
      new URL(start.location).searchParams.get('code_challenge'),
    );
    assert.equal(done.returnTo, '/orders/1');
    assert.match(
      done.setCookies[0]!,
      new RegExp(
        `^bakery-session-web-queue-display=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}$`,
      ),
    );
    assert.match(done.setCookies[1]!, /^bakery-login-web-queue-display=; .*Max-Age=0/);
    const record = await s.store.get(sessionId);
    assert.equal(record?.subject, 'vendor-shop-001');
    assert.deepEqual(record?.roles, ['Vendor']);
    assert.equal(record?.refreshToken, 'refresh-1');
  });

  test('every login gets a new session id, so nothing from before is carried into it', async () => {
    const s = setup();

    const first = await login(s);
    const second = await login(s);

    assert.notEqual(first.sessionId, second.sessionId);
    assert.match(first.sessionId, /^[A-Za-z0-9_-]{43}$/);
  });

  test('an unsafe return address becomes the home page', async () => {
    const s = setup();

    assert.equal((await login(s, 'https://evil.example/')).done.returnTo, '/');
    assert.equal((await login(s, '//evil.example')).done.returnTo, '/');
  });

  const fails = async (
    s: ReturnType<typeof setup>,
    query: Record<string, string>,
    cookie: string | undefined,
    code: string,
  ) => {
    await assert.rejects(
      s.service.finishLogin(new URLSearchParams(query), cookie),
      (e: unknown) => e instanceof LoginError && e.code === code && !/token|secret|verifier/i.test(e.message),
      code,
    );
  };

  test('refuses a callback with no login in progress, a wrong state, an error, or no code', async () => {
    const s = setup();
    await fails(s, { code: 'c', state: 's' }, undefined, 'no_pending');
    await fails(s, { code: 'c', state: 's' }, cookieHeader('bakery-login-web-queue-display', 'unknown'), 'no_pending');

    const a = await s.service.startLogin('/');
    await fails(
      s,
      { code: 'c', state: 'wrong' },
      cookieHeader('bakery-login-web-queue-display', valueOf(a.setCookies[0]!)),
      'state_mismatch',
    );

    const b = await s.service.startLogin('/');
    const stateB = new URL(b.location).searchParams.get('state')!;
    await fails(
      s,
      { error: 'access_denied', state: stateB },
      cookieHeader('bakery-login-web-queue-display', valueOf(b.setCookies[0]!)),
      'issuer_error',
    );

    const c = await s.service.startLogin('/');
    const stateC = new URL(c.location).searchParams.get('state')!;
    await fails(
      s,
      { state: stateC },
      cookieHeader('bakery-login-web-queue-display', valueOf(c.setCookies[0]!)),
      'missing_code',
    );
    assert.equal(s.issuer.calls.length, 0); // none of them reached the issuer
  });

  test('a callback can be used once: replaying it finds nothing', async () => {
    const s = setup();
    const start = await s.service.startLogin('/');
    const state = new URL(start.location).searchParams.get('state')!;
    const cookie = cookieHeader('bakery-login-web-queue-display', valueOf(start.setCookies[0]!));
    await s.service.finishLogin(new URLSearchParams({ code: 'c', state }), cookie);

    await fails(s, { code: 'c', state }, cookie, 'no_pending');
    assert.equal(s.issuer.calls.length, 1);
  });

  test('a login that takes too long is refused', async () => {
    const s = setup();
    const start = await s.service.startLogin('/');
    const state = new URL(start.location).searchParams.get('state')!;
    s.clock.advance(11 * MINUTE);

    // the pending record has expired in the store, so it is simply not found
    await fails(
      s,
      { code: 'c', state },
      cookieHeader('bakery-login-web-queue-display', valueOf(start.setCookies[0]!)),
      'no_pending',
    );
  });

  test('a code the issuer refuses, or a token that cannot be read, makes no session', async () => {
    const refused = setup(() => errorResponse('invalid_grant'));
    const start = await refused.service.startLogin('/');
    await fails(
      refused,
      { code: 'c', state: new URL(start.location).searchParams.get('state')! },
      cookieHeader('bakery-login-web-queue-display', valueOf(start.setCookies[0]!)),
      'exchange_failed',
    );

    const unreadable = setup(() => tokenResponse({ access: 'not-a-jwt' }));
    const start2 = await unreadable.service.startLogin('/');
    await fails(
      unreadable,
      { code: 'c', state: new URL(start2.location).searchParams.get('state')! },
      cookieHeader('bakery-login-web-queue-display', valueOf(start2.setCookies[0]!)),
      'bad_token',
    );
  });

  test('the issuer being down is the same fixed message, and nothing it said is logged', async () => {
    const s = setup(() => {
      throw new Error('connect ECONNREFUSED 10.0.0.5:5100 with secret-detail');
    });
    const start = await s.service.startLogin('/');

    await fails(
      s,
      { code: 'c', state: new URL(start.location).searchParams.get('state')! },
      cookieHeader('bakery-login-web-queue-display', valueOf(start.setCookies[0]!)),
      'exchange_failed',
    );

    assert.ok(
      s.events.every((e) => !/secret-detail|10\.0\.0\.5|refresh-1/.test(e)),
      s.events.join('|'),
    );
  });
});

describe('the session for a request', () => {
  test('is found by its cookie and shows who it is without a token', async () => {
    const s = setup();
    const { sessionId } = await login(s);

    const found = await s.service.resolve(cookieHeader('bakery-session-web-queue-display', sessionId));

    assert.ok(found);
    const view = s.service.view(found.record);
    assert.deepEqual(Object.keys(view).sort(), ['email', 'name', 'roles', 'sessionExpiresAt', 'subject']);
    assert.equal(view.name, 'Corner Bakery (owner)');
    assert.ok(!JSON.stringify(view).includes('refresh'));
  });

  test('is null for no cookie, an unknown id, or a session the store cannot open', async () => {
    const s = setup();
    const { sessionId } = await login(s);

    assert.equal(await s.service.resolve(undefined), null);
    assert.equal(await s.service.resolve(cookieHeader('bakery-session-web-queue-display', 'unknown')), null);
    const otherKey = createSessionService({
      config: s.config,
      store: createMemoryStore(newSealer() as Sealer, s.clock.now, s.backing),
      clock: s.clock,
    });
    assert.equal(await otherKey.resolve(cookieHeader('bakery-session-web-queue-display', sessionId)), null);
  });

  test('ends after the idle timeout, and using it before then pushes the timeout back', async () => {
    const s = setup();
    const { sessionId } = await login(s);
    const cookie = cookieHeader('bakery-session-web-queue-display', sessionId);

    s.clock.advance(11 * 60 * MINUTE);
    assert.ok(await s.service.resolve(cookie)); // 11 hours idle: still there, and now it has been used
    s.clock.advance(11 * 60 * MINUTE);
    assert.ok(await s.service.resolve(cookie)); // 11 hours since that use
    s.clock.advance(12 * 60 * MINUTE + 1);

    assert.equal(await s.service.resolve(cookie), null); // 12 hours idle
    assert.equal(await s.store.get(sessionId), null); // and it was deleted, not just ignored
  });

  test('ends at the absolute lifetime however busy it is', async () => {
    const s = setup();
    const { sessionId } = await login(s);
    const cookie = cookieHeader('bakery-session-web-queue-display', sessionId);

    for (let step = 1; step <= 20; step++) {
      s.clock.advance(8 * 60 * MINUTE); // used every 8 hours: never idle for 12
      assert.ok(await s.service.resolve(cookie), `after ${step * 8} hours`);
    }
    s.clock.advance(8 * 60 * MINUTE + MINUTE); // 7 days and a minute since the login

    assert.equal(await s.service.resolve(cookie), null);
  });

  test('logging out ends it on the server and clears the cookie, so the old cookie opens nothing', async () => {
    const s = setup();
    const { sessionId } = await login(s);
    const cookie = cookieHeader('bakery-session-web-queue-display', sessionId);

    const cleared = await s.service.logout(cookie);

    assert.match(cleared, /^bakery-session-web-queue-display=; .*Max-Age=0/);
    assert.equal(await s.service.resolve(cookie), null);
    assert.match(await s.service.logout(undefined), /Max-Age=0/); // logging out with no session is not an error
  });

  test('every session of a person can be ended from outside', async () => {
    const s = setup();
    const a = await login(s);
    const b = await login(s);

    assert.equal(await s.service.endSessionsOf('vendor-shop-001'), 2);
    assert.equal(await s.service.resolve(cookieHeader('bakery-session-web-queue-display', a.sessionId)), null);
    assert.equal(await s.service.resolve(cookieHeader('bakery-session-web-queue-display', b.sessionId)), null);
  });
});

describe('renewing the access token', () => {
  const fresh = (s: ReturnType<typeof setup>, n: number) =>
    tokenResponse({ access: fakeJwt({}, s.clock.time + 3_600_000), refresh: `refresh-${n}` });

  async function nearExpiry(s: ReturnType<typeof setup>) {
    const { sessionId } = await login(s);
    s.clock.advance(59 * MINUTE + 30_000); // 30 seconds left: inside the 60 second margin
    const resolved = await s.service.resolve(cookieHeader('bakery-session-web-queue-display', sessionId));
    assert.ok(resolved);
    return { sessionId, resolved };
  }

  test('a token with time left is used as it is, and the issuer is not asked', async () => {
    const s = setup();
    const { sessionId } = await login(s);
    const resolved = (await s.service.resolve(cookieHeader('bakery-session-web-queue-display', sessionId)))!;

    const result = await s.service.bearerFor(resolved);

    assert.equal(result.kind, 'token');
    assert.equal(s.issuer.calls.length, 1); // only the login
  });

  test('a token about to expire is renewed with the refresh token, and the rotated refresh token is stored', async () => {
    const s = setup((call, n) =>
      n === 1 ? tokenResponse({ access: fakeJwt({}, s.clock.time + 3_600_000), refresh: 'refresh-1' }) : fresh(s, n),
    );
    const { sessionId, resolved } = await nearExpiry(s);

    const result = await s.service.bearerFor(resolved);

    assert.equal(result.kind, 'token');
    const renewal = s.issuer.calls[1]!;
    assert.equal(renewal.body.get('grant_type'), 'refresh_token');
    assert.equal(renewal.body.get('refresh_token'), 'refresh-1');
    assert.equal(renewal.body.get('client_id'), 'web-queue-display');
    assert.equal((await s.store.get(sessionId))?.refreshToken, 'refresh-2');

    s.clock.advance(59 * MINUTE + 30_000);
    await s.service.bearerFor((await s.service.resolve(cookieHeader('bakery-session-web-queue-display', sessionId)))!);
    assert.equal(s.issuer.calls[2]!.body.get('refresh_token'), 'refresh-2'); // the next renewal uses the rotated one
  });

  test('many requests at once cause one renewal in this process', async () => {
    const s = setup(async (call, n) => {
      if (n > 1) await new Promise((resolve) => setTimeout(resolve, 50));
      return fresh(s, n);
    });
    const { resolved } = await nearExpiry(s);

    const results = await Promise.all(Array.from({ length: 12 }, () => s.service.bearerFor(resolved)));

    assert.equal(s.issuer.calls.length, 2); // the login and one renewal
    assert.ok(results.every((r) => r.kind === 'token'));
    assert.equal(new Set(results.map((r) => (r.kind === 'token' ? r.token : ''))).size, 1);
  });

  test('two instances sharing a store cause one renewal between them', async () => {
    const s = setup(async (call, n) => {
      if (n > 1) await new Promise((resolve) => setTimeout(resolve, 200));
      return fresh(s, n);
    });
    const other = s.make();
    const { resolved } = await nearExpiry(s);

    const [a, b] = await Promise.all([s.service.bearerFor(resolved), other.bearerFor(resolved)]);

    assert.equal(s.issuer.calls.length, 2, 'the refresh token was used more than once');
    assert.equal(a.kind, 'token');
    assert.equal(b.kind, 'token');
  });

  test('a refusal ends the session: the issuer says the grant is bad, or rejects the request', async () => {
    for (const refusal of ['invalid_grant', 'invalid_client']) {
      const s = setup((call, n) =>
        n === 1 ? tokenResponse({ access: fakeJwt({}, s.clock.time + 3_600_000) }) : errorResponse(refusal),
      );
      const { sessionId, resolved } = await nearExpiry(s);

      const result = await s.service.bearerFor(resolved);

      assert.equal(result.kind, 'ended', refusal);
      assert.equal(await s.store.get(sessionId), null, refusal);
    }
  });

  test('an issuer that cannot be reached keeps a token that still works, and reports unavailable once it does not', async () => {
    const s = setup((call, n) => {
      if (n === 1) return tokenResponse({ access: fakeJwt({}, s.clock.time + 3_600_000) });
      throw new Error('ECONNREFUSED');
    });
    const { sessionId, resolved } = await nearExpiry(s);

    const stillValid = await s.service.bearerFor(resolved);
    s.clock.advance(MINUTE);
    const expired = await s.service.bearerFor(
      (await s.service.resolve(cookieHeader('bakery-session-web-queue-display', sessionId)))!,
    );

    assert.equal(stillValid.kind, 'token');
    assert.equal(expired.kind, 'unavailable');
    assert.ok(await s.store.get(sessionId), 'a failed renewal because of an outage must not end the session');
  });

  test('a server error from the issuer is treated as an outage, not a refusal', async () => {
    const s = setup((call, n) =>
      n === 1
        ? tokenResponse({ access: fakeJwt({}, s.clock.time + 3_600_000) })
        : new Response('boom', { status: 503 }),
    );
    const { sessionId, resolved } = await nearExpiry(s);

    await s.service.bearerFor(resolved);

    assert.ok(await s.store.get(sessionId));
  });

  test('without a refresh token the session lasts as long as the access token', async () => {
    const s = setup(() => tokenResponse({ access: fakeJwt({}, s.clock.time + 3_600_000), refresh: null }));
    const { sessionId, resolved } = await nearExpiry(s);

    assert.equal((await s.service.bearerFor(resolved)).kind, 'token');
    s.clock.advance(MINUTE);
    const resolvedLate = (await s.service.resolve(cookieHeader('bakery-session-web-queue-display', sessionId)))!;

    assert.equal((await s.service.bearerFor(resolvedLate)).kind, 'ended');
    assert.equal(await s.store.get(sessionId), null);
  });

  test('a renewal that comes back for another person ends the session', async () => {
    const s = setup((call, n) =>
      n === 1
        ? tokenResponse({ access: fakeJwt({}, s.clock.time + 3_600_000) })
        : tokenResponse({ access: fakeJwt({ sub: 'someone-else' }, s.clock.time + 3_600_000) }),
    );
    const { sessionId, resolved } = await nearExpiry(s);

    assert.equal((await s.service.bearerFor(resolved)).kind, 'ended');
    assert.equal(await s.store.get(sessionId), null);
  });

  test('no event logged during any of this contains a token or a session id', async () => {
    const s = setup((call, n) =>
      n === 1
        ? tokenResponse({ access: fakeJwt({}, s.clock.time + 3_600_000), refresh: 'refresh-LOGME' })
        : errorResponse('invalid_grant'),
    );
    const { sessionId, resolved } = await nearExpiry(s);
    await s.service.bearerFor(resolved);

    const logged = s.events.join('\n');
    assert.ok(logged.length > 0);
    assert.ok(!logged.includes('refresh-LOGME') && !logged.includes(sessionId) && !/eyJ/.test(logged), logged);
  });
});
