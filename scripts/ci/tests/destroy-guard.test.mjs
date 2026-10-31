import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDestroyPlan, resourceGroupOf } from '../destroy-guard.mjs';

const SUB = '/subscriptions/00000000-0000-0000-0000-000000000000';
const expected = { environment: 'dev', resourceGroup: 'rg-bakery-dev', confirm: 'dev' };

const del = (address, type, before) => ({
  address,
  type,
  mode: 'managed',
  change: { actions: ['delete'], before, after: null },
});
const devGroup = del('azurerm_resource_group.env', 'azurerm_resource_group', {
  name: 'rg-bakery-dev',
  id: `${SUB}/resourceGroups/rg-bakery-dev`,
  tags: { Stack: 'environment' },
});
const devApp = del('azurerm_container_app.web', 'azurerm_container_app', {
  name: 'web',
  resource_group_name: 'rg-bakery-dev',
  tags: {},
});
const devRole = del('azurerm_role_assignment.kv', 'azurerm_role_assignment', {
  scope: `${SUB}/resourceGroups/rg-bakery-dev/providers/Microsoft.KeyVault/vaults/kv-bakery-dev`,
});
const plan = (...changes) => ({ format_version: '1.2', resource_changes: changes });

describe('the destroy guard', () => {
  test('passes a pure destroy confined to the environment resource group, and lists what goes', () => {
    const result = checkDestroyPlan(plan(devGroup, devApp, devRole), expected);
    assert.equal(result.ok, true, result.problems.join('; '));
    assert.deepEqual(result.deleted, [
      'azurerm_resource_group.env',
      'azurerm_container_app.web',
      'azurerm_role_assignment.kv',
    ]);
  });

  test('refuses when the typed confirmation is not the environment name', () => {
    for (const confirm of ['', 'prod', 'DEV', undefined]) {
      const result = checkDestroyPlan(plan(devApp), { ...expected, confirm });
      assert.equal(result.ok, false);
      assert.match(result.problems.join(' '), /confirmation/);
    }
  });

  test('refuses a resource in another resource group, however it names it', () => {
    const other = del('azurerm_container_app.x', 'azurerm_container_app', { resource_group_name: 'rg-bakery-uat' });
    const byId = del('azurerm_role_assignment.y', 'azurerm_role_assignment', {
      scope: `${SUB}/resourceGroups/rg-bakery-foundation/providers/Microsoft.ContainerRegistry/registries/r`,
    });
    const result = checkDestroyPlan(plan(devApp, other, byId), expected);
    assert.equal(result.ok, false);
    assert.equal(result.problems.length, 2);
    assert.match(result.problems[0], /rg-bakery-uat/);
    assert.match(result.problems[1], /rg-bakery-foundation/);
  });

  test('compares resource group names without regard to case (Azure ids vary)', () => {
    const upper = del('azurerm_role_assignment.z', 'azurerm_role_assignment', {
      scope: `${SUB}/resourcegroups/RG-BAKERY-DEV/providers/x/y/z`,
    });
    assert.equal(checkDestroyPlan(plan(upper), expected).ok, true);
  });

  test('refuses anything tagged as persistent foundation, even inside the environment group', () => {
    const tagged = del('azurerm_container_registry.acr', 'azurerm_container_registry', {
      resource_group_name: 'rg-bakery-dev',
      tags: { Stack: 'foundation', Lifetime: 'persistent' },
    });
    const result = checkDestroyPlan(plan(tagged), expected);
    assert.equal(result.ok, false);
    assert.match(result.problems[0], /persistent foundation/);
  });

  test('refuses a plan that creates, updates or replaces anything: a teardown only destroys', () => {
    for (const actions of [['create'], ['update'], ['delete', 'create'], ['create', 'delete']]) {
      const result = checkDestroyPlan(
        plan(devApp, {
          address: 'azurerm_x.y',
          type: 'azurerm_x',
          mode: 'managed',
          change: { actions, before: { resource_group_name: 'rg-bakery-dev' } },
        }),
        expected,
      );
      assert.equal(result.ok, false, actions.join());
      assert.match(result.problems.join(' '), /not a pure delete/);
    }
  });

  test('ignores data source reads and no-ops', () => {
    const read = {
      address: 'data.azurerm_client_config.current',
      type: 'azurerm_client_config',
      mode: 'data',
      change: { actions: ['read'] },
    };
    const noop = {
      address: 'azurerm_x.keep',
      type: 'azurerm_x',
      mode: 'managed',
      change: { actions: ['no-op'], before: { resource_group_name: 'elsewhere' } },
    };
    assert.equal(checkDestroyPlan(plan(read, noop, devApp), expected).ok, true);
  });

  test('fails closed: a change whose resource group cannot be determined is refused, except types that live in none', () => {
    const unknown = del('azurerm_thing.t', 'azurerm_thing', { name: 'thing' });
    const random = del('random_string.suffix', 'random_string', { length: 4 });
    assert.equal(checkDestroyPlan(plan(unknown), expected).ok, false);
    assert.equal(checkDestroyPlan(plan(random, devApp), expected).ok, true);
  });

  test('refuses a foundation or state group, or one that does not carry the environment name, as the target', () => {
    for (const resourceGroup of ['rg-bakery-foundation', 'rg-bakery-tfstate', 'rg-bakery-uat', '']) {
      const result = checkDestroyPlan(plan(), { ...expected, resourceGroup });
      assert.equal(result.ok, false, resourceGroup);
    }
  });

  test('refuses something that is not a plan', () => {
    for (const bad of [null, {}, { resource_changes: 'no' }]) assert.equal(checkDestroyPlan(bad, expected).ok, false);
  });

  test('reads the resource group from the attribute Terraform records for each kind of resource', () => {
    assert.equal(resourceGroupOf(devGroup), 'rg-bakery-dev');
    assert.equal(resourceGroupOf(devApp), 'rg-bakery-dev');
    assert.equal(resourceGroupOf(devRole), 'rg-bakery-dev');
    assert.equal(
      resourceGroupOf(
        del('a.b', 'azurerm_consumption_budget_resource_group', { resource_group_id: `${SUB}/resourceGroups/rg-x` }),
      ),
      'rg-x',
    );
    assert.equal(resourceGroupOf(del('a.b', 'azurerm_thing', {})), undefined);
  });
});

describe('the destroy guard command', () => {
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'destroy-guard.mjs');
  const run = (planObject, args) => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'guard-')), 'plan.json');
    writeFileSync(file, JSON.stringify(planObject));
    return spawnSync(process.execPath, [script, '--plan', file, ...args], { encoding: 'utf8' });
  };
  const good = ['--environment', 'dev', '--resource-group', 'rg-bakery-dev', '--confirm', 'dev'];

  test('exits 0 for a safe plan, 1 for a refused one, 2 for a missing or unreadable plan', () => {
    assert.equal(run(plan(devGroup, devApp), good).status, 0);
    assert.equal(
      run(plan(devApp), ['--environment', 'dev', '--resource-group', 'rg-bakery-dev', '--confirm', 'oops']).status,
      1,
    );
    assert.equal(spawnSync(process.execPath, [script], { encoding: 'utf8' }).status, 2);
    assert.equal(
      spawnSync(process.execPath, [script, '--plan', path.join(tmpdir(), 'no-such-file.json'), ...good], {
        encoding: 'utf8',
      }).status,
      2,
    );
  });

  test('prints the refusal reasons', () => {
    const r = run(
      plan(del('azurerm_container_app.x', 'azurerm_container_app', { resource_group_name: 'rg-other' })),
      good,
    );
    assert.equal(r.status, 1);
    assert.match(r.stderr, /REFUSED/);
    assert.match(r.stderr, /rg-other/);
  });
});
