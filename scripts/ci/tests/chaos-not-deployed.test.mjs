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

const CHAOS_SETTING =
  /\bChaos(__|:)|Deployment__Environment|Deployment:Environment|CHAOS_ENABLED|CHAOS_SCENARIO|DEPLOYMENT_ENVIRONMENT/;

describe('chaos settings in deployment configuration', () => {
  // Since WI-DEP-002 step 2a the dev resources are in the shared environment module, which every environment root calls. The rule is now: only the
  // module names these settings, and only with the environment's own name (var.environment); only the dev root names itself "dev".
  const MODULE = 'infra/modules/environment/';
  const code = (file) =>
    read(file)
      .split('\n')
      .filter((l) => !l.trim().startsWith('#'))
      .join('\n');

  test('only the environment module may name a chaos or deployment-environment setting', () => {
    const offenders = filesUnder('infra')
      .filter((f) => !f.startsWith(MODULE) && !f.startsWith('infra/environments/dev/'))
      .filter((f) => CHAOS_SETTING.test(read(f)));
    assert.deepEqual(offenders, [], `chaos settings outside the environment module: ${offenders.join(', ')}`);
  });

  test("the module sets the environment's name only from var.environment", () => {
    const lines = filesUnder(MODULE)
      .filter((f) => f.endsWith('.tf'))
      .flatMap((f) => code(f).split('\n'))
      .filter((l) => /Deployment__Environment|DEPLOYMENT_ENVIRONMENT/.test(l));
    assert.ok(lines.length > 0, 'the module names the environment for its apps');
    for (const line of lines) assert.match(line, /=\s*var\.environment\b/, line.trim());
  });

  test('only the dev root names itself dev', () => {
    const roots = readdirSync(path.join(root, 'infra/environments')).filter((d) =>
      statSync(path.join(root, 'infra/environments', d)).isDirectory(),
    );
    assert.ok(roots.includes('dev'));
    for (const dir of roots.filter((d) => d !== 'dev'))
      for (const f of filesUnder(`infra/environments/${dir}`).filter((x) => x.endsWith('.tf') || x.endsWith('.tfvars')))
        assert.doesNotMatch(code(f), /\benvironment\s*=\s*"dev"/, `${f} must not name itself dev`);
    assert.match(code('infra/environments/dev/main.tf'), /\benvironment\s*=\s*"dev"/);
  });

  test('the pull-request and dev pipelines do not switch chaos on', () => {
    for (const file of [
      'azure-pipelines.yml',
      'azure-pipelines-dev.yml',
      'pipelines/templates/environment-stages.yml',
    ]) {
      const code = read(file)
        .split('\n')
        .filter((l) => !l.trim().startsWith('#'))
        .join('\n');
      assert.doesNotMatch(code, /Chaos(__|:)Enabled|CHAOS_ENABLED/, `${file} must not switch chaos on`);
    }
  });

  test('the local Compose file does not turn chaos on by default', () => {
    const code = read('docker-compose.yml')
      .split('\n')
      .filter((l) => !l.trim().startsWith('#'))
      .join('\n');
    assert.doesNotMatch(code, /(Chaos__Enabled|CHAOS_ENABLED):\s*"?true/i);
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
