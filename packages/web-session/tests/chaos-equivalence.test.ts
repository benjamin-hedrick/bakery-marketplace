import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, describe, test } from 'node:test';
import { ChaosRuntime, parseScenario } from '@bakery/chaos';
import { webChaosGate } from '../src/chaos-door.ts';
import { createGraphqlHandler, type ApiRequest, type ApiResponse } from '../src/handlers.ts';
import { createSessionService } from '../src/service.ts';
import { createMemoryStore } from '../src/store.ts';
import { ManualClock, fakeIssuer, newSealer, testConfig, tokenResponse } from './helpers.ts';

// ADR-0024, equivalence: what the browser's client sees from an injected fault at the web door is what it sees from the real fault. The client (Relay's
// network function in apps/web-customer and the queue display) decides from three things only: whether the call threw, the status, and whether the body
// parses as JSON. So each injected fault is compared with the real one on exactly those, over real HTTP: a real web server around the real route handler,
// a real fetch, and a real BFF stand-in that misbehaves.

type View = { threw: true } | { threw: false; ok: boolean; status: number; json: boolean };

async function view(url: string): Promise<View> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3100' },
      body: JSON.stringify({ query: '{ listings { id } }' }),
    });
  } catch {
    return { threw: true };
  }
  const text = await res.text();
  let json = true;
  try {
    JSON.parse(text);
  } catch {
    json = false;
  }
  return { threw: false, ok: res.ok, status: res.status, json };
}

const servers: http.Server[] = [];
async function listen(handler: http.RequestListener): Promise<string> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
after(() => {
  for (const s of servers) {
    s.closeAllConnections();
    s.close();
  }
});

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

/** The web server: the real GraphQL route handler, with a chaos gate when a layer is given, in front of `bffUrl`. */
async function webServer(bffUrl: string, layer?: string): Promise<string> {
  const clock = new ManualClock();
  const config = testConfig();
  const issuer = fakeIssuer(() => tokenResponse({}));
  const service = createSessionService({
    config,
    store: createMemoryStore(newSealer(), clock.now),
    fetch: issuer.fetchImpl,
    clock,
  });
  const gate = layer
    ? webChaosGate(
        new ChaosRuntime(parseScenario(`{ "name": "web-trouble", "seed": 1, "layers": { "web": ${layer} } }`)),
      )
    : undefined;
  const handler = createGraphqlHandler({ config, service, target: () => `${bffUrl}/graphql`, gate });
  return listen((req, res) => void handler(...asApi(req, res)));
}

const healthyBff = () =>
  listen((_req, res) => res.writeHead(200, { 'content-type': 'application/json' }).end('{"data":{}}'));

describe('an injected fault at the web door looks to the client like the real fault', () => {
  test('a rejected request: the injected 503 is the real BFF 503 relayed', async () => {
    const real = await webServer(
      await listen((_req, res) => res.writeHead(503, { 'content-type': 'application/json' }).end('{"errors":[]}')),
    );
    const injected = await webServer(await healthyBff(), '{ "rejectRate": 1, "rejectStatus": 503 }');

    const a = await view(`${real}/`);
    const b = await view(`${injected}/`);

    assert.deepEqual(b, a);
    assert.deepEqual(b, { threw: false, ok: false, status: 503, json: true });
  });

  test("a BFF that cannot be reached: the injected 502 is the proxy's own 502", async () => {
    const dead = await listen(() => undefined);
    const closed = new URL(dead).port;
    servers.pop()!.close(); // the port is now refused: a real connection failure to the BFF
    const real = await webServer(`http://127.0.0.1:${closed}`);
    const injected = await webServer(await healthyBff(), '{ "rejectRate": 1, "rejectStatus": 502 }');

    assert.deepEqual(await view(`${injected}/`), await view(`${real}/`));
    assert.deepEqual(await view(`${real}/`), { threw: false, ok: false, status: 502, json: true });
  });

  test('a body that is not JSON: the injected one is a real BFF answering HTML', async () => {
    const real = await webServer(
      await listen((_req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<html>Bad gateway</html>')),
    );
    const injected = await webServer(await healthyBff(), '{ "malformedRate": 1 }');

    const a = await view(`${real}/`);
    const b = await view(`${injected}/`);

    assert.deepEqual(b, a);
    assert.deepEqual(b, { threw: false, ok: true, status: 200, json: false });
  });

  test('a reset connection: the injected reset is a real server that closes the socket', async () => {
    const real = await listen((req) => req.socket.destroy());
    const injected = await webServer(await healthyBff(), '{ "resetRate": 1 }');

    assert.deepEqual(await view(`${injected}/`), await view(`${real}/`));
    assert.deepEqual(await view(`${injected}/`), { threw: true });
  });

  test('no layer: the same web server passes the request through unchanged', async () => {
    const plain = await webServer(await healthyBff());
    const idle = await webServer(await healthyBff(), '{ "rejectRate": 0 }');

    assert.deepEqual(await view(`${plain}/`), { threw: false, ok: true, status: 200, json: true });
    assert.deepEqual(await view(`${idle}/`), { threw: false, ok: true, status: 200, json: true });
  });
});
