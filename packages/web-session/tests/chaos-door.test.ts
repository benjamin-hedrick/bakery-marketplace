import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ChaosRuntime, parseScenario } from '@bakery/chaos';
import { webChaosGate, webChaosGateFromEnv } from '../src/chaos-door.ts';
import type { ApiRequest, ApiResponse } from '../src/handlers.ts';

// ADR-0024: the `web` layer is a gate at the head of the web servers' GraphQL routes. Each test shows the journal first, then what the browser would see.

function exchange(headers: Record<string, string> = {}) {
  const out = {
    status: 0,
    headers: {} as Record<string, string>,
    json: undefined as unknown,
    body: undefined as unknown,
    destroyed: false,
  };
  const listeners: Record<string, (() => void)[]> = {};
  const req = {
    method: 'POST',
    headers,
    socket: { destroy: () => void (out.destroyed = true) },
  } as unknown as ApiRequest;
  const res = {
    status: (code: number) => void (out.status = code),
    setHeader: (name: string, value: string) => void (out.headers[name] = value),
    json: (body: unknown) => void (out.json = body),
    send: (body: unknown) => void (out.body = body),
    end: () => undefined,
    once: (event: string, fn: () => void) => void (listeners[event] ??= []).push(fn),
    destroy: () => void (out.destroyed = true),
  } as unknown as ApiResponse;
  return { req, res, out, close: () => listeners['close']?.forEach((f) => f()) };
}

const gateFor = (layer: string) => {
  const runtime = new ChaosRuntime(
    parseScenario(`{ "name": "web-trouble", "seed": 1, "layers": { "web": ${layer} } }`),
  );
  return { runtime, gate: webChaosGate(runtime)! };
};

describe('the web door', () => {
  test('rejectRate 1 answers the chosen status in the safe shape, names the scenario and the fault, and the handler stops', async () => {
    const { runtime, gate } = gateFor('{ "rejectRate": 1, "rejectStatus": 502 }');
    const { req, res, out } = exchange();

    assert.equal(await gate(req, res), true);
    assert.equal(runtime.journal.count('web', 'reject'), 1);
    assert.equal(out.status, 502);
    assert.deepEqual(out.json, { error: 'The service is temporarily unavailable. Please try again.' });
    assert.equal(out.headers['x-chaos-scenario'], 'web-trouble');
    assert.equal(out.headers['x-chaos-injected'], 'web:reject');
  });

  test('a 429 carries a Retry-After, as the real limit does', async () => {
    const { gate } = gateFor('{ "rejectRate": 1, "rejectStatus": 429 }');
    const { req, res, out } = exchange();
    await gate(req, res);
    assert.equal(out.headers['retry-after'], '1');
  });

  test('malformedRate 1 answers a 200 that is not JSON', async () => {
    const { runtime, gate } = gateFor('{ "malformedRate": 1 }');
    const { req, res, out } = exchange();

    assert.equal(await gate(req, res), true);
    assert.equal(runtime.journal.count('web', 'malformed'), 1);
    assert.equal(out.status, 200);
    assert.equal(out.headers['content-type'], 'text/html');
    assert.match(String(out.body), /Bad gateway/);
  });

  test('resetRate 1 closes the connection and writes nothing', async () => {
    const { runtime, gate } = gateFor('{ "resetRate": 1 }');
    const { req, res, out } = exchange();

    assert.equal(await gate(req, res), true);
    assert.equal(runtime.journal.count('web', 'reset'), 1);
    assert.equal(out.destroyed, true);
    assert.equal(out.status, 0);
  });

  test('hangRate 1 never answers; the held request is released when the browser goes', async () => {
    const { runtime, gate } = gateFor('{ "hangRate": 1 }');
    const { req, res, out, close } = exchange();

    assert.equal(await gate(req, res), true);
    assert.equal(runtime.journal.count('web', 'hang'), 1);
    assert.equal(out.status, 0);
    close(); // clears the safety timer, so the test process can end
  });

  test('a request is passed on when no fault applies; a caller that sets traceparent chooses the key', async () => {
    const { runtime, gate } = gateFor('{ "rejectRate": 0.5 }');
    const trace = (id: string) => `00-${id.padEnd(32, '0')}-0000000000000001-01`;
    const hit = async (id: string) => {
      const { req, res } = exchange({ traceparent: trace(id) });
      return gate(req, res);
    };
    const first = await hit('aa');
    assert.equal(await hit('aa'), first); // the same key gets the same decision, so a test can say which requests are hit
    assert.equal(runtime.journal.count('web', 'reject'), first ? 2 : 0);
  });

  test('the gate is not built without the layer, and nothing is built without CHAOS_ENABLED', () => {
    assert.equal(
      webChaosGate(new ChaosRuntime(parseScenario('{ "name": "n", "seed": 1, "layers": { "events": {} } }'))),
      undefined,
    );
    assert.equal(webChaosGate(undefined), undefined);
    assert.equal(webChaosGateFromEnv({}), undefined);
  });

  test('chaos refuses to start outside local, dev and tests', () => {
    assert.throws(() =>
      webChaosGateFromEnv({ CHAOS_ENABLED: 'true', CHAOS_SCENARIO: 'bff-door', NODE_ENV: 'production' }),
    );
  });

  test('a layer switched off by the scenario passes everything', async () => {
    const runtime = new ChaosRuntime(
      parseScenario('{ "name": "n", "seed": 1, "layers": { "web": { "rejectRate": 1 } }, "off": [ "web" ] }'),
    );
    const { req, res, out } = exchange();
    assert.equal(await webChaosGate(runtime)!(req, res), false);
    assert.equal(out.status, 0);
  });
});

// WI-CHAOS-006: the web door is aimed like any layer, by the caller's own trace id (the session is not read before the door).
describe('aiming at the web door', () => {
  const AIMED = 'c4a05c4a05c4a05c4a05c4a05c4a05c4';
  test('a rule on the key disturbs only the requests that carry that trace id; a signal can switch the door on', async () => {
    const runtime = new ChaosRuntime(
      parseScenario(
        JSON.stringify({
          name: 'aimed-web',
          seed: 1,
          layers: { web: { rejectRate: 1 } },
          where: { web: [{ key: AIMED }] },
          off: ['web'],
          signals: [{ when: { client: 'web', operation: '/api/chaos-on' }, do: 'enable', layer: 'web' }],
        }),
      ),
    );
    const gate = webChaosGate(runtime)!;
    const aimed = { traceparent: `00-${AIMED}-00f067aa0ba902b7-01` };

    const before = exchange(aimed);
    assert.equal(await gate(before.req, before.res), false, 'off at start');

    const trigger = exchange();
    (trigger.req as { url?: string }).url = '/api/chaos-on?x=1';
    assert.equal(await gate(trigger.req, trigger.res), false, 'the trigger itself is not aimed at');
    assert.equal(runtime.journal.count('signal', 'enable:web'), 1);

    const hit = exchange(aimed);
    assert.equal(await gate(hit.req, hit.res), true);
    assert.equal(runtime.journal.count('web', 'reject'), 1);
    assert.equal(hit.out.status, 503);

    const other = exchange({ traceparent: '00-0123456789abcdef0123456789abcdef-00f067aa0ba902b7-01' });
    assert.equal(await gate(other.req, other.res), false);
    const plain = exchange();
    assert.equal(await gate(plain.req, plain.res), false);
  });
});
