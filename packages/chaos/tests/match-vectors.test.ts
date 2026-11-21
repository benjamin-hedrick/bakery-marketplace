import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addRequestFaults,
  ChaosRuntime,
  contains,
  parseScenario,
  requestFaults,
  runInRequestScope,
} from '../src/index.ts';
import { matches, type CallInfo } from '../src/match.ts';
import type { Match } from '../src/scenario.ts';

// The shared aiming cases (chaos/match-vectors.json, WI-CHAOS-006): the C# library's tests reproduce the same file, so one scenario aims the same way
// in the Node processes and the services.
const chaosDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'chaos');

interface VectorCall {
  client: string;
  operation: string;
  key: string;
  customer?: string;
  payload?: unknown;
}
interface Vectors {
  contains: { pattern: unknown; value?: unknown; expected: boolean }[];
  matches: { match: Match; call: VectorCall; expected: boolean }[];
  runs: { name: string; scenario: unknown; steps: { call: VectorCall; signals: string[]; disturbs: boolean }[] }[];
}
const vectors = JSON.parse(readFileSync(path.join(chaosDir, 'match-vectors.json'), 'utf8')) as Vectors;
const callOf = (c: VectorCall): CallInfo => ({
  client: c.client,
  operation: c.operation,
  key: c.key,
  customer: c.customer,
  payload: c.payload,
});

describe('the shared aiming vectors', () => {
  test('contains', () => {
    for (const [i, v] of vectors.contains.entries())
      assert.equal(contains(v.pattern, 'value' in v ? v.value : undefined), v.expected, `contains[${i}]`);
  });

  test('matches', () => {
    for (const [i, v] of vectors.matches.entries())
      assert.equal(matches(v.match, callOf(v.call)), v.expected, `matches[${i}]`);
  });

  for (const run of vectors.runs)
    test(`run: ${run.name}`, () => {
      const runtime = new ChaosRuntime(parseScenario(JSON.stringify(run.scenario)));
      for (const [i, step] of run.steps.entries()) {
        const call = callOf(step.call);
        assert.deepEqual(runtime.signal(call), step.signals, `step ${i}: signals`);
        const disturbs = runtime.isOn(call.client) && runtime.appliesTo(call.client, call);
        assert.equal(disturbs, step.disturbs, `step ${i}: disturbs`);
      }
    });
});

describe('a layer asks for each call (as the C# ChaosLayer.Disturbs does)', () => {
  test('disturbs runs the signals, then answers on-and-aimed', () => {
    const runtime = new ChaosRuntime(
      parseScenario(
        JSON.stringify({
          name: 'd',
          seed: 1,
          layers: { bffCatalog: { unavailableRate: 1 } },
          where: { bffCatalog: [{ key: 'listing-chaos-outage-001' }] },
          off: ['bffCatalog'],
          signals: [{ when: { key: 'listing-chaos-outage-on' }, do: 'enable', layer: 'bffCatalog' }],
        }),
      ),
    );
    const layer = runtime.layer('bffCatalog');
    const call = (key: string) => ({
      client: 'bffCatalog',
      operation: 'get',
      key,
      customer: undefined,
      payload: undefined,
    });
    assert.equal(layer.disturbs(call('listing-chaos-outage-001')), false);
    assert.equal(layer.disturbs(call('listing-chaos-outage-on')), false);
    assert.equal(layer.disturbs(call('listing-chaos-outage-001')), true);
    assert.equal(layer.disturbs(call('listing-latte-001')), false);
  });

  test("addRequestFaults adds another process's faults to the request being served, and nothing outside one", () => {
    addRequestFaults(['ordering/payment:lostResponse']);
    const inside = runInRequestScope(undefined, () => {
      addRequestFaults(['ordering/payment:lostResponse', 'catalog/cache:failure']);
      return requestFaults();
    });
    assert.deepEqual(inside, ['catalog/cache:failure', 'ordering/payment:lostResponse']);
  });
});
