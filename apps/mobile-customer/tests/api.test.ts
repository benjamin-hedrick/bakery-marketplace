// WI-MOB-003: the BFF client (src/api.ts) with the session behind it: an UNAUTHENTICATED answer is renewed once and retried once, never in a loop.
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fakeFetch,
  freshApp,
  seedRefreshToken,
  storedRefreshToken,
  tokenCalls,
  tokens,
  type Call,
  type Reply,
} from './helpers.ts';

let app: Awaited<ReturnType<typeof freshApp>>;
const realFetch = globalThis.fetch;
const bffCalls = (calls: Call[]) => calls.filter((c) => c.url.endsWith('/graphql'));
const ok: Reply = { status: 200, json: { data: { hello: 'world' } } };
const unauthenticatedByCode: Reply = {
  status: 200,
  json: { errors: [{ message: 'no', extensions: { code: 'UNAUTHENTICATED' } }] },
};
const isUnauthenticated = (e: unknown) => e instanceof app.api.ApiError && e.code === 'UNAUTHENTICATED';

beforeEach(async () => {
  app = await freshApp();
  seedRefreshToken('refresh-1');
});
afterEach(() => {
  globalThis.fetch = realFetch;
  mock.timers.reset();
});

/** Signs in through the start-up refresh (access-1, refresh token rotates to refresh-2); the BFF is answered by `route`. */
const signedIn = async (route: (c: Call) => Reply | Promise<Reply>) => {
  let n = 0;
  const calls = fakeFetch((c) =>
    c.url.endsWith('/token') ? tokens(`access-${++n}`, { refresh_token: `refresh-${n + 1}` }) : route(c),
  );
  await app.session.restoreSession();
  calls.length = 0;
  return calls;
};

describe('an UNAUTHENTICATED answer', () => {
  for (const [name, rejection] of [
    ['HTTP 401', { status: 401, json: {} }],
    ['the GraphQL code', unauthenticatedByCode],
  ] as const) {
    test(`${name} is renewed once and the request retried once`, async () => {
      let bff = 0;
      const calls = await signedIn(() => (++bff === 1 ? rejection : ok));
      assert.deepEqual(await app.api.gql('{ hello }', {}, { authenticated: true }), { hello: 'world' });
      assert.equal(tokenCalls(calls).length, 1, 'one renewal');
      assert.equal(bffCalls(calls).length, 2, 'one retry');
      assert.equal(bffCalls(calls)[0]!.headers.authorization, 'Bearer access-1');
      assert.equal(bffCalls(calls)[1]!.headers.authorization, 'Bearer access-2', 'the retry carries the renewed token');
    });

    // Register 152, option B: the issuer and the BFF disagree about a fresh token, so the session ends (signedOut, refresh token deleted).
    test(`${name} a second time is an error, not a loop, and ends the session`, async () => {
      const calls = await signedIn(() => rejection);
      await assert.rejects(() => app.api.gql('{ hello }', {}, { authenticated: true }), isUnauthenticated);
      assert.equal(tokenCalls(calls).length, 1);
      assert.equal(bffCalls(calls).length, 2);
      assert.equal(storedRefreshToken(), undefined, 'the refresh token is deleted');
      assert.equal(await app.session.currentAccessToken(), null, 'no session is left');
      assert.equal(tokenCalls(calls).length, 1, 'and nothing asks the issuer again');
    });
  }

  test('when the issuer refuses the renewal the customer is signed out and the request is not retried', async () => {
    await signedIn(() => ({ status: 401, json: {} }));
    const calls = fakeFetch((c) =>
      c.url.endsWith('/token') ? { status: 400, json: { error: 'invalid_grant' } } : { status: 401, json: {} },
    );
    await assert.rejects(() => app.api.gql('{ hello }', {}, { authenticated: true }), isUnauthenticated);
    assert.equal(bffCalls(calls).length, 1);
    assert.equal(storedRefreshToken(), undefined);
    assert.equal(await app.session.currentAccessToken(), null);
  });

  test('a public read (not authenticated) sends no token and never renews', async () => {
    const calls = await signedIn(() => ({ status: 401, json: {} }));
    await assert.rejects(() => app.api.gql('{ hello }'));
    assert.equal(tokenCalls(calls).length, 0);
    assert.equal(bffCalls(calls)[0]!.headers.authorization, undefined);
  });
});

describe('other answers', () => {
  test('a GraphQL error other than UNAUTHENTICATED is thrown with its code and does not renew', async () => {
    const calls = await signedIn(() => ({
      status: 200,
      json: { errors: [{ message: 'Sold out', extensions: { code: 'OUT_OF_STOCK' } }] },
    }));
    await assert.rejects(
      () => app.api.gql('{ hello }', {}, { authenticated: true }),
      (e: unknown) => e instanceof app.api.ApiError && e.code === 'OUT_OF_STOCK' && e.message === 'Sold out',
    );
    assert.equal(tokenCalls(calls).length, 0);
    assert.equal(bffCalls(calls).length, 1);
  });

  test('an unreachable BFF rejects the call and keeps the session', async () => {
    await signedIn(() => new TypeError('Network request failed'));
    await assert.rejects(() => app.api.gql('{ hello }', {}, { authenticated: true }), TypeError);
    assert.equal(storedRefreshToken(), 'refresh-2');
    assert.equal(await app.session.currentAccessToken(), 'access-1');
  });

  test('no session: an authenticated call fails with UNAUTHENTICATED before any request', async () => {
    const calls = fakeFetch(() => ok);
    await app.session.signOut();
    await assert.rejects(() => app.api.gql('{ hello }', {}, { authenticated: true }), isUnauthenticated);
    assert.equal(calls.length, 0);
  });
});
