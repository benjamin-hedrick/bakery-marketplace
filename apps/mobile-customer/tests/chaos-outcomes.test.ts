// ADR-0024, WI-CHAOS-003: every way the BFF can fail to give an answer looks the same to the app. `gql()` rejects for all of them, none of them is
// taken for a sign-in problem, and none touches the stored session. This is what the screens rely on (`.catch(() => setFailed(true))` at the allergy
// check, the pickup windows and the payment methods; "The order could not be placed" at checkout), so a stopped BFF, a reset connection, a 503, a 429, a
// page that is not JSON and a timeout can all be produced by the chaos gate or the chaos wrappers instead of by stopping the process.
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

beforeEach(async () => {
  app = await freshApp();
  seedRefreshToken('refresh-1');
});
afterEach(() => {
  globalThis.fetch = realFetch;
  mock.timers.reset();
});

const faults: [string, Reply][] = [
  ['the connection is refused (the BFF is stopped)', new TypeError('Network request failed')],
  ['the connection is reset (the chaos gate: resetRate)', new TypeError('Network request failed')],
  [
    'HTTP 503 with a JSON error (the gate: rejectRate)',
    { status: 503, json: { errors: [{ message: 'x', extensions: { code: 'UNAVAILABLE' } }] } },
  ],
  [
    'HTTP 429 with a JSON error (the gate: rejectStatus 429)',
    { status: 429, json: { errors: [{ message: 'x', extensions: { code: 'RATE_LIMITED' } }] } },
  ],
  ['HTTP 503 with a page that is not JSON (a proxy in front)', { status: 503, notJson: true }],
  ['HTTP 200 with a page that is not JSON (the gate: malformedRate)', { status: 200, notJson: true }],
  [
    'a GraphQL INTERNAL error (a service behind the BFF failed: the bff client layers)',
    { status: 200, json: { errors: [{ message: 'Something went wrong.', extensions: { code: 'INTERNAL' } }] } },
  ],
  ['no data at all', { status: 200, json: {} }],
];

describe('every failure to get an answer from the BFF', () => {
  for (const [name, reply] of faults) {
    test(`${name}: gql rejects, it is not a sign-in problem, and the session is untouched`, async () => {
      let n = 0;
      const calls = fakeFetch((c: Call) =>
        c.url.endsWith('/token') ? tokens(`access-${++n}`, { refresh_token: `refresh-${n + 1}` }) : reply,
      );
      await app.session.restoreSession(); // signed in: access-1, the refresh token is now refresh-2
      calls.length = 0;
      const refreshBefore = storedRefreshToken();

      await assert.rejects(
        () => app.api.gql('{ hello }', {}, { authenticated: true }),
        (e: unknown) => !(e instanceof app.api.ApiError && e.code === 'UNAUTHENTICATED'),
      );

      assert.equal(tokenCalls(calls).length, 0, 'a BFF failure must not trigger a token renewal');
      assert.equal(storedRefreshToken(), refreshBefore, 'a BFF failure must not touch the stored session');
    });
  }

  test("a call that never gets an answer ends at the app's own timeout the same way", async () => {
    globalThis.fetch = ((_: unknown, init: RequestInit = {}) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError')),
        );
      })) as typeof fetch;

    const pending = assert.rejects(
      () => app.api.gql('{ hello }'),
      (e: unknown) => e instanceof Error && e.name === 'AbortError',
    );
    mock.timers.tick(31_000); // BFF_TIMEOUT_MS is 30 seconds

    await pending;
  });

  test('the one thing that is different: a 401 starts a renewal, so it is never used to stand in for an outage', async () => {
    let bff = 0;
    let n = 0;
    const calls = fakeFetch((c: Call) =>
      c.url.endsWith('/token')
        ? tokens(`access-${++n}`, { refresh_token: `refresh-${n + 1}` })
        : ++bff === 1
          ? { status: 401, json: {} }
          : { status: 200, json: { data: { hello: 'world' } } },
    );
    await app.session.restoreSession();
    calls.length = 0;

    assert.deepEqual(await app.api.gql('{ hello }', {}, { authenticated: true }), { hello: 'world' });
    assert.equal(tokenCalls(calls).length, 1);
  });
});
