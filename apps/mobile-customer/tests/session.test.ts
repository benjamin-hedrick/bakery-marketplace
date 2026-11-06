// WI-MOB-003: the app's session logic (src/auth/session.ts) with the Keystore, the browser and fetch replaced by fakes and a fake clock.
// Each case asserts an outcome; the groups are mutated once each (docs/evidence/WI-MOB-003/) to show a green run means something.
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as secure from './fakes/secure-store.ts';
import * as browser from './fakes/web-browser.ts';
import {
  advance,
  fakeFetch,
  form,
  freshApp,
  REFRESH_KEY,
  seedRefreshToken,
  storedRefreshToken,
  tokenCalls,
  tokens,
} from './helpers.ts';

const REDIRECT = 'com.bakerymarketplace.mobile:/auth/callback';
const HOUR = 60 * 60 * 1000;
let app: Awaited<ReturnType<typeof freshApp>>;
const realFetch = globalThis.fetch;

beforeEach(async () => {
  app = await freshApp();
});
afterEach(() => {
  globalThis.fetch = realFetch;
  mock.timers.reset();
  mock.restoreAll();
});

const deletes = () => secure.calls.filter((c) => c.op === 'delete');
const sets = () => secure.calls.filter((c) => c.op === 'set');

describe('renewing the access token', () => {
  test('a valid access token is used as it is; one about to end is renewed first', async () => {
    seedRefreshToken('refresh-1');
    let n = 0;
    const calls = fakeFetch(() => tokens(`access-${++n}`, { refresh_token: `refresh-${n + 1}` }));
    await app.session.restoreSession(); // the start-up refresh: access-1, an hour
    assert.equal(await app.session.currentAccessToken(), 'access-1');
    advance(HOUR - 31_000); // 31 s left: outside the 30 s margin
    assert.equal(await app.session.currentAccessToken(), 'access-1');
    assert.equal(tokenCalls(calls).length, 1, 'no renewal while the token is valid');
    advance(2_000); // 29 s left: inside the margin
    assert.equal(await app.session.currentAccessToken(), 'access-2');
    assert.equal(tokenCalls(calls).length, 2);
    assert.deepEqual(form(tokenCalls(calls)[1]!), {
      grant_type: 'refresh_token',
      refresh_token: 'refresh-2',
      client_id: 'bakery-mobile',
    });
  });

  test('several requests at once cause one renewal', async () => {
    seedRefreshToken();
    fakeFetch(() => tokens('access-1', { refresh_token: 'refresh-2' }));
    await app.session.restoreSession();
    advance(HOUR); // expired
    const calls = fakeFetch(async () => {
      await new Promise<void>((r) => setImmediate(() => r())); // the answer is slow, so the others arrive meanwhile
      return tokens('access-2', { refresh_token: 'refresh-3' });
    });
    const got = await Promise.all(Array.from({ length: 6 }, () => app.session.currentAccessToken()));
    assert.deepEqual(got, Array(6).fill('access-2'));
    assert.equal(tokenCalls(calls).length, 1);
  });

  test('a rotated refresh token is stored; when the answer carries none the old one stays', async () => {
    seedRefreshToken('refresh-1');
    fakeFetch(() => tokens('access-1', { refresh_token: 'refresh-2' }));
    await app.session.restoreSession();
    assert.equal(storedRefreshToken(), 'refresh-2');
    advance(HOUR);
    fakeFetch(() => tokens('access-2')); // no refresh_token in the answer
    await app.session.currentAccessToken();
    assert.equal(storedRefreshToken(), 'refresh-2');
  });
});

describe('the issuer refuses the refresh token', () => {
  test('a 400 ends the session: the stored token is deleted and there is no access token', async () => {
    seedRefreshToken();
    fakeFetch(() => ({ status: 400, json: { error: 'invalid_grant' } }));
    await app.session.restoreSession();
    assert.equal(storedRefreshToken(), undefined);
    assert.deepEqual(
      deletes().map((c) => c.key),
      [REFRESH_KEY],
    );
    assert.equal(await app.session.currentAccessToken(), null);
  });

  test('a refusal in mid-session ends it the same way', async () => {
    seedRefreshToken();
    fakeFetch(() => tokens('access-1', { refresh_token: 'refresh-2' }));
    await app.session.restoreSession();
    advance(HOUR);
    fakeFetch(() => ({ status: 400, json: { error: 'invalid_grant' } }));
    assert.equal(await app.session.currentAccessToken(), null);
    assert.equal(storedRefreshToken(), undefined);
  });

  test('no stored token: signed out, and the issuer is not asked', async () => {
    const calls = fakeFetch(() => tokens('never'));
    await app.session.restoreSession();
    assert.equal(await app.session.currentAccessToken(), null);
    assert.equal(calls.length, 0);
  });
});

describe('the issuer cannot be reached', () => {
  test('at start-up: no session (the login screen) and the token is kept', async () => {
    seedRefreshToken();
    fakeFetch(() => new TypeError('Network request failed'));
    await app.session.restoreSession();
    assert.equal(storedRefreshToken(), 'refresh-1');
    assert.equal(deletes().length, 0);
    assert.equal(await app.session.currentAccessToken(), null);
  });

  test('in mid-session: the token is kept, and the next attempt with the issuer back works without a login', async () => {
    seedRefreshToken();
    fakeFetch(() => tokens('access-1', { refresh_token: 'refresh-2' }));
    await app.session.restoreSession();
    advance(HOUR);
    fakeFetch(() => new TypeError('Network request failed'));
    assert.equal(await app.session.currentAccessToken(), null); // nothing to send for now
    assert.equal(storedRefreshToken(), 'refresh-2');
    assert.equal(deletes().length, 0);
    fakeFetch(() => tokens('access-3', { refresh_token: 'refresh-3' }));
    assert.equal(await app.session.currentAccessToken(), 'access-3');
  });

  // Register 151: session.ts treats every non-2xx answer as a refusal, so a 5xx from the issuer deletes the stored refresh token. The spec (and
  // the web session) call a 5xx an outage. Marked todo: the test states the required behaviour and fails until the lead decides on the change.
  test(
    'an issuer 5xx is an outage, not a refusal: the token is kept',
    { todo: 'register 151: a 5xx deletes the refresh token' },
    async () => {
      seedRefreshToken();
      fakeFetch(() => ({ status: 503, json: {} }));
      await app.session.restoreSession();
      assert.equal(storedRefreshToken(), 'refresh-1');
    },
  );
});

describe('the login callback', () => {
  const callback = (params: Record<string, string>) => `${REDIRECT}?${new URLSearchParams(params)}`;
  const authorize = (url: string) => new URL(url).searchParams;
  const assertNoSession = async (calls: unknown[]) => {
    assert.equal(storedRefreshToken(), undefined);
    assert.equal(sets().length, 0);
    assert.equal(calls.length, 0, 'no code exchange was attempted');
    assert.equal(await app.session.currentAccessToken(), null);
  };

  test('a good return signs in: PKCE S256 with a matching verifier, and only the refresh token is stored', async () => {
    const spies = [
      mock.method(console, 'log'),
      mock.method(console, 'warn'),
      mock.method(console, 'error'),
      mock.method(console, 'info'),
    ];
    browser.setResponder((url) => ({
      type: 'success',
      url: callback({ code: 'the-code', state: authorize(url).get('state')! }),
    }));
    const calls = fakeFetch(() => tokens('access-secret', { refresh_token: 'refresh-secret', id_token: 'id-secret' }));
    assert.equal(await app.session.signIn(), 'ok');

    const q = authorize(browser.opened[0]!);
    assert.equal(q.get('code_challenge_method'), 'S256');
    assert.equal(q.get('response_type'), 'code');
    assert.equal(q.get('redirect_uri'), REDIRECT);
    assert.ok((q.get('state') ?? '').length >= 16);
    const exchange = form(tokenCalls(calls)[0]!);
    assert.equal(exchange.grant_type, 'authorization_code');
    assert.equal(exchange.code, 'the-code');
    const hash = createHash('sha256')
      .update(exchange.code_verifier!)
      .digest('base64')
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '');
    assert.equal(q.get('code_challenge'), hash, 'the challenge is the hash of the verifier that was sent');

    assert.deepEqual(sets(), [{ op: 'set', key: REFRESH_KEY, value: 'refresh-secret' }]);
    for (const spy of spies) assert.equal(spy.mock.callCount(), 0, 'nothing is logged');
    assert.equal(await app.session.currentAccessToken(), 'access-secret');
  });

  test('a wrong state makes no session', async () => {
    browser.setResponder(() => ({ type: 'success', url: callback({ code: 'c', state: 'not-the-state' }) }));
    const calls = fakeFetch(() => tokens('x', { refresh_token: 'y' }));
    assert.equal(await app.session.signIn(), 'failed');
    await assertNoSession(calls);
  });

  test('a missing state makes no session', async () => {
    browser.setResponder(() => ({ type: 'success', url: callback({ code: 'c' }) }));
    const calls = fakeFetch(() => tokens('x', { refresh_token: 'y' }));
    assert.equal(await app.session.signIn(), 'failed');
    await assertNoSession(calls);
  });

  test('no code makes no session', async () => {
    browser.setResponder((url) => ({
      type: 'success',
      url: callback({ state: authorize(url).get('state')!, error: 'access_denied' }),
    }));
    const calls = fakeFetch(() => tokens('x', { refresh_token: 'y' }));
    assert.equal(await app.session.signIn(), 'failed');
    await assertNoSession(calls);
  });

  test('a cancelled or dismissed browser makes no session', async () => {
    const calls = fakeFetch(() => tokens('x', { refresh_token: 'y' }));
    for (const type of ['cancel', 'dismiss'] as const) {
      browser.setResponder(() => ({ type }));
      assert.equal(await app.session.signIn(), 'cancelled');
    }
    await assertNoSession(calls);
  });

  test('a refused code exchange makes no session and stores nothing', async () => {
    browser.setResponder((url) => ({
      type: 'success',
      url: callback({ code: 'bad', state: authorize(url).get('state')! }),
    }));
    fakeFetch(() => ({ status: 400, json: { error: 'invalid_grant' } }));
    assert.equal(await app.session.signIn(), 'failed');
    assert.equal(storedRefreshToken(), undefined);
    assert.equal(sets().length, 0);
    assert.equal(await app.session.currentAccessToken(), null);
  });

  test('sign-out deletes the stored token and the access token', async () => {
    seedRefreshToken();
    fakeFetch(() => tokens('access-1', { refresh_token: 'refresh-2' }));
    await app.session.restoreSession();
    await app.session.signOut();
    assert.equal(storedRefreshToken(), undefined);
    assert.equal(await app.session.currentAccessToken(), null);
  });
});
