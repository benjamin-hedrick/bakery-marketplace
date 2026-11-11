import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { chaosScenarioFromEnv, dotnetChaosEnv, nodeChaosEnv } from '../../lib/local-stack.mjs';

// ADR-0024: how a run of the local stack names its chaos scenario. One environment variable, STACK_CHAOS_SCENARIO, the name of a file in chaos/scenarios/;
// the runner turns it into each process's own settings. Nothing in a request can name a scenario.

describe('STACK_CHAOS_SCENARIO', () => {
  test('unset or blank: no chaos, and nothing is added to any process', () => {
    assert.equal(chaosScenarioFromEnv({}), undefined);
    assert.equal(chaosScenarioFromEnv({ STACK_CHAOS_SCENARIO: '  ' }), undefined);
    assert.deepEqual(dotnetChaosEnv(undefined), {});
    assert.deepEqual(nodeChaosEnv(undefined), {});
  });

  test('a scenario file that exists is accepted', () => {
    assert.equal(chaosScenarioFromEnv({ STACK_CHAOS_SCENARIO: 'bff-door' }), 'bff-door');
    assert.equal(chaosScenarioFromEnv({ STACK_CHAOS_SCENARIO: 'web-door' }), 'web-door');
  });

  test('a name that is not a plain scenario name, or has no file, stops the run before anything starts', () => {
    for (const bad of ['../bff-door', 'bff-door.json', 'a/b', 'Bff Door'])
      assert.throws(() => chaosScenarioFromEnv({ STACK_CHAOS_SCENARIO: bad }), /name of a scenario file/);
    assert.throws(() => chaosScenarioFromEnv({ STACK_CHAOS_SCENARIO: 'no-such-scenario' }), /does not exist/);
  });

  test('the .NET services get Chaos__*, the Node processes get CHAOS_* with the local deployment name', () => {
    assert.deepEqual(dotnetChaosEnv('bff-door'), { Chaos__Enabled: 'true', Chaos__Scenario: 'bff-door' });
    assert.deepEqual(nodeChaosEnv('bff-door'), {
      CHAOS_ENABLED: 'true',
      CHAOS_SCENARIO: 'bff-door',
      DEPLOYMENT_ENVIRONMENT: 'local',
    });
  });
});
