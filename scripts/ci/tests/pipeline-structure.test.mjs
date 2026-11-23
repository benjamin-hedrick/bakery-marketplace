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
    for (const job of [
      'secrets',
      'docs',
      'audit',
      'images',
      'dotnet',
      'bff',
      'web',
      'skeleton',
      'terraform',
      'mobile',
    ]) {
      assert.match(code(file), new RegExp(`^ {2}- job: ${job}$`, 'm'), job);
    }
  });

  // WI-SEC-006. Step 1 is non-blocking; step 2 (the lead's decision, after a few green runs) removes continueOnError, and this test then changes with it.
  test('runs the dependency audit as a job: every npm project installed, the audit step non-blocking, the result published', () => {
    const text = code(file);
    const start = text.indexOf('  - job: audit\n');
    assert.ok(start >= 0, 'no audit job');
    const next = text.indexOf('\n  - job: ', start + 1);
    const job = text.slice(start, next < 0 ? undefined : next);
    for (const dir of [
      'packages/web-session',
      'packages/chaos',
      'packages/customer-core',
      'apps/web-customer',
      'apps/web-queue-display',
      'apps/mobile-customer',
      'services/graphql-bff',
    ]) {
      assert.ok(job.includes(dir), `the audit job does not install ${dir}`);
    }
    assert.match(job, /dotnet restore BakeryMarketplace\.slnx/);
    assert.match(
      job,
      /- script: node scripts\/ci\/dependency-audit\.mjs --out \$\(Build\.ArtifactStagingDirectory\)\/dependency-audit\n\s+displayName: [^\n]+\n\s+continueOnError: true/,
      'step 1: the audit step is marked continueOnError',
    );
    assert.match(
      job,
      /PublishPipelineArtifact@1[\s\S]*condition: succeededOrFailed\(\)[\s\S]*artifact: dependency-audit/,
    );
  });

  test('runs the container image scan as a non-blocking job that publishes its summary (WI-SEC-007)', () => {
    const text = code(file);
    const start = text.indexOf('  - job: images\n');
    assert.ok(start >= 0, 'no images job');
    const next = text.indexOf('\n  - job: ', start + 1);
    const job = text.slice(start, next < 0 ? undefined : next);
    assert.match(
      job,
      /- script: node scripts\/ci\/image-scan\.mjs --clean --out \$\(Build\.ArtifactStagingDirectory\)\/image-scan\n\s+displayName: [^\n]+\n\s+continueOnError: true/,
      'the scan step is marked continueOnError until the lead makes it blocking',
    );
    assert.match(job, /PublishPipelineArtifact@1[\s\S]*artifact: image-scan/);
  });

  test('has no Azure service connection and no deploy step: pull-request runs reach nothing in Azure', () => {
    assert.doesNotMatch(
      code(file),
      /azureSubscription|connectedServiceName|AzureCLI@|AzureResourceManager|environment:|deployment:/,
    );
  });
});

// ---- the environment pipelines: the shared stage template, and the two files that call it (dev builds; UAT promotes) --------------------------
// Since WI-DEP-002 step 2b the stages are in pipelines/templates/environment-stages.yml; dev and UAT pass their own connections, approval
// environments and inputs (steps 3 and 8). The checks about what a stage holds read the template; the checks about what a file passes read the file.
const templateFile = 'pipelines/templates/environment-stages.yml';
const template = code(templateFile);
const ENV = '${{ parameters.environmentName }}';
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
/** The template text with the environment parameter as one token (<env>), for the checks whose patterns stop at a space. */
const flat = (t) => t.replaceAll(ENV, '<env>');
/** The text of one stage of the template, from its "- stage:" line to the next one. */
const stage = (name) => {
  const start = template.indexOf(`- stage: ${name}\n`);
  assert.ok(start >= 0, `no stage ${name}`);
  const next = template.indexOf('- stage: ', start + 1);
  return template.slice(start, next < 0 ? undefined : next);
};
/** The real branch of a stage (the part under its planMode 'real' condition). */
const real = (name) => {
  const s = stage(name);
  const at = s.indexOf("{{ if eq(parameters.planMode, 'real') }}:");
  assert.ok(at >= 0, `${name} has no real branch`);
  return s.slice(at);
};
/** The part of a stage under one imageSource condition, up to the next condition at the same place. */
const source = (name, which) => {
  const s = real(name);
  const blocks = [];
  for (
    let at = s.indexOf(`{{ if eq(parameters.imageSource, '${which}') }}:`);
    at >= 0;
    at = s.indexOf(`{{ if eq(parameters.imageSource, '${which}') }}:`, at + 1)
  ) {
    const next = s.indexOf('{{ if eq(parameters.imageSource,', at + 1);
    blocks.push(s.slice(at, next < 0 ? undefined : next));
  }
  assert.ok(blocks.length > 0, `${name} has no ${which} branch`);
  return blocks.join('\n');
};

const PIPELINES = {
  'azure-pipelines-dev.yml': {
    environment: 'dev',
    group: 'rg-bakery-dev',
    imageSource: 'build',
    planConnection: 'bakery-plan',
    deployConnection: 'bakery-deploy',
    approvals: ['dev-infra', 'dev-app', 'dev-destroy'],
    passedThrough: [
      'action',
      'planMode',
      'simulateInfrastructureChanges',
      'holdSeconds',
      'confirmEnvironment',
      'chaosScenario',
      'cacheRedis',
      'tracing',
      'seed',
      'issuerRoles',
      'issuerAllowedIps',
    ],
    fixed: { mockIssuer: 'true' }, // dev's only issuer
    defaults: { seed: 'true', cacheRedis: 'true', tracing: 'true' },
  },
  'azure-pipelines-uat.yml': {
    environment: 'uat',
    group: 'rg-bakery-uat',
    imageSource: 'promote',
    planConnection: 'bakery-uat-plan', // its own, not dev's (register 231)
    deployConnection: 'bakery-uat-deploy',
    approvals: ['uat-infra', 'uat-app', 'uat-destroy'],
    passedThrough: [
      'action',
      'planMode',
      'simulateInfrastructureChanges',
      'holdSeconds',
      'confirmEnvironment',
      'devBuild',
      'seed',
      'mockIssuer',
      'issuerRoles',
      'issuerAllowedIps',
    ],
    fixed: {},
    defaults: { seed: 'false', mockIssuer: 'true' }, // on until Entra: a run with it off is refused (register 222)
  },
};

for (const [file, want] of Object.entries(PIPELINES)) {
  describe(`${file} (manual ${want.environment} operations, through the shared stage template)`, () => {
    const caller = code(file);
    /** The value the file passes for one of the template's parameters. */
    const passed = (name) => {
      const m = new RegExp(`^ {6}${name}: (.+)$`, 'm').exec(caller);
      assert.ok(m, `${file} passes no ${name}`);
      return m[1].trim();
    };

    test('never starts by itself, and the real plan is the default', () => {
      assert.match(caller, /^trigger: none$/m);
      assert.match(caller, /^pr: none$/m);
      assert.match(caller, /- name: planMode\n(.*\n){2}\s+default: real\n/);
    });

    test('passes every run parameter through to the stage template, which declares them all, and names its own environment', () => {
      assert.match(caller, /^stages:\n(\s*#.*\n)*\s+- template: pipelines\/templates\/environment-stages\.yml\n/m);
      for (const name of want.passedThrough) {
        assert.equal(passed(name), `\${{ parameters.${name} }}`, name);
        assert.match(template, new RegExp(`^ {2}- name: ${name}$`, 'm'), name);
        assert.match(caller, new RegExp(`^ {2}- name: ${name}$`, 'm'), `${file} offers ${name}`);
      }
      for (const [name, value] of Object.entries(want.fixed)) assert.equal(passed(name), value, name);
      for (const [name, value] of Object.entries(want.defaults))
        assert.match(
          caller,
          new RegExp(`- name: ${name}\\n(.*\\n){2}\\s+default: ${value}\\n`),
          `${name} defaults to ${value}`,
        );
      assert.equal(passed('environmentName'), want.environment);
      assert.match(caller, new RegExp(`^ {2}ENVIRONMENT_NAME: ${want.environment}$`, 'm'));
      assert.match(caller, new RegExp(`^ {2}RESOURCE_GROUP: ${want.group}$`, 'm'));
      assert.equal(passed('imageSource'), want.imageSource);
      assert.doesNotMatch(caller, /- stage: /, 'no stage is left in the calling file');
    });

    test('uses its own plan and deploy connections, and nothing else', () => {
      assert.equal(passed('planConnection'), want.planConnection);
      assert.equal(passed('deployConnection'), want.deployConnection);
      assert.doesNotMatch(caller, /azureSubscription/);
    });

    test('binds the three deployment jobs to its own three approval environments', () => {
      assert.deepEqual(['infraEnvironment', 'appEnvironment', 'destroyEnvironment'].map(passed), want.approvals);
    });
  });
}

describe('the two environment pipelines agree', () => {
  test('the same Terraform, pinned and its download checked', () => {
    const pin = (file) =>
      /TF_VERSION: (\S+)\n(\s*#.*\n)*\s+TF_ZIP_SHA256: ([0-9a-f]{64})\n/
        .exec(code(file))
        ?.slice(1)
        .filter((x) => x && !x.startsWith('#'));
    assert.ok(pin('azure-pipelines-dev.yml'));
    assert.deepEqual(pin('azure-pipelines-uat.yml'), pin('azure-pipelines-dev.yml'));
    assert.match(read('pipelines/templates/terraform-tools.yml'), /sha256sum -c -/);
    for (const name of ['infra_plan', 'infra_apply', 'destroy_plan', 'destroy_apply'])
      assert.match(real(name), /- template: terraform-tools\.yml/, name); // resolved from the stage template's own folder
  });

  test('only dev builds; only UAT promotes, and only UAT takes the foundation outputs as pipeline variables', () => {
    for (const v of ['REGISTRY_LOGIN_SERVER', 'APP_IDENTITY_ID', 'APP_IDENTITY_PRINCIPAL_ID', 'DEV_PIPELINE_ID'])
      assert.match(read('azure-pipelines-uat.yml'), new RegExp(v), `the UAT file's header lists ${v}`);
    assert.doesNotMatch(code('azure-pipelines-dev.yml'), /devBuild|DEV_PIPELINE_ID|imageSource: promote/);
  });
});

describe('the stage template (pipelines/templates/environment-stages.yml)', () => {
  test('the chaos scenario (WI-CHAOS-006): given only to the deploy plan and the apply, and refused outside dev', () => {
    assert.match(
      code('azure-pipelines-dev.yml'),
      /- name: chaosScenario\n(.*\n){2}\s+default: none\n\s+values:\n\s+- none\n\s+- dev-chaos\n/,
    );
    const given = [...template.matchAll(/TF_VAR_chaos_scenario: (.+)/g)].map((m) => m[1].trim());
    assert.deepEqual(given, ['${{ parameters.chaosScenario }}', '${{ parameters.chaosScenario }}']);
    assert.match(real('infra_plan'), /TF_VAR_chaos_scenario/);
    assert.match(real('infra_apply'), /TF_VAR_chaos_scenario/);
    for (const name of ['destroy_plan', 'destroy_apply', 'app_deploy', 'smoke', 'observe'])
      assert.doesNotMatch(stage(name), /chaos_scenario|chaosScenario/, name);
    assert.ok(
      stage('inputs').includes('[ "${{ parameters.chaosScenario }}" != "none" ] && [ "$(ENVIRONMENT_NAME)" != "dev" ]'),
      'the inputs stage refuses a scenario outside dev',
    );
  });

  test('the cache Redis switch (register 216 option d): given only to the deploy plan and the apply, in lower case, and offered only by dev', () => {
    // Azure DevOps prints a boolean as True or False, which Terraform does not read as a bool; lower() gives true or false.
    const given = [...template.matchAll(/TF_VAR_cache_redis: (.+)/g)].map((m) => m[1].trim());
    assert.deepEqual(given, ['${{ lower(parameters.cacheRedis) }}', '${{ lower(parameters.cacheRedis) }}']);
    assert.match(real('infra_plan'), /TF_VAR_cache_redis/);
    assert.match(real('infra_apply'), /TF_VAR_cache_redis/);
    for (const name of ['destroy_plan', 'destroy_apply', 'app_deploy', 'smoke', 'observe'])
      assert.doesNotMatch(stage(name), /cache_redis|cacheRedis/, name);
    assert.match(template, /- name: cacheRedis\n\s+type: boolean\n\s+default: true\n/);
    assert.doesNotMatch(
      code('azure-pipelines-uat.yml'),
      /cacheRedis/,
      'UAT keeps the cache Redis (the module refuses it off there too)',
    );
    assert.match(code('infra/environments/dev/main.tf'), /^\s+cache_redis = var\.cache_redis$/m);
    assert.doesNotMatch(code('infra/environments/uat/main.tf'), /cache_redis/);
  });

  test('the tracing switch (WI-OBS-001): given only to the deploy plan and the apply, in lower case, on by default, and offered only by dev', () => {
    const given = [...template.matchAll(/TF_VAR_tracing: (.+)/g)].map((m) => m[1].trim());
    assert.deepEqual(given, ['${{ lower(parameters.tracing) }}', '${{ lower(parameters.tracing) }}']);
    assert.match(real('infra_plan'), /TF_VAR_tracing/);
    assert.match(real('infra_apply'), /TF_VAR_tracing/);
    for (const name of ['destroy_plan', 'destroy_apply', 'app_deploy', 'smoke', 'observe'])
      assert.doesNotMatch(stage(name), /TF_VAR_tracing|parameters\.tracing/, name);
    assert.match(template, /- name: tracing\n(\s+#.*\n)*\s+type: boolean\n\s+default: true\n/);
    assert.match(
      code('azure-pipelines-dev.yml'),
      /- name: tracing\n(\s+#.*\n)*\s+displayName: .*\n\s+type: boolean\n\s+default: true\n/,
    );
    assert.doesNotMatch(code('azure-pipelines-uat.yml'), /tracing/, 'UAT does not offer it');
    assert.match(code('infra/environments/dev/main.tf'), /^\s+tracing = var\.tracing$/m);
    assert.doesNotMatch(code('infra/environments/uat/main.tf'), /tracing/);
  });

  test('the issuer inputs (WI-DEP-002 step 3): checked in the inputs stage, given to the deploy plan and the apply the same way, as mapped variables only', () => {
    for (const name of ['MOCK_ISSUER', 'ISSUER_ROLES', 'ISSUER_ALLOWED_IPS']) {
      const given = [...template.matchAll(new RegExp(`^\\s+${name}: (.+)$`, 'gm'))].map((m) => m[1].trim());
      assert.equal(given.length, 3, `${name}: the inputs check, the plan and the apply`);
      assert.equal(new Set(given).size, 1, `${name} is the same everywhere`);
      for (const s of ['infra_plan', 'infra_apply']) assert.match(real(s), new RegExp(`${name}: `), `${name} in ${s}`);
      for (const s of ['destroy_plan', 'destroy_apply', 'app_deploy', 'smoke', 'observe'])
        assert.doesNotMatch(stage(s), new RegExp(name), `${name} not in ${s}`);
    }
    assert.match(
      stage('inputs'),
      /node scripts\/ci\/run-inputs\.mjs check --mock-issuer "\$MOCK_ISSUER" --roles "\$ISSUER_ROLES" --allowed-ips "\$ISSUER_ALLOWED_IPS"/,
    );
    // The free text never appears as text inside a script, where a quote in it would become shell.
    assert.doesNotMatch(template, /\{\{ parameters\.issuerAllowedIps \}\}"/);
    assert.equal([...template.matchAll(/parameters\.issuerAllowedIps/g)].length, 3, 'only in the three env mappings');
    const env = read('scripts/ci/dev-stack-env.sh');
    assert.match(env, /node scripts\/ci\/run-inputs\.mjs tfvars --mock-issuer "\$MOCK_ISSUER"/);
    assert.match(env, /export TF_VAR_issuer_mode TF_VAR_issuer_roles TF_VAR_allowed_ips/);
  });

  test('only the two pipeline connections are used: the plan connection in the plan stages, the deploy connection only in the approved deployment jobs', () => {
    const connections = [...template.matchAll(/azureSubscription: (.+)/g)].map((m) => m[1].trim());
    assert.deepEqual([...new Set(connections)].sort(), [
      '${{ parameters.deployConnection }}',
      '${{ parameters.planConnection }}',
    ]);
    for (const name of ['inputs', 'infra_plan', 'destroy_plan'])
      assert.doesNotMatch(stage(name), /parameters\.deployConnection/, name);
    for (const name of ['infra_apply', 'destroy_apply', 'app_deploy']) {
      assert.doesNotMatch(stage(name), /parameters\.planConnection/, name);
      assert.match(stage(name), /- deployment: /, `${name} must be a deployment job (an approval)`);
    }
    // The image stage runs before any approval, so it holds no connection and signs in to nothing, in either mode.
    assert.doesNotMatch(
      stage('images'),
      /azureSubscription|AzureCLI@|connectedServiceName|docker login|acr login|\baz\s/,
    );
    // The inputs stage (and its promote check) reaches only Azure DevOps, with the job's own token.
    assert.doesNotMatch(stage('inputs'), /azureSubscription|AzureCLI@|connectedServiceName|\baz\s/);
    // The smoke runs browser tests against the public addresses: nothing on its agent can change Azure.
    assert.doesNotMatch(stage('smoke'), /azureSubscription|AzureCLI@|connectedServiceName|\baz\s/);
    // The observe stage reads only, as the read-only identity, and is no deployment job.
    assert.doesNotMatch(stage('observe'), /parameters\.deployConnection|- deployment: /);
    assert.match(real('observe'), /azureSubscription: \$\{\{ parameters\.planConnection \}\}/);
  });

  test('every deployment job is bound to one of the three gated environments, and each is used', () => {
    const used = [...template.matchAll(/^\s+environment: (.+)$/gm)].map((m) => m[1].trim());
    assert.deepEqual([...used].sort(), [
      '${{ parameters.appEnvironment }}',
      '${{ parameters.destroyEnvironment }}',
      '${{ parameters.infraEnvironment }}',
    ]);
    assert.equal([...template.matchAll(/^\s+- deployment: /gm)].length, 3);
  });

  test('promote (ADR-0020 decision 9): the inputs stage refuses unless the dev run was a real deploy from main whose smoke passed, before anything else runs', () => {
    const inputs = stage('inputs');
    const check = inputs.indexOf(
      'node scripts/ci/promote-check.mjs --build "${{ parameters.devBuild }}" --pipeline-id "$(DEV_PIPELINE_ID)"',
    );
    assert.ok(check > inputs.indexOf("{{ if eq(parameters.imageSource, 'promote') }}:"), 'only in a promote run');
    assert.match(inputs.slice(check), /SYSTEM_ACCESSTOKEN: \$\(System\.AccessToken\)/);
    for (const name of ['infra_plan', 'images', 'destroy_plan']) assert.match(stage(name), /dependsOn: inputs/, name);
  });

  test("promote: the images stage builds nothing, fetches that dev run's record and checks it is that run's; the deploy pushes nothing", () => {
    const fetch = source('images', 'promote');
    assert.doesNotMatch(fetch, /dev-images\.mjs build/);
    assert.match(
      fetch,
      /- task: DownloadPipelineArtifact@2\n[\s\S]*?definition: \$\(DEV_PIPELINE_ID\)\n[\s\S]*?pipelineId: \$\{\{ parameters\.devBuild \}\}\n\s+artifactName: dev-images-pushed\n/,
    );
    assert.match(fetch, /node scripts\/ci\/promote-check\.mjs --build "\$\{\{ parameters\.devBuild \}\}" --record /);
    assert.match(
      fetch,
      new RegExp(`- publish: \\$\\(Build\\.ArtifactStagingDirectory\\)/${escape(ENV)}-images-pushed\\n`),
    );
    assert.match(
      source('images', 'build'),
      /node scripts\/ci\/dev-images\.mjs build --tag "\$\(Build\.BuildId\)" --revision "\$\(Build\.SourceVersion\)"/,
    );
    assert.match(source('app_deploy', 'build'), /dev-images\.mjs push/);
    assert.doesNotMatch(source('app_deploy', 'promote'), /dev-images\.mjs push|acr login/);
  });

  test('the application deploy sets the secrets, pushes the built images (build only) and updates the apps, in that order; no Terraform', () => {
    const s = stage('app_deploy');
    const commands = s.split('\n').filter((l) => !/^\s*echo\s/.test(l));
    for (const line of commands)
      if (/\bterraform\s|az containerapp|keyvault secret set/.test(line))
        assert.fail(`Terraform, or an inline app update or secret write (they belong in the scripts): ${line.trim()}`);
    const r = real('app_deploy');
    const download = r.search(new RegExp(`- download: current\\n\\s+artifact: ${escape(ENV)}-images\\n`));
    const check = r.indexOf('identity-check.mjs --identity deploy --environment');
    const secrets = r.indexOf(
      'node scripts/ci/dev-secrets.mjs --vault "$(KEY_VAULT_NAME)" --cosmos-account "$(COSMOS_ACCOUNT_NAME)" --resource-group "$(RESOURCE_GROUP)" --temp "$(Agent.TempDirectory)"',
    );
    const push = r.indexOf(`node scripts/ci/dev-images.mjs push --in "$(Pipeline.Workspace)/${ENV}-images"`);
    const update = r.indexOf(
      'node scripts/ci/dev-deploy.mjs --record "$record" --resource-group "$(RESOURCE_GROUP)" --suffix "b$(Build.BuildId)-$(System.JobAttempt)" --seed "${{ parameters.seed }}"',
    );
    assert.ok(
      download > 0 && check > download && secrets > check && push > secrets && update > push,
      'the artifact, then the identity check, then the secrets, then the push, then the update',
    );
    assert.equal(template.split('scripts/ci/dev-secrets.mjs').length - 1, 1, 'one secret step, outside the comments');
    assert.match(s, /dependsOn:\n(\s+- \w+\n)*\s+- images\n/);
    assert.match(s, /condition: and\(succeeded\('infra_plan'\), succeeded\('images'\), /);
  });

  test('the smoke runs the deployed suite and the latency run on the recorded addresses after the deploy, and the observe stage follows it either way', () => {
    const smoke = stage('smoke');
    // Named, not bare (register 232): a bare succeeded() also checks the stages before app_deploy, and the apply is skipped when nothing changes.
    assert.match(smoke, /dependsOn: app_deploy\n\s+condition: succeeded\('app_deploy'\)\n/);
    assert.doesNotMatch(template, /condition: succeeded\(\)\s*$/m, 'no stage condition is a bare succeeded()');
    assert.match(real('smoke'), /DEPLOYED_WHERE=agent npx playwright test -c playwright\.deployed\.config\.ts/);
    assert.match(
      real('smoke'),
      /node scripts\/ci\/deployed-latency\.mjs --web "\$web" --issuer "\$issuer" --where agent/,
    );
    assert.match(real('smoke'), /\.urls\.web\)/);
    assert.match(
      real('smoke'),
      new RegExp(
        `- publish: \\$\\(Build\\.ArtifactStagingDirectory\\)/${escape(ENV)}-smoke\\n[\\s\\S]*?condition: always\\(\\)`,
      ),
    );
    assert.match(
      stage('observe'),
      /condition: and\(succeeded\('app_deploy'\), in\(dependencies\.smoke\.result, 'Succeeded', 'SucceededWithIssues', 'Failed'\)\)/,
    );
    assert.match(real('observe'), /node scripts\/ci\/dev-observe\.mjs --resource-group "\$\(RESOURCE_GROUP\)"/);
    for (const name of ['smoke', 'observe'])
      assert.match(stage(name), /\{\{ if eq\(parameters\.planMode, 'rehearsal'\) \}\}:/, name);
    // ADR-0020 decision 9 promotes on a passing smoke; the promote check finds the stage by this name.
    assert.match(template, /^ {6}- stage: smoke$/m);
  });

  test("Terraform runs in the environment's own root, never dev's by name", () => {
    assert.doesNotMatch(template, /infra\/environments\/dev\b/);
    const chdirs = [...flat(template).matchAll(/terraform -chdir=(\S+)/g)].map((m) => m[1]);
    assert.ok(chdirs.length >= 10);
    for (const c of chdirs) assert.equal(c, 'infra/environments/<env>');
  });

  test('the plan stages plan from the state without the lock (the read-only identity reads nothing in Azure, no secret); neither applies', () => {
    for (const name of ['infra_plan', 'destroy_plan']) {
      const s = real(name);
      const plans = [...s.matchAll(/terraform\s.*\bplan\s.*$/gm)].map((m) => m[0]);
      assert.equal(plans.length, 1, name);
      assert.match(plans[0], /-lock=false/, name);
      // Register 213: refreshing a Key Vault secret reads its value, which the plan identity may not do (first apply, 2026-11-20).
      assert.match(plans[0], /-refresh=false/, name);
      assert.doesNotMatch(s, /terraform\s+(\S+\s+)?(apply|destroy|import|state|force-unlock|taint)\b/, name);
    }
    assert.match(real('destroy_plan'), /plan -destroy .*-refresh=false/);
  });

  test('the apply re-plans from the state like the approved plan, so drift cannot make every run refuse', () => {
    const replans = [...real('infra_apply').matchAll(/terraform\s.*\bplan\s.*$/gm)].map((m) => m[0]);
    assert.equal(replans.length, 1);
    assert.match(replans[0], /-refresh=false/);
  });

  test('an apply happens only after a re-plan under the lock that is checked against the approved summary, in the same step', () => {
    for (let [name, artifact] of [
      ['infra_apply', `${ENV}-plan-summary`],
      ['destroy_apply', `${ENV}-destroy-summary`],
    ]) {
      const s = flat(real(name));
      artifact = flat(artifact);
      assert.match(s, new RegExp(`- download: current\\n\\s+artifact: ${escape(artifact)}\\n`), name);
      const replan = s.search(
        /terraform -chdir=\S+ plan (-destroy )?-input=false (-refresh=false )?-detailed-exitcode -out=tfplan/,
      );
      const check = s.indexOf(`--expect "$(Pipeline.Workspace)/${artifact}/${artifact}.json"`);
      const apply = s.indexOf('apply -input=false tfplan');
      assert.ok(replan > 0 && check > replan && apply > check, `${name}: re-plan, then the check, then the apply`);
      assert.doesNotMatch(s.slice(replan, apply), /-lock=false/, `${name}: the re-plan takes the lock`);
      assert.equal(s.split('apply -input=false').length - 1, 1, `${name}: one apply`);
    }
    const outside = template.replace(stage('infra_apply'), '').replace(stage('destroy_apply'), '');
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
    // Azure lists a just-deleted resource for a while (the first real teardown failed on this): the check asks again before failing.
    assert.match(
      s,
      /for attempt in \$\(seq 1 \d+\); do\s+left=\$\(az resource list[^\n]*\n\s+if \[ -z "\$left" \] \|\| \[ "\$attempt" -eq \d+ \]; then break; fi[\s\S]*?sleep \d+\s+done\s+if \[ -n "\$left" \]; then/,
      'the emptiness check retries before it fails',
    );
    // Azure makes this action group itself when Application Insights is created; no destroy can remove it, so only it is ignored.
    assert.match(
      s,
      /--query "\[\?!\(type=='microsoft\.insights\/actiongroups' && name=='Application Insights Smart Detection'\)\]\.\{type:type, name:name\}"/,
      'the emptiness check ignores only the platform-made Smart Detection action group',
    );
  });

  test("the rehearsal's destroy guard runs on each environment's own fixture plan, which the real guard passes", () => {
    assert.match(
      stage('destroy_plan'),
      new RegExp(`--plan scripts/ci/tests/fixtures/destroy-plan-${escape(ENV)}\\.json`),
    );
    for (const [environment, { group }] of Object.entries({
      dev: PIPELINES['azure-pipelines-dev.yml'],
      uat: PIPELINES['azure-pipelines-uat.yml'],
    })) {
      const r = spawnSync(
        process.execPath,
        [
          'scripts/ci/destroy-guard.mjs',
          '--plan',
          `scripts/ci/tests/fixtures/destroy-plan-${environment}.json`,
          '--environment',
          environment,
          '--resource-group',
          group,
          '--confirm',
          environment,
        ],
        { cwd: root, encoding: 'utf8' },
      );
      assert.equal(r.status, 0, `${environment}: ${r.stdout}${r.stderr}`);
    }
  });

  test('only the value-free summaries, the images, the records and the smoke and observe evidence are published, never a saved plan or its JSON', () => {
    const published = [...flat(template).matchAll(/- publish: (\S+)/g)].map((m) => m[1]).sort();
    assert.deepEqual(
      published,
      [
        '$(Build.ArtifactStagingDirectory)/destroy-summary',
        '$(Build.ArtifactStagingDirectory)/<env>-deployment',
        '$(Build.ArtifactStagingDirectory)/<env>-images',
        '$(Build.ArtifactStagingDirectory)/<env>-images-pushed', // promote: the fetched record
        '$(Build.ArtifactStagingDirectory)/<env>-images-pushed', // build: the pushed record
        '$(Build.ArtifactStagingDirectory)/<env>-observe',
        '$(Build.ArtifactStagingDirectory)/<env>-smoke',
        '$(Build.ArtifactStagingDirectory)/plan-summary',
      ].sort(),
    );
    // Every artifact this run publishes or downloads is named for its environment; the one dev name left is the dev run's record a promote run
    // fetches from that other run (artifactName, not artifact).
    const artifacts = [...flat(template).matchAll(/^\s+artifact: (\S+)$/gm)].map((m) => m[1]);
    assert.ok(artifacts.length >= 12);
    for (const a of artifacts) assert.match(a, /^<env>-/, a);
    assert.deepEqual(
      [...template.matchAll(/artifactName: (\S+)/g)].map((m) => m[1]),
      ['dev-images-pushed'],
    );
    for (const name of ['infra_plan', 'destroy_plan'])
      assert.match(real(name), new RegExp(`rm -f "\\$json" infra/environments/${escape(ENV)}/tfplan`), name);
  });

  test('Terraform signs in with Azure DevOps token refresh, and the budget e-mail comes in as a mapped (secret) variable', () => {
    const steps = [
      ...template.matchAll(/source scripts\/ci\/dev-stack-env\.sh "\$\{(\w+):-\}" "\$\(ENVIRONMENT_NAME\)"\n/g),
    ].map((m) => m[1]);
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
    assert.doesNotMatch(template, /ARM_OIDC_TOKEN=|\$idToken/, 'the 10-minute token must not be used directly');
  });

  // In a deployment job Azure DevOps exports Environment.Name (dev-infra, dev-destroy) as ENVIRONMENT_NAME; the first dev deploy's apply step
  // stopped silently on it (2026-11-20). The script takes the environment as an argument and names any foundation output it cannot find.
  test('the shared Terraform setup never reads ENVIRONMENT_NAME from the environment, and names a missing foundation output', () => {
    const env = read('scripts/ci/dev-stack-env.sh')
      .split('\n')
      .filter((l) => !/^\s*#/.test(l))
      .join('\n');
    assert.doesNotMatch(env, /\$\{?ENVIRONMENT_NAME/);
    assert.match(env, /^environment="\$\{2:-\}"$/m);
    assert.doesNotMatch(env, /^\s*TF_VAR_\w+=\$\(jq -er/m, 'every foundation lookup goes through the named check');
  });

  test("each environment has its own state container, and only dev's setup reads the foundation's state (register 214)", () => {
    const env = read('scripts/ci/dev-stack-env.sh');
    assert.match(
      env,
      /if \[ "\$environment" = "dev" \]; then state_container=tfstate; else state_container="tfstate-\$environment"; fi/,
    );
    assert.match(env, /-backend-config="container_name=\$state_container"/);
    const devOnly = env.slice(
      env.indexOf('if [ "$environment" = "dev" ]; then\n  terraform -chdir=infra/foundation init'),
      env.indexOf('\nelse\n'),
    );
    assert.match(devOnly, /terraform -chdir=infra\/foundation init/);
    assert.equal(
      env.split('terraform -chdir=infra/foundation').length - 1,
      2,
      'the foundation is read only in the dev branch (init and output)',
    );
    assert.match(env, /for v in REGISTRY_LOGIN_SERVER APP_IDENTITY_ID APP_IDENTITY_PRINCIPAL_ID; do/);
  });

  // Rules for the post-apply secret step, decided 2026-11-20 before it is built (docs/architecture/secrets-and-sensitive-values.md): a secret
  // never goes on a command line (where the process list and a traced shell would show it) and the shell is never traced.
  test('a secret is written to Key Vault only from a file, never as a command-line value, and no step traces its shell', () => {
    for (const line of template.split('\n').filter((l) => /keyvault secret set/.test(l))) {
      assert.match(line, /--file /, line.trim());
      assert.doesNotMatch(line, /--value\b/, line.trim());
    }
    assert.doesNotMatch(template, /^\s*set -[a-z]*x|set -o xtrace|bash -x/m);
  });

  test('every stage keeps a rehearsal branch that sets the same outputs', () => {
    assert.match(stage('infra_plan'), /\{\{ if eq\(parameters\.planMode, 'rehearsal'\) \}\}:[\s\S]*?name: plan\n/);
    assert.match(real('infra_plan'), /- task: AzureCLI@2\n\s+name: plan\n/);
    assert.match(stage('destroy_plan'), /\{\{ if eq\(parameters\.planMode, 'rehearsal'\) \}\}:[\s\S]*?name: plan\n/);
    assert.match(real('destroy_plan'), /- task: AzureCLI@2\n\s+name: plan\n/);
    for (const name of ['infra_apply', 'destroy_apply', 'images', 'app_deploy'])
      assert.match(stage(name), /\{\{ if eq\(parameters\.planMode, 'rehearsal'\) \}\}:/, name);
  });

  test('only a manual run goes on, and a destroy needs the typed environment name', () => {
    assert.match(template, /Build\.Reason\)" != "Manual"/);
    assert.match(template, /parameters\.confirmEnvironment \}\}" != "\$\(ENVIRONMENT_NAME\)"/);
  });

  test('the infrastructure apply runs only when the plan has changes, and the application deploy tolerates that skip', () => {
    assert.match(
      template,
      /stage: infra_apply[\s\S]*?condition: and\(succeeded\(\), eq\(dependencies\.infra_plan\.outputs\['plan\.plan\.hasChanges'\], 'true'\)\)/,
    );
    assert.match(template, /stage: app_deploy[\s\S]*?- infra_apply[\s\S]*?'Skipped'/);
  });
});

// The shell in the rehearsal steps is plain sh with Azure's macros in it. These tests take the step text from the file, replace the macros with
// values, and run it, so the logic that decides "stop" and "has changes" is exercised and not only read.
function stepScript(displayName) {
  const all = lines(templateFile);
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
  const environment = values.environment ?? 'dev';
  const filled = script
    .replaceAll('$(Build.SourceBranch)', values.branch ?? 'refs/heads/main')
    .replaceAll('$(Build.Reason)', values.reason ?? 'Manual')
    .replaceAll('$(ENVIRONMENT_NAME)', environment)
    .replaceAll('${{ parameters.environmentName }}', values.templateEnvironment ?? environment)
    .replaceAll('${{ parameters.imageSource }}', values.imageSource ?? 'build')
    .replaceAll('${{ parameters.devBuild }}', values.devBuild ?? '0')
    .replaceAll('${{ parameters.chaosScenario }}', values.chaos ?? 'none')
    .replaceAll('${{ parameters.cacheRedis }}', values.cacheRedis ?? 'True')
    .replaceAll('${{ parameters.tracing }}', values.tracing ?? 'True')
    .replaceAll('${{ parameters.action }}', values.action ?? 'deploy')
    .replaceAll('${{ parameters.confirmEnvironment }}', values.confirm ?? '')
    .replaceAll('${{ parameters.simulateInfrastructureChanges }}', values.simulate ?? 'True');
  assert.doesNotMatch(filled, /\$\{\{/, 'every template expression is filled in');
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
    assert.equal(
      runStep(inputs(), { action: 'destroy', confirm: 'dev', environment: 'uat' }).status,
      1,
      "dev's name does not destroy uat",
    );
  });

  test('the confirmation is not asked for on a deploy', () => {
    assert.equal(runStep(inputs(), { action: 'deploy', confirm: 'anything' }).status, 0);
  });

  test('the input check lets dev name a chaos scenario and stops any other environment that does (WI-CHAOS-006)', () => {
    assert.equal(runStep(inputs(), { action: 'deploy', chaos: 'dev-chaos' }).status, 0);
    const refused = runStep(inputs(), {
      action: 'deploy',
      chaos: 'dev-chaos',
      environment: 'uat',
      imageSource: 'promote',
      devBuild: '120',
    });
    assert.notEqual(refused.status, 0);
    assert.match(refused.stdout, /only for the dev environment/);
    assert.equal(
      runStep(inputs(), {
        action: 'deploy',
        chaos: 'none',
        environment: 'uat',
        imageSource: 'promote',
        devBuild: '120',
      }).status,
      0,
    );
  });

  test("the input check stops a template whose environment is not the file's ENVIRONMENT_NAME", () => {
    const r = runStep(inputs(), {
      environment: 'uat',
      templateEnvironment: 'dev',
      imageSource: 'promote',
      devBuild: '120',
    });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /ENVIRONMENT_NAME is uat/);
  });

  test('a promote deploy needs a dev run id; a promote destroy does not', () => {
    const r = runStep(inputs(), { environment: 'uat', imageSource: 'promote', devBuild: '0' });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /needs devBuild/);
    assert.equal(
      runStep(inputs(), {
        environment: 'uat',
        imageSource: 'promote',
        devBuild: '0',
        action: 'destroy',
        confirm: 'uat',
      }).status,
      0,
    );
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
