import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ADR-0024: chaos scenarios may run only in local Development and the dev deployment. The services refuse to start with chaos on anywhere else,
// and this test is the second guard: no deployment configuration other than the dev environment's names a chaos setting, so UAT and production
// can never be configured to switch it on by a later edit. Text checks only; they do not prove what an applied environment holds.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

/** Every file under a folder, as paths relative to the repository root. */
function filesUnder(dir) {
  const out = [];
  for (const name of readdirSync(path.join(root, dir))) {
    const rel = `${dir}/${name}`;
    if (name === '.terraform' || name === 'node_modules') continue;
    if (statSync(path.join(root, rel)).isDirectory()) out.push(...filesUnder(rel));
    else out.push(rel);
  }
  return out;
}

const CHAOS_SETTING = /\bChaos(__|:)|Deployment__Environment|Deployment:Environment/;

describe('chaos settings in deployment configuration', () => {
  test('only the dev environment may name a chaos or deployment-environment setting', () => {
    const offenders = filesUnder('infra')
      .filter((f) => !f.startsWith('infra/environments/dev/'))
      .filter((f) => CHAOS_SETTING.test(read(f)));
    assert.deepEqual(offenders, [], `chaos settings outside infra/environments/dev: ${offenders.join(', ')}`);
  });

  test('the pull-request and dev pipelines do not switch chaos on', () => {
    for (const file of ['azure-pipelines.yml', 'azure-pipelines-dev.yml']) {
      const code = read(file)
        .split('\n')
        .filter((l) => !l.trim().startsWith('#'))
        .join('\n');
      assert.doesNotMatch(code, /Chaos(__|:)Enabled/, `${file} must not set Chaos__Enabled`);
    }
  });

  test('the local Compose file does not turn chaos on by default', () => {
    const code = read('docker-compose.yml')
      .split('\n')
      .filter((l) => !l.trim().startsWith('#'))
      .join('\n');
    assert.doesNotMatch(code, /Chaos__Enabled:\s*"?true/i);
  });

  test('every scenario file under chaos/scenarios names a seed and at least one layer', () => {
    for (const file of filesUnder('chaos/scenarios').filter((f) => f.endsWith('.json'))) {
      const scenario = JSON.parse(read(file));
      assert.equal(typeof scenario.name, 'string', file);
      assert.ok(Number.isInteger(scenario.seed), `${file} needs a whole-number seed`);
      assert.ok(Object.keys(scenario.layers ?? {}).length > 0, `${file} needs a layer`);
    }
  });
});
