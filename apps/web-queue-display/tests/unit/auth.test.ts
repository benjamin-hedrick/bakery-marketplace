import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { challengeFor, randomUrlSafe } from '../../src/lib/auth/pkce.ts';
import { parseClaims } from '../../src/lib/auth/claims.ts';
import { createSessionStore } from '../../src/lib/auth/session.ts';
import { safeReturnTo } from '../../src/lib/auth/return-to.ts';
import { buildAuthorizeUrl, completeLogin, LoginError, type LoginDeps } from '../../src/lib/auth/login.ts';

// ---- helpers --------------------------------------------------------------------------------------------------------------

const b64url = (v: unknown) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const NOW = 1_800_000_000_000; // ms
function jwt(claims: Record<string, unknown>) {
  return `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url(claims)}.${b64url('signature')}`;
}
const goodClaims = (over: Record<string, unknown> = {}) => ({
  sub: 'user-customer-1',
  name: 'Alice Customer',
  email: 'alice@customer.local',
  roles: 'Customer',
  exp: Math.floor(NOW / 1000) + 3600,
  ...over,
});

class MemoryStorage {
  readonly data = new Map<string, string>();
  readonly writes: [string, string][] = [];
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.writes.push([k, v]);
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

function fakeScheduler() {
  const pending: { id: number; at: number; fn: () => void }[] = [];
  let next = 1;
  return {
    pending,
    schedule: (fn: () => void, ms: number) => {
      const id = next++;
      pending.push({ id, at: ms, fn });
      return id;
    },
    cancel: (id: unknown) => {
      const i = pending.findIndex((p) => p.id === id);
      if (i >= 0) pending.splice(i, 1);
    },
  };
}

function deps(over: Partial<LoginDeps> = {}) {
  const storage = new MemoryStorage();
  const sched = fakeScheduler();
  const clock = { now: NOW };
  const session = createSessionStore({ now: () => clock.now, schedule: sched.schedule, cancel: sched.cancel });
  const calls: { url: string; init: RequestInit }[] = [];
  let n = 0;
  const base: LoginDeps = {
    storage,
    session,
    now: () => clock.now,
    random: () => `random-${++n}-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`,
    challenge: challengeFor, // the real S256, so the URL really does not contain the verifier
    config: {
      authorizeUrl: 'http://issuer.test/authorize',
      tokenUrl: 'http://issuer.test/token',
      clientId: 'web-queue-display',
      redirectUri: 'http://app.test/auth/callback',
    },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ access_token: jwt(goodClaims()), token_type: 'Bearer', expires_in: 3600 }), {
        status: 200,
      });
    },
    ...over,
  };
  return { d: base, storage, session, calls, clock, sched };
}

const pendingKey = 'bakery.auth.pending';

// ---- PKCE -----------------------------------------------------------------------------------------------------------------

describe('PKCE', () => {
  test('the S256 challenge matches the RFC 7636 appendix B example', async () => {
    assert.equal(
      await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  test('random strings are url-safe, long enough for a verifier, and different every time', () => {
    const a = randomUrlSafe();
    const b = randomUrlSafe();
    assert.match(a, /^[A-Za-z0-9_-]{43,128}$/);
    assert.notEqual(a, b);
  });
});

// ---- claims ---------------------------------------------------------------------------------------------------------------

describe('parseClaims (display only; services validate the token)', () => {
  test('reads subject, name, email, roles and expiry in milliseconds', () => {
    assert.deepEqual(parseClaims(jwt(goodClaims())), {
      subject: 'user-customer-1',
      name: 'Alice Customer',
      email: 'alice@customer.local',
      roles: ['Customer'],
      expiresAt: (Math.floor(NOW / 1000) + 3600) * 1000,
    });
  });

  test('roles may be a single value or a list; a missing name is undefined', () => {
    assert.deepEqual(parseClaims(jwt(goodClaims({ roles: ['Customer', 'Vendor'], name: undefined })))?.roles, [
      'Customer',
      'Vendor',
    ]);
    assert.equal(parseClaims(jwt(goodClaims({ name: undefined })))?.name, undefined);
  });

  test('anything that is not a three-part token with a subject and an expiry is null', () => {
    for (const bad of [
      '',
      'abc',
      'a.b',
      'a.b.c.d',
      'a.!!!.c',
      `x.${b64url('not json')}.y`,
      jwt({ exp: 1 }),
      jwt({ sub: 's' }),
      jwt({ sub: 's', exp: 'soon' }),
      jwt({ sub: '', exp: 1 }),
    ]) {
      assert.equal(parseClaims(bad), null, bad);
    }
  });
});

// ---- returnTo -------------------------------------------------------------------------------------------------------------

describe('safeReturnTo: only a path inside this app', () => {
  test('keeps same-origin paths with their query', () => {
    assert.equal(safeReturnTo('/listings/abc'), '/listings/abc');
    assert.equal(safeReturnTo('/listings/abc?x=1#top'), '/listings/abc?x=1#top');
  });

  test('anything else is the home page', () => {
    for (const bad of [
      undefined,
      null,
      '',
      '/',
      'listings',
      '//evil.example',
      '/\\evil.example',
      'https://evil.example',
      'javascript:alert(1)',
      '/auth/callback',
      '/auth/callback?code=1',
      '\t//evil.example',
      42,
    ]) {
      assert.equal(safeReturnTo(bad), '/', String(bad));
    }
  });
});

// ---- the in-memory session ------------------------------------------------------------------------------------------------

describe('session store', () => {
  test('holds the token in memory and shows subscribers only the claims', () => {
    const { session } = deps();
    const seen: unknown[] = [];
    session.subscribe(() => seen.push(session.getClaims()));

    session.set(jwt(goodClaims()));

    assert.equal(session.getAccessToken(), jwt(goodClaims()));
    assert.equal(session.getClaims()?.name, 'Alice Customer');
    assert.equal(seen.length, 1);
    assert.doesNotMatch(JSON.stringify(session.getClaims()), /signature/);
  });

  test('clear removes it and tells subscribers; an unsubscribed listener hears nothing', () => {
    const { session } = deps();
    let heard = 0;
    const off = session.subscribe(() => heard++);
    session.set(jwt(goodClaims()));
    off();
    session.clear();
    assert.equal(session.getAccessToken(), null);
    assert.equal(session.getClaims(), null);
    assert.equal(heard, 1);
  });

  test('an expired token is not stored, and a stored one stops being returned when it expires', () => {
    const { session, clock } = deps();
    assert.throws(() => session.set(jwt(goodClaims({ exp: Math.floor(NOW / 1000) - 1 }))));
    assert.equal(session.getAccessToken(), null);

    session.set(jwt(goodClaims()));
    clock.now += 3600_000;
    assert.equal(session.getAccessToken(), null);
    assert.equal(session.getClaims(), null);
  });

  test('a token that is nearly expired counts as expired, so a request is not sent with one that dies in flight', () => {
    const { session, clock } = deps();
    session.set(jwt(goodClaims()));
    clock.now += 3600_000 - 20_000; // 20 s left, inside the 30 s skew
    assert.equal(session.getAccessToken(), null);
  });

  test('a timer clears the session at expiry so the page can show it, and a new login replaces the timer', () => {
    const { session, sched } = deps();
    session.set(jwt(goodClaims()));
    assert.equal(sched.pending.length, 1);
    const first = sched.pending[0]!;
    assert.equal(first.at, 3600_000 - 30_000);

    session.set(jwt(goodClaims({ sub: 'someone-else' })));
    assert.equal(sched.pending.length, 1); // the old timer was cancelled
    session.clear();
    assert.equal(sched.pending.length, 0);
  });

  test('a malformed token is rejected and leaves any current session alone', () => {
    const { session } = deps();
    session.set(jwt(goodClaims()));
    assert.throws(() => session.set('not-a-token'));
    assert.equal(session.getClaims()?.subject, 'user-customer-1');
  });
});

// ---- starting a login -----------------------------------------------------------------------------------------------------

describe('buildAuthorizeUrl', () => {
  test('is a code + S256 request carrying a state, with the verifier kept only in session storage', async () => {
    const { d, storage } = deps();

    const url = new URL(await buildAuthorizeUrl('/listings/abc', d));

    assert.equal(url.origin + url.pathname, 'http://issuer.test/authorize');
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.equal(url.searchParams.get('client_id'), 'web-queue-display');
    assert.equal(url.searchParams.get('redirect_uri'), 'http://app.test/auth/callback');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    const pending = JSON.parse(storage.getItem(pendingKey)!);
    assert.equal(url.searchParams.get('code_challenge'), await challengeFor(pending.verifier));
    assert.equal(url.searchParams.get('state'), pending.state);
    assert.notEqual(pending.state, pending.verifier);
    assert.equal(pending.returnTo, '/listings/abc');
    assert.doesNotMatch(url.toString(), new RegExp(pending.verifier)); // the verifier never travels in the URL
  });

  test('an unsafe returnTo is replaced by the home page', async () => {
    const { d, storage } = deps();
    await buildAuthorizeUrl('//evil.example', d);
    assert.equal(JSON.parse(storage.getItem(pendingKey)!).returnTo, '/');
  });

  test('every attempt gets its own state and verifier', async () => {
    const { d, storage } = deps();
    await buildAuthorizeUrl('/', d);
    const first = JSON.parse(storage.getItem(pendingKey)!);
    await buildAuthorizeUrl('/', d);
    const second = JSON.parse(storage.getItem(pendingKey)!);
    assert.notEqual(first.state, second.state);
    assert.notEqual(first.verifier, second.verifier);
  });
});

// ---- finishing a login ----------------------------------------------------------------------------------------------------

async function started(over: Partial<LoginDeps> = {}) {
  const ctx = deps(over);
  const url = new URL(await buildAuthorizeUrl('/listings/abc', ctx.d));
  const state = url.searchParams.get('state')!;
  const params = (extra: Record<string, string> = {}) => new URLSearchParams({ code: 'code-1', state, ...extra });
  return { ...ctx, state, params };
}

async function failsWith(promise: Promise<unknown>, code: string) {
  await assert.rejects(
    promise,
    (e: unknown) => e instanceof LoginError && e.code === code,
    `expected LoginError ${code}`,
  );
}

describe('completeLogin', () => {
  test('exchanges the code with the verifier, stores the session in memory and returns where to go', async () => {
    const { d, params, calls, session, storage } = await started();
    const verifier = JSON.parse(storage.getItem(pendingKey)!).verifier;

    const result = await completeLogin(params(), d);

    assert.deepEqual(result, { returnTo: '/listings/abc' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, 'http://issuer.test/token');
    assert.equal(calls[0]!.init.method, 'POST');
    const body = new URLSearchParams(String(calls[0]!.init.body));
    assert.equal(body.get('grant_type'), 'authorization_code');
    assert.equal(body.get('code'), 'code-1');
    assert.equal(body.get('redirect_uri'), 'http://app.test/auth/callback');
    assert.equal(body.get('code_verifier'), verifier);
    assert.equal(body.get('client_id'), 'web-queue-display');
    assert.equal(session.getClaims()?.name, 'Alice Customer');
    assert.equal(storage.getItem(pendingKey), null); // one use only
  });

  test('the token is never written to any storage', async () => {
    const { d, params, storage } = await started();
    await completeLogin(params(), d);
    assert.deepEqual(
      storage.writes.map(([k]) => k),
      [pendingKey],
    ); // only the pending login, written before the redirect
    assert.doesNotMatch(JSON.stringify([...storage.data]), /signature/);
  });

  test('a callback whose state is not ours is refused before any request, and the pending login is spent', async () => {
    const { d, params, calls, storage, session } = await started();
    await failsWith(completeLogin(params({ state: 'forged' }), d), 'state_mismatch');
    assert.equal(calls.length, 0);
    assert.equal(storage.getItem(pendingKey), null);
    assert.equal(session.getAccessToken(), null);
  });

  test('a callback with no state, or no pending login, is refused', async () => {
    const { d, params, calls } = await started();
    await failsWith(completeLogin(new URLSearchParams({ code: 'code-1' }), d), 'state_mismatch');
    const fresh = deps();
    await failsWith(completeLogin(params(), fresh.d), 'no_pending');
    assert.equal(calls.length + fresh.calls.length, 0);
  });

  test('the same callback cannot be used twice', async () => {
    const { d, params, calls } = await started();
    await completeLogin(params(), d);
    await failsWith(completeLogin(params(), d), 'no_pending');
    assert.equal(calls.length, 1);
  });

  test('a login that sat for more than ten minutes is expired', async () => {
    const { d, params, clock, calls } = await started();
    clock.now += 10 * 60_000 + 1;
    await failsWith(completeLogin(params(), d), 'expired');
    assert.equal(calls.length, 0);
  });

  test('an error from the issuer, or a missing code, is a failure without an exchange', async () => {
    const a = await started();
    await failsWith(
      completeLogin(new URLSearchParams({ error: 'access_denied', state: a.state }), a.d),
      'issuer_error',
    );
    const b = await started();
    await failsWith(completeLogin(new URLSearchParams({ state: b.state }), b.d), 'missing_code');
    assert.equal(a.calls.length + b.calls.length, 0);
  });

  test('a refused exchange, a network failure, and a response that is not a usable token all leave the user logged out', async () => {
    const cases: [string, LoginDeps['fetch']][] = [
      ['exchange_failed', async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })],
      [
        'exchange_failed',
        async () => {
          throw new TypeError('network down');
        },
      ],
      ['bad_token', async () => new Response(JSON.stringify({ access_token: 'not-a-jwt' }), { status: 200 })],
      ['bad_token', async () => new Response('<html>', { status: 200 })],
      [
        'bad_token',
        async () => new Response(JSON.stringify({ access_token: jwt(goodClaims({ exp: 1 })) }), { status: 200 }),
      ],
    ];
    for (const [code, fetch] of cases) {
      const { d, params, session } = await started({ fetch });
      await failsWith(completeLogin(params(), d), code);
      assert.equal(session.getAccessToken(), null);
    }
  });

  test("an error carries a code and a fixed message, never the issuer's text or the token", async () => {
    const { d, params } = await started({
      fetch: async () =>
        new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'SECRET internal detail' }), {
          status: 400,
        }),
    });
    await assert.rejects(completeLogin(params(), d), (e: unknown) => {
      assert.ok(e instanceof LoginError);
      assert.doesNotMatch(e.message, /SECRET/);
      return true;
    });
  });
});
