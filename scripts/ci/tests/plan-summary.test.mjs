import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkExitCode, summarisePlan } from '../plan-summary.mjs';

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'plan-summary.mjs');

// Values a real dev plan carries: names, ids and, once the stack exists, keys. None may reach the summary.
const SECRET = 'cosmos-primary-key-AAAAsecretBBBB==';
const NAME = 'kv-private-name-x1';
const ID = '/subscriptions/11111111-2222-3333-4444-555555555555/resourceGroups/rg-bakery-dev';
const change = (address, actions, mode = 'managed') => ({
  address,
  mode,
  type: address.split('.')[0],
  change: {
    actions,
    before: actions.includes('create') && actions.length === 1 ? null : { id: ID, name: NAME, primary_key: SECRET },
    after: actions.includes('delete') && actions.length === 1 ? null : { name: NAME, primary_key: SECRET },
    after_unknown: { id: true },
    before_sensitive: { primary_key: true },
    after_sensitive: { primary_key: true },
  },
});
const plan = {
  format_version: '1.2',
  terraform_version: '1.17.1',
  variables: { key_vault_name: { value: NAME } },
  resource_changes: [
    change('azurerm_key_vault.kv', ['create']),
    change('azurerm_cosmosdb_account.cosmos', ['update']),
    change('azurerm_container_app.web', ['delete', 'create']),
    change('azurerm_role_assignment.old', ['delete']),
    change('azurerm_log_analytics_workspace.logs', ['no-op']),
    change('data.azurerm_resource_group.env', ['read'], 'data'),
  ],
  output_changes: {
    key_vault_name: { actions: ['create'], after: NAME },
    unchanged: { actions: ['no-op'], after: 'x' },
  },
  prior_state: { values: { root_module: { resources: [{ values: { primary_key: SECRET } }] } } },
};

describe('the plan summary', () => {
  test('keeps each changed resource address with one action word, skips no-ops and data reads, and counts them', () => {
    const s = summarisePlan(plan);
    assert.deepEqual(s.changes, [
      { address: 'azurerm_key_vault.kv', action: 'create' },
      { address: 'azurerm_cosmosdb_account.cosmos', action: 'update' },
      { address: 'azurerm_container_app.web', action: 'replace' },
      { address: 'azurerm_role_assignment.old', action: 'delete' },
    ]);
    assert.deepEqual(s.counts, { create: 1, update: 1, replace: 1, delete: 1, read: 0 });
    assert.deepEqual(s.outputs, ['key_vault_name']);
    assert.equal(s.terraformVersion, '1.17.1');
    assert.equal(s.hasChanges, true);
  });

  test('copies no attribute value: no key, name or id from the plan appears in the summary', () => {
    const text = JSON.stringify(summarisePlan(plan));
    for (const value of [SECRET, NAME, ID, '11111111-2222-3333-4444-555555555555']) {
      assert.ok(!text.includes(value), `the summary contains ${value}`);
    }
  });

  test('an empty plan has no changes', () => {
    const s = summarisePlan({ format_version: '1.2', resource_changes: [] });
    assert.equal(s.hasChanges, false);
    assert.deepEqual(s.changes, []);
  });

  test('refuses something that is not a plan', () => {
    assert.throws(() => summarisePlan(null));
    assert.throws(() => summarisePlan({ resource_changes: 'nope' }));
  });

  test('the exit code must agree with the plan, and a failed plan is refused', () => {
    const changed = summarisePlan(plan);
    const empty = summarisePlan({ resource_changes: [] });
    assert.equal(checkExitCode(2, changed), undefined);
    assert.equal(checkExitCode(0, empty), undefined);
    assert.match(checkExitCode(0, changed), /no changes/);
    assert.match(checkExitCode(2, empty), /lists none/);
    assert.match(checkExitCode(1, empty), /failed/);
  });
});

describe('the command line', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'plan-summary-'));
  const planPath = path.join(dir, 'plan.json');
  const outPath = path.join(dir, 'summary.json');
  writeFileSync(planPath, JSON.stringify(plan));
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

  test('writes the summary and sets hasChanges for the pipeline, printing no value', () => {
    const r = run('--plan', planPath, '--exit-code', '2', '--out', outPath);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes('##vso[task.setvariable variable=hasChanges;isOutput=true]true'));
    assert.ok(!r.stdout.includes(SECRET) && !r.stdout.includes(NAME));
    assert.equal(JSON.parse(readFileSync(outPath, 'utf8')).changes.length, 4);
  });

  test('refuses when the exit code and the plan disagree, and on bad usage', () => {
    assert.equal(run('--plan', planPath, '--exit-code', '0', '--out', outPath).status, 1);
    assert.equal(run('--plan', planPath, '--out', outPath).status, 2);
    assert.equal(run('--plan', path.join(dir, 'missing.json'), '--exit-code', '2', '--out', outPath).status, 2);
  });
});
