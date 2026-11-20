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

describe('azure-pipelines-dev.yml (manual dev operations: real plan, apply and teardown; the app deploy a rehearsal)', () => {
  const file = 'azure-pipelines-dev.yml';
  const text = code(file);
  /** The text of one stage, from its "- stage:" line to the next one. */
  const stage = (name) => {
    const start = text.indexOf(`- stage: ${name}\n`);
    assert.ok(start >= 0, `no stage ${name}`);
    const next = text.indexOf('- stage: ', start + 1);
    return text.slice(start, next < 0 ? undefined : next);
  };
  /** The real branch of a stage (the part under its planMode 'real' condition). */
  const real = (name) => {
    const s = stage(name);
    const at = s.indexOf("{{ if eq(parameters.planMode, 'real') }}:");
    assert.ok(at >= 0, `${name} has no real branch`);
    return s.slice(at);
  };
  const lines = (t) => t.split('\n');

  test('never starts by itself', () => {
    assert.match(text, /^trigger: none$/m);
    assert.match(text, /^pr: none$/m);
  });

  test('only the two pipeline connections are used: bakery-plan in the plan stages, bakery-deploy only in the approved deployment jobs', () => {
    const connections = [...text.matchAll(/azureSubscription: (\S+)/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(connections)].sort(), ['bakery-deploy', 'bakery-plan']);
    for (const name of ['infra_plan', 'destroy_plan']) assert.doesNotMatch(stage(name), /bakery-deploy/, name);
    for (const name of ['infra_apply', 'destroy_apply']) {
      assert.doesNotMatch(stage(name), /bakery-plan/, name);
      assert.match(stage(name), /- deployment: /, `${name} must be a deployment job (an approval)`);
    }
    assert.doesNotMatch(stage('app_deploy'), /azureSubscription|AzureCLI@|connectedServiceName/);
  });

  test('every deployment job is bound to one of the three gated environments, and each is used', () => {
    const used = [...text.matchAll(/^\s+environment: (\S+)$/gm)].map((m) => m[1]);
    assert.deepEqual([...used].sort(), ['dev-app', 'dev-destroy', 'dev-infra']);
    assert.equal([...text.matchAll(/^\s+- deployment: /gm)].length, 3);
  });

  test('the application deploy is still a rehearsal: no real command runs in it', () => {
    for (const line of lines(stage('app_deploy'))) {
      if (/^\s*(-\s*)?(terraform|az|node)\s/.test(line)) assert.fail(`a real command runs: ${line.trim()}`);
    }
  });

  test('the plan stages plan from the state without the lock (the read-only identity reads nothing in Azure, no secret); neither applies', () => {
    const plan = real('infra_plan');
    const destroy = real('destroy_plan');
    for (const [name, s] of [
      ['infra_plan', plan],
      ['destroy_plan', destroy],
    ]) {
      const plans = [...s.matchAll(/terraform\s.*\bplan\s.*$/gm)].map((m) => m[0]);
      assert.equal(plans.length, 1, name);
      assert.match(plans[0], /-lock=false/, name);
      // Register 213: refreshing a Key Vault secret reads its value, which the plan identity may not do (first apply, 2026-11-20).
      assert.match(plans[0], /-refresh=false/, name);
      assert.doesNotMatch(s, /terraform\s+(\S+\s+)?(apply|destroy|import|state|force-unlock|taint)\b/, name);
    }
    assert.match(destroy, /plan -destroy .*-refresh=false/);
  });

  test('the apply re-plans from the state like the approved plan, so drift cannot make every run refuse', () => {
    const replans = [...real('infra_apply').matchAll(/terraform\s.*\bplan\s.*$/gm)].map((m) => m[0]);
    assert.equal(replans.length, 1);
    assert.match(replans[0], /-refresh=false/);
  });

  test('an apply happens only after a re-plan under the lock that is checked against the approved summary, in the same step', () => {
    for (const [name, artifact] of [
      ['infra_apply', 'dev-plan-summary'],
      ['destroy_apply', 'dev-destroy-summary'],
    ]) {
      const s = real(name);
      assert.match(s, new RegExp(`- download: current\\n\\s+artifact: ${artifact}\\n`), name);
      const replan = s.search(
        /terraform -chdir=\S+ plan (-destroy )?-input=false (-refresh=false )?-detailed-exitcode -out=tfplan/,
      );
      const check = s.indexOf(`--expect "$(Pipeline.Workspace)/${artifact}/${artifact}.json"`);
      const apply = s.indexOf('apply -input=false tfplan');
      assert.ok(replan > 0 && check > replan && apply > check, `${name}: re-plan, then the check, then the apply`);
      assert.doesNotMatch(s.slice(replan, apply), /-lock=false/, `${name}: the re-plan takes the lock`);
      assert.equal(s.split('apply -input=false').length - 1, 1, `${name}: one apply`);
    }
    const outside = text.replace(stage('infra_apply'), '').replace(stage('destroy_apply'), '');
    assert.doesNotMatch(outside, /terraform\s+(-chdir=\S+\s+)?apply\b/);
  });

  test('the deploy identity checks itself before it plans or applies', () => {
    for (const name of ['infra_apply', 'destroy_apply']) {
      const s = real(name);
      const check = s.indexOf('identity-check.mjs --identity deploy');
      assert.ok(check > 0 && check < s.indexOf('dev-stack-env.sh'), name);
    }
    for (const name of ['infra_plan', 'destroy_plan']) {
      const s = real(name);
      const check = s.indexOf('identity-check.mjs --identity plan');
      assert.ok(check > 0 && check < s.indexOf('dev-stack-env.sh'), name);
      // The deploy identity cannot see all of its own roles (not those in rg-bakery-tfstate); the plan identity checks the full set before
      // any approval (2026-11-20).
      const full = s.indexOf('identity-check.mjs --identity deploy --principal "$DEPLOY_PRINCIPAL_ID"');
      assert.ok(
        full > 0 && full < s.indexOf('dev-stack-env.sh'),
        `${name}: the plan identity checks the deploy identity`,
      );
    }
  });

  test('the destroy guard runs on the real destroy plan before the approval, and again before the destroy', () => {
    const guardBefore = real('destroy_plan').indexOf('node scripts/ci/destroy-guard.mjs --plan "$json"');
    assert.ok(guardBefore > 0);
    const s = real('destroy_apply');
    const guardAfter = s.indexOf('node scripts/ci/destroy-guard.mjs --plan "$json"');
    assert.ok(guardAfter > 0 && guardAfter < s.indexOf('apply -input=false tfplan'));
    assert.match(stage('destroy_apply'), /dependsOn: destroy_plan/);
    assert.match(
      stage('destroy_apply'),
      /condition: and\(succeeded\(\), eq\(dependencies\.destroy_plan\.outputs\['guard\.plan\.hasChanges'\], 'true'\)\)/,
    );
    assert.match(s, /az resource list -g "\$\(RESOURCE_GROUP\)"/, 'the teardown checks the group is empty');
  });

  test('only the value-free summaries are published, never a saved plan or its JSON', () => {
    const published = [...text.matchAll(/- publish: (\S+)/g)].map((m) => m[1]).sort();
    assert.deepEqual(published, [
      '$(Build.ArtifactStagingDirectory)/destroy-summary',
      '$(Build.ArtifactStagingDirectory)/plan-summary',
    ]);
    for (const name of ['infra_plan', 'destroy_plan'])
      assert.match(real(name), /rm -f "\$json" infra\/environments\/dev\/tfplan/, name);
  });

  test('Terraform signs in with Azure DevOps token refresh, and the budget e-mail comes in as a mapped (secret) variable', () => {
    const steps = [...text.matchAll(/source scripts\/ci\/dev-stack-env\.sh "\$\{(\w+):-\}"/g)].map((m) => m[1]);
    assert.deepEqual(steps.sort(), [
      'DEPLOY_CONNECTION_ID',
      'DEPLOY_CONNECTION_ID',
      'PLAN_CONNECTION_ID',
      'PLAN_CONNECTION_ID',
    ]);
    for (const name of ['infra_plan', 'infra_apply', 'destroy_plan', 'destroy_apply']) {
      assert.match(real(name), /SYSTEM_ACCESSTOKEN: \$\(System\.AccessToken\)/, name);
      assert.match(real(name), /BUDGET_CONTACT_EMAIL: \$\(BUDGET_CONTACT_EMAIL\)/, name);
      assert.match(real(name), /addSpnToEnvironment: true/, name);
    }
    assert.doesNotMatch(text, /ARM_OIDC_TOKEN=|\$idToken/, 'the 10-minute token must not be used directly');
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

  test('the real plan is the default, and every stage keeps a rehearsal branch that sets the same outputs', () => {
    assert.match(text, /- name: planMode\n(.*\n){2}\s+default: real\n/);
    assert.match(stage('infra_plan'), /\{\{ if eq\(parameters\.planMode, 'rehearsal'\) \}\}:[\s\S]*?name: plan\n/);
    assert.match(real('infra_plan'), /- task: AzureCLI@2\n\s+name: plan\n/);
    assert.match(stage('destroy_plan'), /\{\{ if eq\(parameters\.planMode, 'rehearsal'\) \}\}:[\s\S]*?name: plan\n/);
    assert.match(real('destroy_plan'), /- task: AzureCLI@2\n\s+name: plan\n/);
    for (const name of ['infra_apply', 'destroy_apply'])
      assert.match(stage(name), /\{\{ if eq\(parameters\.planMode, 'rehearsal'\) \}\}:/, name);
  });

  test('the real Terraform is pinned and its download checked, in the shared template', () => {
    assert.match(text, /TF_ZIP_SHA256: [0-9a-f]{64}\n/);
    const template = read('pipelines/templates/terraform-tools.yml');
    assert.match(template, /sha256sum -c -/);
    for (const name of ['infra_plan', 'infra_apply', 'destroy_plan', 'destroy_apply'])
      assert.match(real(name), /- template: pipelines\/templates\/terraform-tools\.yml/, name);
  });

  test('only a manual run goes on, and a destroy needs the typed environment name', () => {
    assert.match(text, /Build\.Reason\)" != "Manual"/);
    assert.match(text, /parameters\.confirmEnvironment \}\}" != "\$\(ENVIRONMENT_NAME\)"/);
  });

  test('the infrastructure apply runs only when the plan has changes, and the application deploy tolerates that skip', () => {
    assert.match(
      text,
      /stage: infra_apply[\s\S]*?condition: and\(succeeded\(\), eq\(dependencies\.infra_plan\.outputs\['plan\.plan\.hasChanges'\], 'true'\)\)/,
    );
    assert.match(text, /stage: app_deploy[\s\S]*?- infra_apply[\s\S]*?'Skipped'/);
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
