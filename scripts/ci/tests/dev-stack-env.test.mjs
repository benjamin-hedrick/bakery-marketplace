import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// scripts/ci/dev-stack-env.sh run for real (WI-DEP-002): sourced by bash as the pipeline's Terraform steps source it, with a stub `terraform` first on
// the PATH that records its arguments and plays the foundation's outputs, so nothing reaches Azure. It checks what the text checks in
// pipeline-structure.test.mjs cannot: which state container and key each environment initialises, that only dev reads the foundation's state, where
// the registry and apps identity come from, the issuer inputs, and that no value is printed. Needs bash and jq (the pipeline's agent has both).
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const posix = (p) => p.replaceAll('\\', '/');

/** Git's own bash on Windows (a bare `bash` there can be WSL's), the PATH's elsewhere; undefined when there is none. */
function findBash() {
  if (process.platform !== 'win32') return 'bash';
  const exec = spawnSync('git', ['--exec-path'], { encoding: 'utf8' }).stdout?.trim();
  const candidate = exec ? path.resolve(exec, '..', '..', '..', 'usr', 'bin', 'bash.exe') : '';
  return candidate && existsSync(candidate) ? candidate : undefined;
}
const bash = findBash();
const jq = bash !== undefined && spawnSync(bash, ['-c', 'command -v jq'], { encoding: 'utf8' }).status === 0;
const skip =
  bash === undefined
    ? 'no bash found'
    : jq
      ? false
      : 'jq is not installed here (the pipeline agent has it; on Windows: winget install jqlang.jq)';

// The foundation's outputs as `terraform output -json` gives them; the uat entry differs, so a lookup with the wrong key would show.
const FOUNDATION = {
  registry_login_server: { value: 'bakerytest01.azurecr.io' },
  app_identities: {
    value: {
      dev: { id: '/subs/x/id-bakery-dev-apps', principal_id: 'dev-apps-oid', client_id: 'c1' },
      uat: { id: '/subs/x/id-bakery-uat-apps', principal_id: 'uat-apps-oid', client_id: 'c2' },
    },
  },
};
const PIPELINE = {
  ARM_SUBSCRIPTION_ID: 'sub-0001',
  TF_STATE_ACCOUNT: 'sttest0001',
  DEPLOY_PRINCIPAL_ID: 'deploy-oid-0001',
  KEY_VAULT_NAME: 'kv-test-0001',
  COSMOS_ACCOUNT_NAME: 'cosmos-test-0001',
  BUDGET_CONTACT_EMAIL: 'budget-0001@example.test',
  SYSTEM_ACCESSTOKEN: 'job-token-0001',
  SYSTEM_OIDCREQUESTURI: 'https://oidc.example.test/request',
  servicePrincipalId: 'spn-0001',
  tenantId: 'tenant-0001',
};
const UAT_FOUNDATION_VARS = {
  REGISTRY_LOGIN_SERVER: 'bakerytest01.azurecr.io',
  APP_IDENTITY_ID: '/subs/x/id-bakery-uat-apps-from-variable',
  APP_IDENTITY_PRINCIPAL_ID: 'uat-apps-oid-from-variable',
};
// Values that must never appear in the step's log (the outputs are not secrets, but the script promises to print nothing but Terraform's init).
const NEVER_PRINTED = [
  'budget-0001@example.test',
  'job-token-0001',
  'dev-apps-oid',
  'uat-apps-oid-from-variable',
  'deploy-oid-0001',
];

/** Sources the script for `environment` with the stub terraform; returns the exit status, the output, the stub's calls and the exported variables. */
function source(environment, env = {}, foundation = FOUNDATION) {
  const dir = mkdtempSync(path.join(tmpdir(), 'stack-env-'));
  const log = posix(path.join(dir, 'terraform.log'));
  const outputs = posix(path.join(dir, 'foundation.json'));
  const dump = posix(path.join(dir, 'env.txt'));
  writeFileSync(outputs, JSON.stringify(foundation));
  writeFileSync(
    path.join(dir, 'terraform'),
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${log}"\ncase " $* " in *" output -json "*) cat "${outputs}" ;; esac\n`,
    { mode: 0o755 },
  );
  const base = { ...process.env };
  for (const name of ['MOCK_ISSUER', 'ISSUER_ROLES', 'ISSUER_ALLOWED_IPS', ...Object.keys(UAT_FOUNDATION_VARS)])
    delete base[name];
  // On a line of its own, as the pipeline's steps source it: in "source ... && next" bash ignores the script's own set -e (a command in an && list),
  // and a failed $(...) lookup would not stop it.
  const r = spawnSync(
    bash,
    ['-c', `source scripts/ci/dev-stack-env.sh "conn-0001" "${environment}"\nenv > "${dump}"`],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...base, ...PIPELINE, ...env, PATH: `${dir}${path.delimiter}${process.env.PATH}` },
    },
  );
  const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
  const vars = {};
  if (existsSync(dump))
    for (const line of readFileSync(dump, 'utf8').split('\n')) {
      const at = line.indexOf('=');
      if (at > 0) vars[line.slice(0, at)] = line.slice(at + 1);
    }
  return { status: r.status, out: `${r.stdout}${r.stderr}`, calls, vars };
}

describe('dev-stack-env.sh, run (WI-DEP-002)', { skip }, () => {
  test("dev: the foundation's state and dev's are both in the tfstate container; the registry and apps identity come from the foundation's outputs", () => {
    const r = source('dev');
    assert.equal(r.status, 0, r.out);
    assert.equal(r.calls.length, 3, r.calls.join('\n'));
    assert.match(
      r.calls[0],
      /^-chdir=infra\/foundation init .*-backend-config=container_name=tfstate .*-backend-config=key=foundation\.tfstate$/,
    );
    assert.match(r.calls[1], /^-chdir=infra\/foundation output -json$/);
    assert.match(
      r.calls[2],
      /^-chdir=infra\/environments\/dev init .*-backend-config=container_name=tfstate .*-backend-config=key=dev\.tfstate$/,
    );
    for (const call of [r.calls[0], r.calls[2]]) {
      assert.match(call, /-backend-config=storage_account_name=sttest0001 /);
      assert.match(call, /-backend-config=use_azuread_auth=true/);
    }
    assert.equal(r.vars.TF_VAR_registry_login_server, 'bakerytest01.azurecr.io');
    assert.equal(r.vars.TF_VAR_app_identity_id, '/subs/x/id-bakery-dev-apps');
    assert.equal(r.vars.TF_VAR_app_identity_principal_id, 'dev-apps-oid');
  });

  test("uat: its own state container and key, never the foundation's state; the registry and apps identity come from the pipeline variables", () => {
    const r = source('uat', UAT_FOUNDATION_VARS);
    assert.equal(r.status, 0, r.out);
    assert.equal(r.calls.length, 1, r.calls.join('\n'));
    assert.match(
      r.calls[0],
      /^-chdir=infra\/environments\/uat init .*-backend-config=container_name=tfstate-uat .*-backend-config=key=uat\.tfstate$/,
    );
    assert.ok(
      !r.calls.some((c) => c.includes('infra/foundation')),
      'UAT reads nothing of the tfstate container (register 214)',
    );
    assert.equal(r.vars.TF_VAR_registry_login_server, UAT_FOUNDATION_VARS.REGISTRY_LOGIN_SERVER);
    assert.equal(r.vars.TF_VAR_app_identity_id, UAT_FOUNDATION_VARS.APP_IDENTITY_ID);
    assert.equal(r.vars.TF_VAR_app_identity_principal_id, UAT_FOUNDATION_VARS.APP_IDENTITY_PRINCIPAL_ID);
  });

  test('uat: each missing foundation variable stops the step, named, before any init', () => {
    for (const name of Object.keys(UAT_FOUNDATION_VARS)) {
      const r = source('uat', { ...UAT_FOUNDATION_VARS, [name]: '' });
      assert.equal(r.status, 1, name);
      assert.match(r.out, new RegExp(`##vso\\[task\\.logissue type=error\\]${name} is not set`), name);
      assert.deepEqual(r.calls, [], name);
    }
  });

  test('dev: a foundation output missing for the environment stops the step and says which, without printing any value', () => {
    const r = source(
      'dev',
      {},
      { ...FOUNDATION, app_identities: { value: { uat: FOUNDATION.app_identities.value.uat } } },
    );
    assert.notEqual(r.status, 0);
    assert.match(r.out, /the foundation state has no apps identity id .*environment 'dev'/);
    assert.ok(!r.calls.some((c) => c.includes('infra/environments')), 'no environment init');
    assert.doesNotMatch(r.out, /uat-apps-oid/);
  });

  test("the common inputs: the tenant and the client from the sign-in, OIDC with Azure DevOps' token refresh, the pipeline variables, the budget contact as a list", () => {
    const r = source('uat', UAT_FOUNDATION_VARS);
    assert.equal(r.status, 0, r.out);
    assert.equal(r.vars.TF_VAR_tenant_id, 'tenant-0001');
    assert.equal(r.vars.ARM_USE_OIDC, 'true');
    assert.equal(r.vars.ARM_CLIENT_ID, 'spn-0001');
    assert.equal(r.vars.ARM_TENANT_ID, 'tenant-0001');
    assert.equal(r.vars.ARM_ADO_PIPELINE_SERVICE_CONNECTION_ID, 'conn-0001');
    assert.equal(r.vars.ARM_OIDC_REQUEST_TOKEN, 'job-token-0001');
    assert.equal(r.vars.ARM_OIDC_TOKEN, undefined, 'the 10-minute token is never used directly');
    assert.equal(r.vars.TF_VAR_deploy_principal_id, 'deploy-oid-0001');
    assert.equal(r.vars.TF_VAR_key_vault_name, 'kv-test-0001');
    assert.equal(r.vars.TF_VAR_cosmos_account_name, 'cosmos-test-0001');
    assert.equal(r.vars.TF_VAR_budget_contact_emails, '["budget-0001@example.test"]');
  });

  test('nothing the script reads or sets is printed (only the stub init, which prints nothing, would speak)', () => {
    for (const [environment, env] of [
      ['dev', {}],
      ['uat', UAT_FOUNDATION_VARS],
      [
        'uat',
        { ...UAT_FOUNDATION_VARS, MOCK_ISSUER: 'True', ISSUER_ROLES: 'Customer', ISSUER_ALLOWED_IPS: '203.0.113.7/32' },
      ],
    ]) {
      const r = source(environment, env);
      assert.equal(r.status, 0, r.out);
      for (const value of [...NEVER_PRINTED, '203.0.113.7'])
        assert.ok(!r.out.includes(value), `${environment}: ${value} was printed`);
    }
  });

  test('the issuer inputs (step 3): mapped, they become the three Terraform variables; off, the step stops before the environment init; not mapped, nothing is set', () => {
    const on = source('uat', {
      ...UAT_FOUNDATION_VARS,
      MOCK_ISSUER: 'True',
      ISSUER_ROLES: 'Customer,Admin',
      ISSUER_ALLOWED_IPS: '203.0.113.7/32',
    });
    assert.equal(on.status, 0, on.out);
    assert.equal(on.vars.TF_VAR_issuer_mode, 'mock');
    assert.equal(on.vars.TF_VAR_issuer_roles, '["Customer","Admin"]');
    assert.equal(on.vars.TF_VAR_allowed_ips, '["203.0.113.7/32"]');

    const off = source('uat', {
      ...UAT_FOUNDATION_VARS,
      MOCK_ISSUER: 'False',
      ISSUER_ROLES: 'Customer',
      ISSUER_ALLOWED_IPS: 'none',
    });
    assert.notEqual(off.status, 0);
    assert.match(off.out, /mockIssuer is off.*register 222/);
    assert.deepEqual(off.calls, [], 'no init after a refused input');

    const destroy = source('uat', UAT_FOUNDATION_VARS); // a destroy step maps no issuer input: the module's defaults apply
    assert.equal(destroy.status, 0, destroy.out);
    for (const name of ['TF_VAR_issuer_mode', 'TF_VAR_issuer_roles', 'TF_VAR_allowed_ips'])
      assert.equal(destroy.vars[name], undefined, name);
  });

  test('no environment, or the macro text an unset variable leaves, stops the step before anything runs', () => {
    for (const environment of ['', '$(ENVIRONMENT_NAME)']) {
      const r = source(environment, UAT_FOUNDATION_VARS);
      assert.equal(r.status, 1, JSON.stringify(environment));
      assert.match(r.out, /No environment was given/);
      assert.deepEqual(r.calls, []);
    }
  });

  test('a missing pipeline variable, or a secret left as its macro text, stops the step, named', () => {
    const missing = source('uat', { ...UAT_FOUNDATION_VARS, TF_STATE_ACCOUNT: '' });
    assert.equal(missing.status, 1);
    assert.match(missing.out, /TF_STATE_ACCOUNT is not set/);
    const macro = source('uat', { ...UAT_FOUNDATION_VARS, BUDGET_CONTACT_EMAIL: '$(BUDGET_CONTACT_EMAIL)' });
    assert.equal(macro.status, 1);
    assert.match(macro.out, /BUDGET_CONTACT_EMAIL or a connection id is not set/);
  });
});
