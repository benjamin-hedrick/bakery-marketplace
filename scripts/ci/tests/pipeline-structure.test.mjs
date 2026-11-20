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

  test('keeps every job it had, and adds the terraform and mobile jobs', () => {
    for (const job of ['secrets', 'docs', 'dotnet', 'bff', 'web', 'skeleton', 'terraform', 'mobile']) {
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

describe('azure-pipelines-dev.yml (manual dev operations: a real read-only plan, the rest a rehearsal)', () => {
  const file = 'azure-pipelines-dev.yml';
  const text = code(file);
  /** The text of one stage, from its "- stage:" line to the next one. */
  const stage = (name) => {
    const start = text.indexOf(`- stage: ${name}\n`);
    assert.ok(start >= 0, `no stage ${name}`);
    const next = text.indexOf('- stage: ', start + 1);
    return text.slice(start, next < 0 ? undefined : next);
  };

  test('never starts by itself', () => {
    assert.match(text, /^trigger: none$/m);
    assert.match(text, /^pr: none$/m);
  });

  test('the only service connection is the read-only bakery-plan, and only the plan stage uses it', () => {
    const connections = [...text.matchAll(/azureSubscription: (\S+)/g)].map((m) => m[1]);
    assert.ok(connections.length > 0, 'the plan stage should use the plan connection');
    assert.deepEqual([...new Set(connections)], ['bakery-plan']);
    const outside = text.replace(stage('infra_plan'), '');
    assert.doesNotMatch(
      outside,
      /azureSubscription|connectedServiceName|AzureCLI@|AzureResourceManager|AzureKeyVault@/,
    );
    assert.doesNotMatch(text, /bakery-deploy/);
  });

  test('real terraform and az commands run only in the plan stage, every plan there is unlocked and read-only, and nothing applies', () => {
    const outside = text.replace(stage('infra_plan'), '');
    for (const line of outside.split('\n')) {
      if (/^\s*(-\s*)?(terraform|az)\s/.test(line))
        assert.fail(`a real command runs outside the plan stage: ${line.trim()}`);
    }
    for (const line of outside.split('\n').filter((l) => /terraform (plan|apply|show)|az containerapp/.test(l))) {
      assert.match(line, /REHEARSAL|displayName/, line.trim());
    }
    const plan = stage('infra_plan');
    assert.doesNotMatch(plan, /terraform\s+(\S+\s+)?(apply|destroy|import|state|force-unlock|taint)\b/);
    assert.doesNotMatch(plan, /\baz\s+(containerapp|keyvault|role|cosmosdb|acr)\b/);
    const plans = [...plan.matchAll(/terraform\s.*\bplan\s.*$/gm)].map((m) => m[0]);
    assert.ok(plans.length > 0);
    for (const p of plans) assert.match(p, /-lock=false/, p);
  });

  test('the plan stage publishes only the value-free summary, never the saved plan or its JSON', () => {
    const plan = stage('infra_plan');
    const published = [...plan.matchAll(/- publish: (\S+)/g)].map((m) => m[1]);
    assert.deepEqual(published, ['$(Build.ArtifactStagingDirectory)/plan-summary']);
    assert.match(plan, /node scripts\/ci\/plan-summary\.mjs --plan "\$json"/);
    assert.match(plan, /rm -f "\$json" infra\/environments\/dev\/tfplan/);
  });

  test('the real plan is the default, and both plan modes set hasChanges on a step named plan (what the apply stage reads)', () => {
    assert.match(text, /- name: planMode\n(.*\n){2}\s+default: real\n/);
    const plan = stage('infra_plan');
    assert.match(plan, /\{\{ if eq\(parameters\.planMode, 'rehearsal'\) \}\}:[\s\S]*?name: plan\n/);
    assert.match(plan, /\{\{ if eq\(parameters\.planMode, 'real'\) \}\}:[\s\S]*?- task: AzureCLI@2\n\s+name: plan\n/);
  });

  // Rules for the post-apply secret step, decided 2026-11-20 before it is built (docs/architecture/secrets-and-sensitive-values.md): a secret
  // never goes on a command line (where the process list and a traced shell would show it) and the shell is never traced.
  test('a secret is written to Key Vault only from a file, never as a command-line value, and no step traces its shell', () => {
    for (const line of text.split('\n').filter((l) => /keyvault secret set/.test(l))) {
      assert.match(line, /--file /, line.trim());
      assert.doesNotMatch(line, /--value\b/, line.trim());
    }
    assert.doesNotMatch(text, /^\s*set -[a-z]*x|set -o xtrace|bash -x/m);
  });

  test('the real Terraform is pinned and its download checked', () => {
    assert.match(stage('infra_plan'), /TF_ZIP_SHA256: [0-9a-f]{64}\n/);
    assert.match(stage('infra_plan'), /sha256sum -c -/);
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
