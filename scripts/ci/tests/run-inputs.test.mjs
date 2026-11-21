import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROLES, bool, inputs, list } from '../run-inputs.mjs';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'run-inputs.mjs');
const ok = { mockIssuer: 'True', roles: 'Customer', allowedIps: 'none' };

describe('the issuer inputs (WI-DEP-002 step 3)', () => {
  test('the defaults (mock issuer on, Customer only, no allow-list) are what the module already does', () => {
    assert.deepEqual(inputs(ok), {
      problems: [],
      tfvars: { TF_VAR_issuer_mode: 'mock', TF_VAR_issuer_roles: '["Customer"]', TF_VAR_allowed_ips: '[]' },
    });
  });

  test('the mock issuer off is refused until Entra exists (register 222), whatever else is given', () => {
    for (const mockIssuer of ['False', 'false']) {
      const { problems, tfvars } = inputs({ ...ok, mockIssuer });
      assert.equal(tfvars, null);
      assert.match(problems.join('\n'), /register 222/);
    }
  });

  test('a role other than Customer needs an allow-list, as the mock issuer itself requires', () => {
    assert.match(inputs({ ...ok, roles: 'Customer,Admin' }).problems.join('\n'), /issuerAllowedIps restricts/);
    assert.deepEqual(inputs({ ...ok, roles: 'Customer,Admin', allowedIps: '203.0.113.7/32' }).tfvars, {
      TF_VAR_issuer_mode: 'mock',
      TF_VAR_issuer_roles: '["Customer","Admin"]',
      TF_VAR_allowed_ips: '["203.0.113.7/32"]',
    });
  });

  test('an allow-list alone is accepted, with commas or spaces', () => {
    assert.equal(
      inputs({ ...ok, allowedIps: '203.0.113.7/32, 198.51.100.0/24' }).tfvars.TF_VAR_allowed_ips,
      '["203.0.113.7/32","198.51.100.0/24"]',
    );
  });

  test('an unknown role, a repeated role, no role, or no Customer is refused', () => {
    for (const roles of ['Customer,Superuser', 'Customer,Customer', '', 'none', 'Admin']) {
      const { problems } = inputs({ ...ok, roles, allowedIps: '203.0.113.7/32' });
      assert.ok(problems.length > 0, roles);
    }
  });

  test('anything but an IPv4 CIDR range in the allow-list is refused (the value reaches a Terraform list, never a shell)', () => {
    for (const ip of [
      '203.0.113.7',
      '203.0.113.7/33',
      '256.0.0.1/32',
      '::1/128',
      '"]; rm -rf /',
      '10.0.0.0/8;x',
      'any',
    ]) {
      assert.ok(inputs({ ...ok, allowedIps: ip }).problems.length > 0, ip);
    }
  });

  test('the helpers: list and bool', () => {
    assert.deepEqual(list(' none '), []);
    assert.deepEqual(list('a, b  c'), ['a', 'b', 'c']);
    assert.equal(bool('True'), true);
    assert.equal(bool('false'), false);
    assert.throws(() => bool('yes'));
    assert.deepEqual(ROLES, ['Customer', 'Vendor', 'Admin']);
  });

  test('the command line: check prints nothing when acceptable, tfvars prints the three lines, a refusal exits 1 with the reasons', () => {
    const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    const check = run('check', '--mock-issuer', 'True', '--roles', 'Customer', '--allowed-ips', 'none');
    assert.equal(check.status, 0);
    assert.equal(check.stdout, '');
    const tfvars = run('tfvars', '--mock-issuer', 'True', '--roles', 'Customer', '--allowed-ips', 'none');
    assert.equal(tfvars.stdout, 'TF_VAR_issuer_mode=mock\nTF_VAR_issuer_roles=["Customer"]\nTF_VAR_allowed_ips=[]\n');
    const refused = run('check', '--mock-issuer', 'False', '--roles', 'Customer', '--allowed-ips', 'none');
    assert.equal(refused.status, 1);
    assert.match(refused.stdout, /##vso\[task\.logissue type=error\]mockIssuer is off/);
    // In tfvars mode it runs inside $(...) (scripts/ci/dev-stack-env.sh), so the reasons go where the log still shows them.
    const refusedVars = run('tfvars', '--mock-issuer', 'False', '--roles', 'Customer', '--allowed-ips', 'none');
    assert.equal(refusedVars.status, 1);
    assert.equal(refusedVars.stdout, '');
    assert.match(refusedVars.stderr, /mockIssuer is off/);
    assert.equal(run('check').status, 2);
  });
});
