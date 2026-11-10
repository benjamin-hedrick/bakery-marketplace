import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applies,
  chaosFromEnv,
  ChaosRuntime,
  indicatorHeaders,
  isAllowed,
  KNOWN_LAYERS,
  loadScenario,
  parseScenario,
  requestFaults,
  runInRequestScope,
  scenarioOf,
  ScenarioError,
  unit,
} from '../src/index.ts';

const chaosDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'chaos');

describe('the decision function', () => {
  // The vectors were computed by an independent implementation (Python); the C# tests read the same file. A 64-bit seed does not survive
  // JSON.parse as a number, so the seed is taken from the source text, as the scenario parser does.
  const file = JSON.parse(
    readFileSync(path.join(chaosDir, 'test-vectors.json'), 'utf8'),
    (key, value: unknown, context?: { source?: string }) =>
      key === 'seed' && typeof value === 'number' && context?.source !== undefined ? BigInt(context.source) : value,
  ) as { vectors: { seed: bigint; layer: string; fault: string; key: string; unit: string }[] };

  for (const v of file.vectors) {
    test(`matches the shared test vector for seed ${v.seed}, ${v.layer}/${v.fault}/${JSON.stringify(v.key)}`, () => {
      assert.equal(unit(v.seed, v.layer, v.fault, v.key), Number(v.unit));
    });
  }

  test('the same inputs give the same number and any change gives another', () => {
    const baseline = unit(1, 'events', 'drop', 'k');
    assert.equal(baseline, unit(1, 'events', 'drop', 'k'));
    for (const other of [
      unit(2, 'events', 'drop', 'k'),
      unit(1, 'cache', 'drop', 'k'),
      unit(1, 'events', 'reorder', 'k'),
      unit(1, 'events', 'drop', 'j'),
    ])
      assert.notEqual(baseline, other);
  });

  test('rate 0 never applies, rate 1 always applies, other rates land near their share', () => {
    const keys = Array.from({ length: 5000 }, (_, i) => `key-${i}`);
    assert.ok(!keys.some((k) => applies(7, 'bff', 'reject', k, 0)));
    assert.ok(keys.every((k) => applies(7, 'bff', 'reject', k, 1)));
    const share = keys.filter((k) => applies(7, 'bff', 'reject', k, 0.3)).length / keys.length;
    assert.ok(share > 0.27 && share < 0.33, `share ${share}`);
  });
});

describe('scenarios', () => {
  test('every committed scenario file loads', () => {
    const files = readdirSync(path.join(chaosDir, 'scenarios')).filter((f) => f.endsWith('.json'));
    assert.ok(files.length >= 4);
    for (const f of files)
      assert.equal(loadScenario(path.join(chaosDir, 'scenarios', f)).name, f.replace(/\.json$/, ''));
  });

  test('the layers and settings are the ones in chaos/layers.json, which the C# library is also tested against', () => {
    const shared = (
      JSON.parse(readFileSync(path.join(chaosDir, 'layers.json'), 'utf8')) as { layers: Record<string, string[]> }
    ).layers;
    assert.deepEqual(
      Object.fromEntries(Object.entries(KNOWN_LAYERS).map(([k, v]) => [k, [...v].sort()])),
      Object.fromEntries(Object.entries(shared).map(([k, v]) => [k, [...v].sort()])),
    );
  });

  test('a 64-bit seed keeps all its digits', () => {
    const s = parseScenario('{ "name": "n", "seed": 9223372036854775807, "layers": {} }');
    assert.equal(s.seed, 9223372036854775807n);
  });

  const mistakes: [string, string][] = [
    ['{ "name": "n", "seed": 1, "layers": { "dispatch": { "latencyMs": 1 } } }', 'not built'],
    ['{ "name": "n", "seed": 1, "layers": { "bff": { "rejectRat": 0.1 } } }', 'no setting'],
    ['{ "name": "n", "seed": 1, "layers": { "bff": { "rejectRate": 1.5 } } }', 'between 0 and 1'],
    ['{ "name": "n", "seed": 1, "layers": { "bff": { "latencyMs": -1 } } }', '0 or more'],
    ['{ "name": "n", "seed": 1, "layers": { "bff": { "rejectStatus": 200 } } }', 'from 400 to 599'],
    ['{ "name": "n", "layers": {} }', 'needs a seed'],
    ['{ "seed": 1, "layers": {} }', 'needs a name'],
    ['{ "name": "n", "seed": 1, "layer": {} }', 'Unexpected'],
    ['{ "name": "n", "seed": 1.5, "layers": {} }', 'whole number'],
    ['{ "name": "n", "seed": 1, "layers": { "bff": { "rejectRate": "high" } } }', 'must be a number'],
    ['not json', 'not valid JSON'],
  ];
  for (const [json, fragment] of mistakes) {
    test(`a mistake fails loudly: ${fragment}`, () => {
      assert.throws(
        () => parseScenario(json),
        (e: unknown) => e instanceof ScenarioError && e.message.includes(fragment),
      );
    });
  }
});

describe('the gate and the environment loader', () => {
  const cases: [string | undefined, string | undefined, boolean][] = [
    ['development', undefined, true],
    ['test', undefined, true],
    ['production', 'dev', true], // the deployed dev stack: the image sets NODE_ENV=production everywhere
    ['production', 'local', true],
    ['production', undefined, false],
    [undefined, undefined, false], // an unset NODE_ENV on a real host is not permission
    ['production', 'uat', false],
    ['production', 'prod', false],
  ];
  for (const [nodeEnv, deployment, allowed] of cases) {
    test(`NODE_ENV ${nodeEnv ?? '(unset)'} with DEPLOYMENT_ENVIRONMENT ${deployment ?? '(unset)'} is ${allowed ? 'allowed' : 'refused'}`, () => {
      assert.equal(isAllowed(nodeEnv, deployment), allowed);
    });
  }

  test('chaos stays off unless it is enabled', () => {
    assert.equal(chaosFromEnv({ NODE_ENV: 'production', CHAOS_SCENARIO: 'flaky-broker' }), undefined);
  });

  test('enabled in a refused environment stops the process at startup', () => {
    assert.throws(
      () => chaosFromEnv({ CHAOS_ENABLED: 'true', CHAOS_SCENARIO: 'flaky-broker', NODE_ENV: 'production' }),
      /Chaos cannot run/,
    );
  });

  test('enabled without a scenario, or with an unknown one, fails at startup', () => {
    assert.throws(() => chaosFromEnv({ CHAOS_ENABLED: 'true', NODE_ENV: 'test' }), /names no scenario/);
    assert.throws(
      () => chaosFromEnv({ CHAOS_ENABLED: 'true', NODE_ENV: 'test', CHAOS_SCENARIO: 'no-such-scenario' }),
      /not found/,
    );
  });

  test('a named scenario is found and loaded', () => {
    const runtime = chaosFromEnv({
      CHAOS_ENABLED: '1',
      NODE_ENV: 'production',
      DEPLOYMENT_ENVIRONMENT: 'dev',
      CHAOS_SCENARIO: 'checkout-trouble',
    });
    assert.equal(runtime?.scenario.name, 'checkout-trouble');
  });
});

describe('the runtime, the journal and the request scope', () => {
  test('only the faults that apply are journaled, and the journal says what the caller saw', () => {
    const runtime = new ChaosRuntime(scenarioOf('n', 3, 'bff', { rejectRate: 0.5 }));
    const layer = runtime.layer('bff');
    const applied = Array.from({ length: 200 }, (_, i) => layer.inject('reject', 'rejectRate', `k${i}`)).filter(
      Boolean,
    ).length;
    assert.ok(applied > 60 && applied < 140);
    assert.equal(runtime.journal.count('bff', 'reject'), applied);
    assert.equal(runtime.journal.summary()['bff:reject'], applied);
  });

  test('a layer the scenario does not have answers no to everything', () => {
    const runtime = new ChaosRuntime(scenarioOf('n', 1, 'bff', { rejectRate: 1 }));
    const other = runtime.layer('bffCatalog');
    assert.equal(other.active, false);
    assert.equal(other.inject('unavailable', 'unavailableRate', 'k'), false);
    assert.equal(other.inOutage, false);
    assert.equal(other.latencyMs, undefined);
  });

  test('the outage window opens and closes on the scenario clock', () => {
    let now = 1_000_000;
    const runtime = new ChaosRuntime(scenarioOf('n', 1, 'bff', { outageFromSeconds: 5, outageWindowSeconds: 10 }), {
      now: () => now,
    });
    const layer = runtime.layer('bff');
    assert.equal(layer.inOutage, false);
    now += 5_000;
    assert.equal(layer.inOutage, true);
    now += 10_000;
    assert.equal(layer.inOutage, false);
  });

  test('a retry of the same operation is judged afresh, and a rerun fails the same calls', async () => {
    const run = async () => {
      const runtime = new ChaosRuntime(scenarioOf('n', 11, 'bffCatalog', { unavailableRate: 0.5 }));
      const layer = runtime.layer('bffCatalog');
      let outcome = '';
      for (let i = 0; i < 40; i++) {
        try {
          await layer.before('listListings', `op-${i}`, 'unavailable', 'unavailableRate', () => new Error('x'));
          outcome += 'o';
        } catch {
          outcome += 'x';
        }
      }
      return outcome;
    };
    const first = await run();
    assert.equal(first, await run());
    assert.ok(first.includes('o') && first.includes('x'));

    const runtime = new ChaosRuntime(scenarioOf('n', 3, 'bffCatalog', { unavailableRate: 0.5 }));
    const layer = runtime.layer('bffCatalog');
    let attempts = 0;
    for (; attempts < 50;) {
      attempts++;
      try {
        await layer.before('same', 'same', 'unavailable', 'unavailableRate', () => new Error('x'));
        break;
      } catch {
        // retry
      }
    }
    assert.ok(attempts < 50);
    assert.equal(runtime.journal.count('bffCatalog', 'unavailable'), attempts - 1);
  });

  test('a request scope collects only its own faults, through the async flow; work outside a request has none', async () => {
    const runtime = new ChaosRuntime(scenarioOf('n', 1, 'bff', { rejectRate: 1, resetRate: 1 }));
    const layer = runtime.layer('bff');
    const request = (fault: string, setting: string) =>
      runInRequestScope('trace', async () => {
        await new Promise((r) => setTimeout(r, 10));
        layer.inject(fault, setting, 'k');
        await new Promise((r) => setTimeout(r, 10));
        return requestFaults();
      });
    const [a, b] = await Promise.all([request('reject', 'rejectRate'), request('reset', 'resetRate')]);
    assert.deepEqual(a, ['bff:reject']);
    assert.deepEqual(b, ['bff:reset']);
    layer.inject('reject', 'rejectRate', 'outside');
    assert.deepEqual(requestFaults(), []);
    assert.equal(runtime.journal.entries.length, 3);
  });

  test('the indicator names the scenario and the faults, and nothing else', () => {
    const runtime = new ChaosRuntime(scenarioOf('flaky', 99, 'bff', { rejectRate: 1 }));
    assert.deepEqual(indicatorHeaders(runtime, []), { 'x-chaos-scenario': 'flaky' });
    assert.deepEqual(indicatorHeaders(runtime, ['bff:reject', 'bffCatalog:unavailable']), {
      'x-chaos-scenario': 'flaky',
      'x-chaos-injected': 'bff:reject,bffCatalog:unavailable',
    });
  });
});
