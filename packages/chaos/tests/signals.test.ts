import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ChaosRuntime,
  contains,
  customerOf,
  describeCall,
  parseScenario,
  SCENARIO_SECTIONS,
  ScenarioError,
  SIGNAL_ACTIONS,
} from '../src/index.ts';

const chaosDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'chaos');
const token = (sub: unknown) => `Bearer h.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.s`;
const trace = { traceId: 't', spanId: 's', flags: '01', continued: false };

describe('the shared lists', () => {
  test('the sections and the signal actions are the ones in chaos/layers.json, which the C# library is also tested against', () => {
    const shared = JSON.parse(readFileSync(path.join(chaosDir, 'layers.json'), 'utf8')) as {
      sections: string[];
      signalActions: string[];
    };
    assert.deepEqual([...SCENARIO_SECTIONS].sort(), [...shared.sections].sort());
    assert.deepEqual([...SIGNAL_ACTIONS].sort(), [...shared.signalActions].sort());
  });
});

describe('reading who and what a call is', () => {
  test('the customer is the sub of the bearer token; anything that cannot be read is no customer', () => {
    assert.equal(customerOf(token('user-customer-1')), 'user-customer-1');
    assert.equal(customerOf(token(42)), undefined);
    assert.equal(customerOf('Bearer not-a-token'), undefined);
    assert.equal(customerOf('Bearer a.!!!.c'), undefined);
    assert.equal(customerOf('Basic a.b.c'), undefined);
  });

  test('the key is the first string that is not a credential, the payload the first object that is not the trace', () => {
    const body = { paymentMethodId: 'pm-alice-ok' };
    const call = describeCall('bffOrdering', 'placeOrder', [body, token('u1'), 'key-1', trace]);
    assert.equal(call.key, 'key-1');
    assert.equal(call.customer, 'u1');
    assert.equal(call.payload, body);
    const bare = describeCall('bffOrdering', 'listPaymentMethods', [token('u1'), trace]);
    assert.equal(bare.key, 'listPaymentMethods');
    assert.equal(bare.payload, undefined);
  });

  test('a pattern is contained when every property it names is equal; arrays by length and element', () => {
    assert.ok(contains({ a: 1 }, { a: 1, b: 2 }));
    assert.ok(!contains({ a: 1 }, { a: 2 }));
    assert.ok(!contains({ a: 1 }, undefined));
    assert.ok(contains([{ q: 2 }], [{ q: 2, id: 'x' }]));
    assert.ok(!contains([{ q: 2 }], [{ q: 2 }, { q: 1 }]));
    assert.ok(!contains({ a: [] }, { a: {} }));
  });
});

describe('the sections of a scenario file', () => {
  const base = (extra: string) =>
    `{ "name": "n", "seed": 1, "layers": { "bffOrdering": { "failFirstAttempts": 1 }, "bffCatalog": {} }${extra} }`;

  test('where, off and signals are read', () => {
    const s = parseScenario(
      base(
        `, "where": { "bffOrdering": [ { "operation": "placeOrder", "payload": { "paymentMethodId": "pm-alice-ok" } } ] },
           "off": [ "bffCatalog" ],
           "signals": [ { "when": { "client": "bffCatalog", "operation": "get", "key": "listing-7" }, "do": "enable", "layer": "bffCatalog" } ]`,
      ),
    );
    assert.equal(s.where.bffOrdering?.[0]?.operation, 'placeOrder');
    assert.deepEqual(s.off, ['bffCatalog']);
    assert.equal(s.signals[0]?.do, 'enable');
  });

  for (const [what, extra, message] of [
    [
      'a where for a layer the scenario lacks',
      `, "where": { "bffOrdering": [ { "operation": "x" } ], "events": [ { "operation": "x" } ] }`,
      'does not have',
    ],
    ['an empty match', `, "where": { "bffOrdering": [ {} ] }`, 'matches everything'],
    ['an unknown match property', `, "where": { "bffOrdering": [ { "who": "x" } ] }`, "no property 'who'"],
    ['an off layer that is not built', `, "off": [ "nope" ]`, 'not built'],
    ['an unknown action', `, "signals": [ { "when": { "operation": "x" }, "do": "explode" } ]`, 'not an action'],
    ['an enable without a layer', `, "signals": [ { "when": { "operation": "x" }, "do": "enable" } ]`, 'needs a layer'],
    [
      'a switch with a path',
      `, "signals": [ { "when": { "operation": "x" }, "do": "switch", "scenario": "../x" } ]`,
      'plain name',
    ],
    [
      'a reset with a layer',
      `, "signals": [ { "when": { "operation": "x" }, "do": "reset", "layer": "bffOrdering" } ]`,
      'takes no layer',
    ],
    ['a signal with no when', `, "signals": [ { "do": "reset" } ]`, 'must be an object'],
  ] as const) {
    test(`${what} fails loudly`, () => {
      assert.throws(
        () => parseScenario(base(extra)),
        (e: unknown) => e instanceof ScenarioError && e.message.includes(message),
      );
    });
  }

  test('failFirstAttempts must be a whole number', () => {
    assert.throws(
      () => parseScenario(`{ "name": "n", "seed": 1, "layers": { "bffOrdering": { "failFirstAttempts": 1.5 } } }`),
      /whole number/,
    );
  });

  test('a scenario with no extra section has none', () => {
    const s = parseScenario(`{ "name": "n", "seed": 1, "layers": { "bffOrdering": {} } }`);
    assert.deepEqual([s.where, s.off, s.signals], [{}, [], []]);
  });
});

describe('a runtime with signals', () => {
  const file = `{
    "name": "first",
    "seed": 9,
    "layers": { "bffOrdering": { "failFirstAttempts": 1 }, "bffCatalog": { "failFirstAttempts": 1 } },
    "off": [ "bffOrdering" ],
    "where": { "bffOrdering": [ { "operation": "placeOrder", "customer": "u1" } ] },
    "signals": [
      { "when": { "client": "bffCatalog", "operation": "get", "key": "listing-7" }, "do": "enable", "layer": "bffOrdering" },
      { "when": { "client": "bffCatalog", "operation": "get", "key": "listing-8" }, "do": "disable", "layer": "bffOrdering" },
      { "when": { "client": "bffCatalog", "operation": "get", "key": "listing-9" }, "do": "switch", "scenario": "second" },
      { "when": { "client": "bffCatalog", "operation": "get", "key": "listing-0" }, "do": "reset" }
    ]
  }`;
  const second = parseScenario(
    `{ "name": "second", "seed": 2, "layers": { "bffOrdering": { "failFirstAttempts": 3 } } }`,
  );
  const make = () => new ChaosRuntime(parseScenario(file), { resolveScenario: () => second });
  const get = (id: string) => describeCall('bffCatalog', 'get', [id, trace]);
  const place = (customer: string, key = 'k1') =>
    describeCall('bffOrdering', 'placeOrder', [{}, token(customer), key, trace]);

  test('a layer listed as off is not on until a signal enables it, and a disable turns it off again', () => {
    const rt = make();
    assert.equal(rt.isOn('bffOrdering'), false);
    assert.deepEqual(rt.signal(get('listing-7')), ['enable:bffOrdering']);
    assert.equal(rt.isOn('bffOrdering'), true);
    assert.deepEqual(rt.signal(get('listing-8')), ['disable:bffOrdering']);
    assert.equal(rt.isOn('bffOrdering'), false);
    assert.equal(rt.journal.count('signal'), 2);
  });

  test('a call that matches no signal changes nothing and is not journaled', () => {
    const rt = make();
    assert.deepEqual(rt.signal(get('listing-1')), []);
    assert.equal(rt.journal.entries.length, 0);
  });

  test('where limits a layer to the calls that match', () => {
    const rt = make();
    assert.equal(rt.appliesTo('bffOrdering', place('u1')), true);
    assert.equal(rt.appliesTo('bffOrdering', place('u2')), false);
    assert.equal(rt.appliesTo('bffCatalog', get('x')), true); // a layer with no where disturbs every call
  });

  test('the first N attempts of an operation and key fail, a retry after them does not, and another key is counted alone', () => {
    const rt = make();
    const layer = rt.layer('bffOrdering');
    assert.equal(layer.failsFirstAttempts('placeOrder', 'k1'), true);
    assert.equal(layer.failsFirstAttempts('placeOrder', 'k1'), false);
    assert.equal(layer.failsFirstAttempts('placeOrder', 'k2'), true);
    assert.equal(rt.journal.count('bffOrdering', 'failFirst'), 2);
  });

  test('a switch loads the named scenario with fresh counters and its own layers off', () => {
    const rt = make();
    const layer = rt.layer('bffOrdering');
    layer.failsFirstAttempts('placeOrder', 'k1');
    rt.signal(get('listing-9'));
    assert.equal(rt.scenario.name, 'second');
    assert.equal(rt.isOn('bffOrdering'), true);
    assert.equal(rt.isOn('bffCatalog'), false); // not in the second scenario
    assert.equal(layer.setting('failFirstAttempts'), 3);
    assert.equal(layer.failsFirstAttempts('placeOrder', 'k1'), true); // the count started again
  });

  test('a reset puts the layers back as the scenario starts them and the counters at zero', () => {
    const rt = make();
    rt.signal(get('listing-7'));
    rt.layer('bffOrdering').failsFirstAttempts('placeOrder', 'k1');
    rt.signal(get('listing-0'));
    assert.equal(rt.isOn('bffOrdering'), false);
    rt.signal(get('listing-7'));
    assert.equal(rt.layer('bffOrdering').failsFirstAttempts('placeOrder', 'k1'), true);
  });

  test('a switch with nothing that can find scenarios fails loudly', () => {
    const rt = new ChaosRuntime(parseScenario(file));
    assert.throws(() => rt.signal(get('listing-9')), /nothing can find scenarios/);
  });
});
