import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ChaosRuntime, chaosFromEnv, parseScenario } from '@bakery/chaos';
import { BffChaos } from '../src/chaos.ts';
import { DownstreamError } from '../src/errors.ts';

// ADR-0024, amended: "fail the first N attempts" aimed at named calls, and signals that change the chaos state. The wrapper is exercised on a fake client
// so each test shows the journal first and then what the caller saw.

const token = (sub: string) => `Bearer h.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.s`;
const trace = { traceId: 't', spanId: 's', flags: '01', continued: false };

function fakeClients() {
  const calls: string[] = [];
  const ordering = {
    // The real clients take (body, authorization, key, trace) and (authorization, trace); the fakes only record what matters.
    placeOrder: (...args: unknown[]) => {
      calls.push(`placeOrder:${String(args[2])}`);
      return Promise.resolve('placed');
    },
    listPaymentMethods: (...args: unknown[]) => {
      void args;
      calls.push('listPaymentMethods');
      return Promise.resolve(['pm']);
    },
  };
  const catalog = {
    get: (...args: unknown[]) => {
      calls.push(`get:${String(args[0])}`);
      return Promise.resolve({ id: args[0] });
    },
  };
  return { calls, ordering, catalog };
}

const alice = { paymentMethodId: 'pm-alice-ok', lineItems: [{ listingId: 'latte', quantity: 2 }] };
const ordinary = { paymentMethodId: 'pm-alice-ok', lineItems: [{ listingId: 'latte', quantity: 1 }] };

describe('the first attempts of a named call fail, the retry does not', () => {
  const scenario = `{
    "name": "checkout-first-fails", "seed": 1,
    "layers": { "bffOrdering": { "failFirstAttempts": 1 } },
    "where": { "bffOrdering": [ { "operation": "placeOrder", "payload": { "paymentMethodId": "pm-alice-ok", "lineItems": [ { "quantity": 2 } ] } } ] }
  }`;

  test('the matching order fails once as an unreachable service does; its retry with the same key succeeds; another order is untouched', async () => {
    const runtime = new ChaosRuntime(parseScenario(scenario));
    const { calls, ordering } = fakeClients();
    const wrapped = new BffChaos(runtime).wrap(ordering, 'bffOrdering', 'ordering');

    await assert.rejects(wrapped.placeOrder(alice, token('u1'), 'key-1', trace), (e) => e instanceof DownstreamError);
    assert.equal(runtime.journal.count('bffOrdering', 'failFirst'), 1); // the fault is on the record before the effect is judged
    assert.deepEqual(calls, []); // it failed before the service was called: nothing was placed
    assert.equal(await wrapped.placeOrder(alice, token('u1'), 'key-1', trace), 'placed');
    assert.equal(await wrapped.placeOrder(ordinary, token('u1'), 'key-2', trace), 'placed');
    assert.equal(runtime.journal.count('bffOrdering', 'failFirst'), 1);
    assert.deepEqual(calls, ['placeOrder:key-1', 'placeOrder:key-2']);
  });

  test('the customer comes from the bearer token', async () => {
    const runtime = new ChaosRuntime(
      parseScenario(
        `{ "name": "n", "seed": 1, "layers": { "bffOrdering": { "failFirstAttempts": 1 } },
           "where": { "bffOrdering": [ { "operation": "listPaymentMethods", "customer": "user-customer-2" } ] } }`,
      ),
    );
    const { ordering } = fakeClients();
    const wrapped = new BffChaos(runtime).wrap(ordering, 'bffOrdering', 'ordering');
    assert.deepEqual(await wrapped.listPaymentMethods(token('user-customer-1'), trace), ['pm']);
    await assert.rejects(wrapped.listPaymentMethods(token('user-customer-2'), trace), DownstreamError);
    assert.deepEqual(await wrapped.listPaymentMethods(token('user-customer-2'), trace), ['pm']);
    assert.equal(runtime.journal.count('bffOrdering', 'failFirst'), 1);
  });
});

describe('a signal arms a layer for the calls that follow', () => {
  const scenario = `{
    "name": "armed-by-a-look", "seed": 1,
    "layers": { "bffOrdering": { "failFirstAttempts": 1 }, "bffCatalog": {} },
    "off": [ "bffOrdering" ],
    "signals": [ { "when": { "client": "bffCatalog", "operation": "get", "key": "listing-flow-07" }, "do": "enable", "layer": "bffOrdering" } ]
  }`;

  test('nothing fails until the marked request is seen; then the first attempt fails and the retry succeeds', async () => {
    const runtime = new ChaosRuntime(parseScenario(scenario));
    const chaos = new BffChaos(runtime);
    const { catalog, ordering } = fakeClients();
    const c = chaos.wrap(catalog, 'bffCatalog', 'catalog');
    const o = chaos.wrap(ordering, 'bffOrdering', 'ordering');

    assert.deepEqual(await o.listPaymentMethods(token('u1'), trace), ['pm']); // off: an ordinary run is not disturbed
    await c.get('listing-1', trace);
    assert.equal(runtime.journal.count('signal'), 0);

    await c.get('listing-flow-07', trace); // the marked request goes through as normal...
    assert.equal(runtime.journal.count('signal', 'enable:bffOrdering'), 1); // ...and is on the record
    // The attempt counter is per operation and key, and the earlier call was counted while the layer was off: it was not counted at all.
    await assert.rejects(o.listPaymentMethods(token('u1'), trace), DownstreamError);
    assert.deepEqual(await o.listPaymentMethods(token('u1'), trace), ['pm']);
  });

  test('a client is not wrapped at all when the scenario has neither its layer nor signals', () => {
    const runtime = new ChaosRuntime(parseScenario(`{ "name": "n", "seed": 1, "layers": { "bffCatalog": {} } }`));
    const { ordering } = fakeClients();
    assert.equal(new BffChaos(runtime).wrap(ordering, 'bffOrdering', 'ordering'), ordering);
  });
});

describe('the scenario file of the Android flows (flow 07 and flow 11)', () => {
  const nora = token('user-customer-treenut');
  const setup = () => {
    const runtime = chaosFromEnv(
      { CHAOS_ENABLED: 'true', CHAOS_SCENARIO: 'mobile-flows', DEPLOYMENT_ENVIRONMENT: 'local' },
      { cwd: import.meta.dirname },
    );
    assert.ok(runtime);
    const chaos = new BffChaos(runtime);
    const { catalog, ordering } = fakeClients();
    return {
      runtime,
      c: chaos.wrap(catalog, 'bffCatalog', 'catalog'),
      o: chaos.wrap(ordering, 'bffOrdering', 'ordering'),
    };
  };

  test('Nora is untouched until the Cardamom Honey Latte is opened (flow 05 comes first); then her first payment-methods call fails and the retry works', async () => {
    const { runtime, o, c } = setup();
    assert.deepEqual(await o.listPaymentMethods(nora, trace), ['pm']);
    await c.get('listing-latte-001', trace);
    assert.equal(runtime.journal.count('signal'), 0);

    await c.get('listing-cardamom-latte-001', trace);
    assert.equal(runtime.journal.count('signal', 'switch:mobile-flows-07'), 1);
    await assert.rejects(o.listPaymentMethods(nora, trace), DownstreamError);
    assert.deepEqual(await o.listPaymentMethods(nora, trace), ['pm']);
    assert.deepEqual(await o.listPaymentMethods(token('user-customer-alice'), trace), ['pm']); // nobody else is disturbed
  });

  test('flow 11 still works on its own, and after the switch', async () => {
    const { o, c } = setup();
    const order = { paymentMethodId: 'pm-alice-ok', lineItems: [{ listingId: 'listing-latte-001', quantity: 2 }] };
    await assert.rejects(o.placeOrder(order, token('a'), 'k1', trace), DownstreamError);
    assert.equal(await o.placeOrder(order, token('a'), 'k1', trace), 'placed');

    const second = setup();
    await second.c.get('listing-cardamom-latte-001', trace);
    await assert.rejects(second.o.placeOrder(order, token('a'), 'k2', trace), DownstreamError);
    assert.equal(await second.o.placeOrder(order, token('a'), 'k2', trace), 'placed');
    void c;
  });
});
