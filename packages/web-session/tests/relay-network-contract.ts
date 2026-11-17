import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, describe, mock, test } from 'node:test';
import { ChaosRuntime, parseScenario } from '@bakery/chaos';
import { webChaosGate } from '../src/chaos-door.ts';
import { GraphQLRequestError, UnauthenticatedError } from '../src/errors.ts';
import { createGraphqlHandler, type ApiRequest, type ApiResponse } from '../src/handlers.ts';
import { createWebRateLimits, DEFAULT_RATE_LIMITS } from '../src/rate-limit.ts';
import { createSessionService } from '../src/service.ts';
import { createMemoryStore } from '../src/store.ts';
import { ManualClock, fakeIssuer, newSealer, testConfig, tokenResponse } from './helpers.ts';

// ADR-0024, WI-CHAOS-005: the equivalence contract of a web app's Relay network function (the one the browser uses). Each app's own test runs it against
// its own function: apps/web-customer (`browserFetch`) and apps/web-queue-display (`fetchGraphQL`). For every fault the `web` layer can inject at the web
// server's GraphQL route, the same fault made for real (a BFF that misbehaves behind the real route, or a web server that does) must give the page the same
// outcome from the network function: the same error, or the same lack of an answer. And no fault, injected or real, may be taken for the end of the login:
// only the BFF's UNAUTHENTICATED does that. Everything runs over real HTTP: a real server around the real route handler, and the app's real function
// (the browser's relative address is resolved against the test server; nothing else about fetch is changed).

/** Any Relay fetch function: (operation, variables) => the response. Typed loosely so this package does not depend on Relay. */
export type NetworkFunction = (...args: never[]) => unknown;

/** The app's origin as the browser names it; the test servers listen on other ports of 127.0.0.1. */
const APP_ORIGIN = 'http://localhost:3100';

const OPERATION = {
  id: null,
  cacheID: 'q',
  name: 'ListingsQuery',
  operationKind: 'query',
  text: '{ listings { id } }',
  metadata: {},
};

/** What the page gets from the network function: an answer, an error (and whether it ends the login), or nothing yet. */
export type Outcome =
  { settled: 'answered' } | { settled: 'failed'; error: string; endsTheLogin: boolean } | { settled: 'nothing yet' };

const describeError = (e: unknown): string =>
  e instanceof UnauthenticatedError
    ? 'UnauthenticatedError'
    : e instanceof GraphQLRequestError
      ? 'GraphQLRequestError'
      : e instanceof SyntaxError
        ? 'SyntaxError (the answer is not JSON)' // the parser's message quotes the body, which differs between two HTML pages
        : `${(e as Error).name}: ${(e as Error).message}`;

/** `timeoutMs`: how long the app's function lets a call go without an answer before it fails (register 196). */
export function runRelayNetworkContract(app: string, network: NetworkFunction, timeoutMs: number): void {
  describe(`${app}: an injected fault at the web door looks to the page's network function like the real fault`, () => {
    const servers: http.Server[] = [];
    after(() => {
      for (const s of servers) {
        s.closeAllConnections();
        s.close();
      }
    });

    async function listen(handler: http.RequestListener): Promise<string> {
      const server = http.createServer(handler);
      servers.push(server);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    }

    /** Node's request and response with the few helpers Next.js adds to an API route. */
    function asApi(req: http.IncomingMessage, res: http.ServerResponse): [ApiRequest, ApiResponse] {
      const api = res as http.ServerResponse & Record<string, unknown>;
      api['status'] = (code: number) => {
        res.statusCode = code;
        return api;
      };
      api['json'] = (body: unknown) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(body));
      };
      api['send'] = (body: Buffer) => res.end(body);
      return [req as unknown as ApiRequest, api as unknown as ApiResponse];
    }

    /** The web server: the real GraphQL route handler in front of `bffUrl`, with the chaos gate when a `web` layer is given. */
    async function webServer(
      bffUrl: string,
      options: { layer?: string; graphqlPerMinute?: number } = {},
    ): Promise<string> {
      const clock = new ManualClock();
      const config = testConfig({ APP_ORIGIN });
      const service = createSessionService({
        config,
        store: createMemoryStore(newSealer(), clock.now),
        fetch: fakeIssuer(() => tokenResponse({})).fetchImpl,
        clock,
      });
      const gate = options.layer
        ? webChaosGate(
            new ChaosRuntime(
              parseScenario(`{ "name": "web-trouble", "seed": 1, "layers": { "web": ${options.layer} } }`),
            ),
          )
        : undefined;
      const limits =
        options.graphqlPerMinute === undefined
          ? undefined
          : createWebRateLimits({ ...DEFAULT_RATE_LIMITS, graphqlPerMinute: options.graphqlPerMinute });
      const handler = createGraphqlHandler({ config, service, target: () => `${bffUrl}/graphql`, gate, limits });
      return listen((req, res) => void handler(...asApi(req, res)));
    }

    const bffAnswering = (status: number, contentType: string, body: string) =>
      listen((_req, res) => res.writeHead(status, { 'content-type': contentType }).end(body));
    const healthyBff = () => bffAnswering(200, 'application/json', '{"data":{"listings":[]}}');

    /** Runs the app's network function as the browser would, with its relative address resolved against `base`. Waits at most `waitMs` for it. */
    async function outcome(base: string, waitMs = 1500): Promise<Outcome> {
      const realFetch = globalThis.fetch;
      globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        headers.set('origin', APP_ORIGIN); // a browser adds it to every POST; the route's CSRF check needs it
        return realFetch(new URL(String(input), base), { ...init, headers });
      }) as typeof fetch;
      try {
        const call = Promise.resolve()
          .then(() => network(OPERATION as never, {} as never))
          .then(
            (): Outcome => ({ settled: 'answered' }),
            (e: unknown): Outcome => ({
              settled: 'failed',
              error: describeError(e),
              endsTheLogin: e instanceof UnauthenticatedError,
            }),
          );
        const waiting = new Promise<Outcome>((resolve) =>
          setTimeout(() => resolve({ settled: 'nothing yet' }), waitMs),
        );
        return await Promise.race([call, waiting]);
      } finally {
        globalThis.fetch = realFetch;
      }
    }

    const failed = (error: string): Outcome => ({ settled: 'failed', error, endsTheLogin: false });

    test('a rejected request: the injected 503 is the real BFF 503 relayed', async () => {
      const real = await outcome(await webServer(await bffAnswering(503, 'application/json', '{"errors":[]}')));
      const injected = await outcome(
        await webServer(await healthyBff(), { layer: '{ "rejectRate": 1, "rejectStatus": 503 }' }),
      );

      assert.deepEqual(injected, real);
      assert.deepEqual(injected, failed('Error: GraphQL request failed: 503'));
    });

    test("a BFF that cannot be reached: the injected 502 is the proxy's own 502", async () => {
      const gone = await listen(() => undefined);
      servers.pop()!.close(); // the port is now refused: a real connection failure to the BFF
      const real = await outcome(await webServer(gone));
      const injected = await outcome(
        await webServer(await healthyBff(), { layer: '{ "rejectRate": 1, "rejectStatus": 502 }' }),
      );

      assert.deepEqual(injected, real);
      assert.deepEqual(injected, failed('Error: GraphQL request failed: 502'));
    });

    test("too many requests: the injected 429 is the route's own rate limit", async () => {
      const limited = await webServer(await healthyBff(), { graphqlPerMinute: 1 });
      assert.deepEqual(await outcome(limited), { settled: 'answered' }); // the one request allowed
      const real = await outcome(limited);
      const injected = await outcome(
        await webServer(await healthyBff(), { layer: '{ "rejectRate": 1, "rejectStatus": 429 }' }),
      );

      assert.deepEqual(injected, real);
      assert.deepEqual(injected, failed('Error: GraphQL request failed: 429'));
    });

    test('an answer that is not JSON: the injected one is a real BFF answering HTML', async () => {
      const real = await outcome(await webServer(await bffAnswering(200, 'text/html', '<html>Bad gateway</html>')));
      const injected = await outcome(await webServer(await healthyBff(), { layer: '{ "malformedRate": 1 }' }));

      assert.deepEqual(injected, real);
      assert.deepEqual(injected, failed('SyntaxError (the answer is not JSON)'));
    });

    test('a reset connection: the injected reset is a real web server that closes the socket', async () => {
      const real = await outcome(await listen((req) => req.socket.destroy()));
      const injected = await outcome(await webServer(await healthyBff(), { layer: '{ "resetRate": 1 }' }));

      assert.deepEqual(injected, real);
      assert.deepEqual(injected, failed('TypeError: fetch failed'));
    });

    test('no answer: the injected hang is a real web server that never answers (both still waiting, well inside the time limit)', async () => {
      const real = await outcome(await listen(() => undefined));
      const injected = await outcome(await webServer(await healthyBff(), { layer: '{ "hangRate": 1 }' }));

      assert.deepEqual(injected, real);
      assert.deepEqual(injected, { settled: 'nothing yet' });
    });

    test('no answer within the time limit: the call fails as a reset does, so the page shows Try again (register 196)', async () => {
      // A fetch that never answers and gives up only when its signal fires, with the clock of setTimeout under the test's control.
      const realFetch = globalThis.fetch;
      globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
        })) as typeof fetch;
      mock.timers.enable({ apis: ['setTimeout'] });
      try {
        let result: Outcome = { settled: 'nothing yet' };
        const call = Promise.resolve()
          .then(() => network(OPERATION as never, {} as never))
          .then(
            () => (result = { settled: 'answered' }),
            (e: unknown) =>
              (result = {
                settled: 'failed',
                error: describeError(e),
                endsTheLogin: e instanceof UnauthenticatedError,
              }),
          );
        await new Promise((r) => setImmediate(r)); // let the call start and its timer be set
        mock.timers.tick(timeoutMs - 1);
        await new Promise((r) => setImmediate(r));
        assert.deepEqual(result, { settled: 'nothing yet' }, 'it gave up before the time limit');
        mock.timers.tick(1);
        await call;
        assert.equal(result.settled, 'failed');
        assert.match((result as { error: string }).error, /^TimeoutError: /);
        assert.equal((result as { endsTheLogin: boolean }).endsTheLogin, false);
      } finally {
        mock.timers.reset();
        globalThis.fetch = realFetch;
      }
    });

    test('only the BFF saying UNAUTHENTICATED ends the login; a fault never does, and with no fault the answer arrives', async () => {
      const unauthenticated = await outcome(
        await webServer(
          await bffAnswering(
            200,
            'application/json',
            '{"errors":[{"message":"Not logged in","extensions":{"code":"UNAUTHENTICATED"}}]}',
          ),
        ),
      );
      const otherErrors = await outcome(
        await webServer(await bffAnswering(200, 'application/json', '{"errors":[{"message":"Listing not found"}]}')),
      );

      assert.deepEqual(unauthenticated, { settled: 'failed', error: 'UnauthenticatedError', endsTheLogin: true });
      assert.deepEqual(otherErrors, failed('GraphQLRequestError'));
      assert.deepEqual(await outcome(await webServer(await healthyBff())), { settled: 'answered' });
      assert.deepEqual(await outcome(await webServer(await healthyBff(), { layer: '{ "rejectRate": 0 }' })), {
        settled: 'answered',
      });
    });
  });
}
