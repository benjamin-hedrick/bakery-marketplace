import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Text checks on the pipeline files (there is no YAML parser in this repository, and Azure Pipelines has no local validator). They hold the
// invariants that matter for safety, so a later edit cannot quietly break them. They do NOT prove the YAML is accepted by Azure DevOps or that a
// gate works: that is what the rehearsal run is for (docs/operations/runbooks/prove-the-pipeline-gates.md).
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const lines = (file) => read(file).split('\n');
/** The file without comment lines. */
const code = (file) =>
  lines(file)
    .filter((l) => !l.trim().startsWith('#'))
    .join('\n');

describe('azure-pipelines.yml (the pull-request checks)', () => {
  const file = 'azure-pipelines.yml';

  test('still runs only on pull requests into main and by hand', () => {
    assert.match(code(file), /^trigger: none$/m);
    assert.match(code(file), /^pr:\n {2}branches:\n {4}include: \[main\]\n {2}drafts: false$/m);
  });

  test('keeps every job it had, and adds the terraform job', () => {
    for (const job of ['secrets', 'docs', 'dotnet', 'bff', 'web', 'skeleton', 'terraform']) {
      assert.match(code(file), new RegExp(`^ {2}- job: ${job}$`, 'm'), job);
    }
  });

  test('has no Azure service connection and no deploy step: pull-request runs reach nothing in Azure', () => {
    assert.doesNotMatch(
      code(file),
      /azureSubscription|connectedServiceName|AzureCLI@|AzureResourceManager|environment:|deployment:/,
    );
  });
});

describe('azure-pipelines-dev.yml (manual dev operations, currently a rehearsal)', () => {
  const file = 'azure-pipelines-dev.yml';
  const text = code(file);

  test('never starts by itself', () => {
    assert.match(text, /^trigger: none$/m);
    assert.match(text, /^pr: none$/m);
  });

  test('has no Azure service connection: a rehearsal creates nothing and needs no credential', () => {
    assert.doesNotMatch(text, /azureSubscription|connectedServiceName|AzureCLI@|AzureResourceManager|AzureKeyVault@/);
  });

  test('every echo of a real command is marked as a rehearsal, and no step runs terraform or az', () => {
    for (const line of text.split('\n')) {
      if (/^\s*(-\s*)?(terraform|az)\s/.test(line)) assert.fail(`a real command runs: ${line.trim()}`);
    }
    for (const line of text.split('\n').filter((l) => /terraform (plan|apply|show)|az containerapp/.test(l))) {
      assert.match(line, /REHEARSAL|displayName/, line.trim());
    }
  });

  test('only a manual run goes on, and a destroy needs the typed environment name', () => {
    assert.match(text, /Build\.Reason\)" != "Manual"/);
    assert.match(text, /parameters\.confirmEnvironment \}\}" != "\$\(ENVIRONMENT_NAME\)"/);
  });

  test('every deployment job is bound to one of the three gated environments, and each is used', () => {
    const used = [...text.matchAll(/^\s+environment: (\S+)$/gm)].map((m) => m[1]);
    assert.deepEqual([...used].sort(), ['dev-app', 'dev-destroy', 'dev-infra']);
    assert.equal([...text.matchAll(/^\s+- deployment: /gm)].length, 3);
  });

  test('the infrastructure apply runs only when the plan has changes, and the application deploy tolerates that skip', () => {
    assert.match(
      text,
      /stage: infra_apply[\s\S]*?condition: and\(succeeded\(\), eq\(dependencies\.infra_plan\.outputs\['plan\.plan\.hasChanges'\], 'true'\)\)/,
    );
    assert.match(text, /stage: app_deploy[\s\S]*?- infra_apply[\s\S]*?'Skipped'/);
  });

  test('the destroy guard runs before the destroy approval, and the destroy stage depends on the guard stage', () => {
    const guard = text.indexOf('scripts/ci/destroy-guard.mjs');
    const approval = text.indexOf('environment: dev-destroy');
    assert.ok(guard > 0 && approval > guard, 'the guard step must come before the dev-destroy deployment');
    assert.match(text, /stage: destroy_apply[\s\S]*?dependsOn: destroy_plan/);
  });

  test('the stages after the inputs check depend on it', () => {
    assert.match(text, /stage: infra_plan[\s\S]*?dependsOn: inputs/);
    assert.match(text, /stage: destroy_plan[\s\S]*?dependsOn: inputs/);
  });
});

// The shell in the rehearsal steps is plain sh with Azure's macros in it. These tests take the step text from the file, replace the macros with
// values, and run it, so the logic that decides "stop" and "has changes" is exercised and not only read.
function stepScript(displayName) {
  const all = lines('azure-pipelines-dev.yml');
  const at = all.findIndex((l) => l.includes(`displayName: ${displayName}`));
  assert.ok(at > 0, `no step with the display name "${displayName}"`);
  let start = at;
  while (start > 0 && !/- script: [|>]/.test(all[start])) start -= 1;
  const body = [];
  for (let i = start + 1; i < at; i += 1) {
    if (/^\s+(name|displayName): /.test(all[i])) break;
    body.push(all[i]);
  }
  const indent = Math.min(...body.filter((l) => l.trim()).map((l) => /^ */.exec(l)[0].length));
  return body.map((l) => l.slice(indent)).join('\n');
}
function runStep(script, values) {
  const filled = script
    .replaceAll('$(Build.SourceBranch)', values.branch ?? 'refs/heads/main')
    .replaceAll('$(Build.Reason)', values.reason ?? 'Manual')
    .replaceAll('$(ENVIRONMENT_NAME)', 'dev')
    .replaceAll('${{ parameters.action }}', values.action ?? 'deploy')
    .replaceAll('${{ parameters.confirmEnvironment }}', values.confirm ?? '')
    .replaceAll('${{ parameters.simulateInfrastructureChanges }}', values.simulate ?? 'True');
  return spawnSync('sh', ['-c', filled], { encoding: 'utf8' });
}

describe('the logic in the rehearsal steps, run with the macros filled in', () => {
  const inputs = () =>
    stepScript('Manual run, and for a destroy the typed confirmation (must equal the environment name)');

  test('the input check passes a manual deploy, and a manual destroy with the right confirmation', () => {
    assert.equal(runStep(inputs(), { action: 'deploy' }).status, 0);
    assert.equal(runStep(inputs(), { action: 'destroy', confirm: 'dev' }).status, 0);
  });

  test('the input check stops a run that was not queued by hand', () => {
    for (const reason of ['PullRequest', 'IndividualCI', 'Schedule']) {
      const r = runStep(inputs(), { reason });
      assert.equal(r.status, 1, reason);
      assert.match(r.stdout, /only when queued by hand/);
    }
  });

  test('the input check stops a destroy whose confirmation is not exactly the environment name', () => {
    for (const confirm of ['', 'prod', 'DEV', 'dev ', 'development']) {
      const r = runStep(inputs(), { action: 'destroy', confirm });
      assert.equal(r.status, 1, JSON.stringify(confirm));
      assert.match(r.stdout, /confirmation must be exactly/);
    }
  });

  test('the confirmation is not asked for on a deploy', () => {
    assert.equal(runStep(inputs(), { action: 'deploy', confirm: 'anything' }).status, 0);
  });

  test('the simulated plan reports changes or none, in the form the apply stage reads (Azure prints a boolean as True or False)', () => {
    const plan = () => stepScript('Plan (rehearsal)');
    for (const [simulate, expected] of [
      ['True', 'true'],
      ['true', 'true'],
      ['False', 'false'],
      ['false', 'false'],
    ]) {
      const r = runStep(plan(), { simulate });
      assert.equal(r.status, 0);
      assert.ok(
        r.stdout.includes(`##vso[task.setvariable variable=hasChanges;isOutput=true]${expected}`),
        `${simulate}: ${r.stdout}`,
      );
    }
  });
});
