import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { compareRoles, expectedRoles, isPermissionRefusal, objectIdOf } from '../identity-check.mjs';

const SUB = '/subscriptions/00000000-0000-0000-0000-000000000000';
const STATE = `${SUB}/resourceGroups/rg-bakery-tfstate/providers/Microsoft.Storage/storageAccounts/sttest/blobServices/default/containers/tfstate`;
const STATE_UAT = STATE.replace(/tfstate$/, 'tfstate-uat');
const DEV = `${SUB}/resourceGroups/rg-bakery-dev`;
const UAT = `${SUB}/resourceGroups/rg-bakery-uat`;
const FOUNDATION = `${SUB}/resourceGroups/rg-bakery-foundation`;
const REGISTRY = `${FOUNDATION}/providers/Microsoft.ContainerRegistry/registries/bakerytest`;
const APPS = (env) => `${FOUNDATION}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-bakery-${env}-apps`;
const VAULT = `${DEV}/providers/Microsoft.KeyVault/vaults/kv-bakery-dev-test`;

// The sets of register 231 (proposed 2026-11-21 for the lead's approval): each environment's identities hold roles on their own resources only.
const plan = [
  { role: 'Reader', scope: SUB, conditioned: false },
  { role: 'Storage Blob Data Reader', scope: STATE, conditioned: false },
];
const uatPlan = [
  { role: 'Reader', scope: SUB, conditioned: false },
  { role: 'Storage Blob Data Reader', scope: STATE_UAT, conditioned: false },
];
const deploy = [
  { role: 'Contributor', scope: DEV, conditioned: false },
  { role: 'Role Based Access Control Administrator', scope: DEV, conditioned: true },
  { role: 'Storage Blob Data Contributor', scope: STATE, conditioned: false },
  { role: 'Reader', scope: FOUNDATION, conditioned: false },
  { role: 'Managed Identity Operator', scope: APPS('dev'), conditioned: false },
  { role: 'AcrPush', scope: REGISTRY, conditioned: false },
];
const uatDeploy = [
  { role: 'Contributor', scope: UAT, conditioned: false },
  { role: 'Role Based Access Control Administrator', scope: UAT, conditioned: true },
  { role: 'Storage Blob Data Contributor', scope: STATE_UAT, conditioned: false },
  { role: 'Reader', scope: FOUNDATION, conditioned: false },
  { role: 'Managed Identity Operator', scope: APPS('uat'), conditioned: false },
  { role: 'AcrPull', scope: REGISTRY, conditioned: false },
];
const ok = (held, ...args) => compareRoles(held, expectedRoles(...args)).ok;

describe('each environment its own identities (register 231)', () => {
  test("each plan identity holds Reader on the subscription and a read of its own environment's state only", () => {
    assert.deepEqual(compareRoles(plan, expectedRoles('plan', 'dev')), { ok: true, problems: [] });
    assert.deepEqual(compareRoles(uatPlan, expectedRoles('plan', 'uat')), { ok: true, problems: [] });
    assert.equal(ok(plan, 'plan', 'uat'), false, "dev's state is not UAT's");
    assert.equal(ok(uatPlan, 'plan', 'dev'), false, "UAT's state is not dev's");
    const both = [...plan, { role: 'Storage Blob Data Reader', scope: STATE_UAT, conditioned: false }];
    assert.equal(
      ok(both, 'plan', 'dev'),
      false,
      "dev's plan identity may not read UAT's state (it holds UAT's Cosmos keys)",
    );
  });

  test('each deploy identity passes with exactly its own set, checked by itself and by its plan identity', () => {
    for (const [env, held] of [
      ['dev', deploy],
      ['uat', uatDeploy],
    ]) {
      assert.deepEqual(
        compareRoles(held, expectedRoles('deploy', env, { asSelf: false })),
        { ok: true, problems: [] },
        env,
      );
      const seenBySelf = held.filter((r) => r.role !== 'Storage Blob Data Contributor');
      assert.equal(ok(seenBySelf, 'deploy', env), true, `${env}: it cannot see its state role itself`);
    }
    const withVault = [
      ...uatDeploy,
      {
        role: 'Key Vault Secrets Officer',
        scope: `${UAT}/providers/Microsoft.KeyVault/vaults/kv-uat`,
        conditioned: false,
      },
    ];
    assert.equal(ok(withVault, 'deploy', 'uat', { asSelf: false }), true);
  });

  test("a deploy identity is refused any write in the foundation group, the other environment's state, group or apps identity", () => {
    for (const [env, held, other] of [
      ['dev', deploy, 'uat'],
      ['uat', uatDeploy, 'dev'],
    ])
      for (const extra of [
        { role: 'Contributor', scope: FOUNDATION, conditioned: false },
        { role: 'Role Based Access Control Administrator', scope: FOUNDATION, conditioned: true },
        { role: 'Contributor', scope: `${SUB}/resourceGroups/rg-bakery-${other}`, conditioned: false },
        { role: 'Storage Blob Data Contributor', scope: other === 'dev' ? STATE : STATE_UAT, conditioned: false },
        { role: 'Managed Identity Operator', scope: APPS(other), conditioned: false },
        { role: 'Managed Identity Contributor', scope: APPS(env), conditioned: false }, // could add credentials to the identity
      ])
        assert.equal(
          ok([...held, extra], 'deploy', env, { asSelf: false }),
          false,
          `${env}: ${extra.role} at ${extra.scope}`,
        );
  });

  test("only dev pushes images; UAT only pulls; each is refused the other's", () => {
    assert.equal(
      ok(
        deploy.map((r) => (r.role === 'AcrPush' ? { ...r, role: 'AcrPull' } : r)),
        'deploy',
        'dev',
        { asSelf: false },
      ),
      false,
    );
    assert.equal(
      ok(
        uatDeploy.map((r) => (r.role === 'AcrPull' ? { ...r, role: 'AcrPush' } : r)),
        'deploy',
        'uat',
        { asSelf: false },
      ),
      false,
    );
  });

  test("dev's deploy identity's old foundation roles (Contributor and the role-assignment right there) now fail its check", () => {
    const old = [
      ...deploy.filter((r) => r.role !== 'Reader' && r.role !== 'Managed Identity Operator'),
      { role: 'Contributor', scope: FOUNDATION, conditioned: false },
      { role: 'Role Based Access Control Administrator', scope: FOUNDATION, conditioned: true },
    ];
    const r = compareRoles(old, expectedRoles('deploy', 'dev', { asSelf: false }));
    assert.equal(r.ok, false);
    assert.match(r.problems.join('\n'), /missing: Managed Identity Operator/);
    assert.match(r.problems.join('\n'), /unexpected: Contributor at .*rg-bakery-foundation/);
  });
});

describe('the identity check', () => {
  test('passes the plan identity holding exactly Reader on the subscription and Blob Data Reader on the state container', () => {
    assert.deepEqual(compareRoles(plan, expectedRoles('plan', 'dev')), { ok: true, problems: [] });
  });

  test('passes the deploy identity with and without the Key Vault role an existing environment adds', () => {
    assert.equal(compareRoles(deploy, expectedRoles('deploy', 'dev')).ok, true);
    const withVault = [...deploy, { role: 'Key Vault Secrets Officer', scope: VAULT, conditioned: false }];
    assert.equal(compareRoles(withVault, expectedRoles('deploy', 'dev')).ok, true);
  });

  test('refuses an extra role, a missing role, a role at a wider scope, and the plan identity holding a write role', () => {
    const extra = compareRoles(
      [...plan, { role: 'Contributor', scope: DEV, conditioned: false }],
      expectedRoles('plan'),
    );
    assert.match(extra.problems.join(), /unexpected: Contributor/);
    assert.match(compareRoles(plan.slice(1), expectedRoles('plan')).problems.join(), /missing: Reader/);
    const wide = deploy.map((d) => (d.role === 'Contributor' && d.scope === DEV ? { ...d, scope: SUB } : d));
    const r = compareRoles(wide, expectedRoles('deploy', 'dev'));
    assert.equal(r.ok, false);
    assert.match(r.problems.join('\n'), /unexpected: Contributor at \/subscriptions\/[^/]+$/m);
    assert.equal(compareRoles(deploy, expectedRoles('plan')).ok, false);
  });

  test('refuses the role-assignment right without its condition, and a condition where none belongs', () => {
    const open = deploy.map((d) =>
      d.role.startsWith('Role Based') && d.scope === DEV ? { ...d, conditioned: false } : d,
    );
    assert.match(compareRoles(open, expectedRoles('deploy', 'dev')).problems.join(), /must carry its condition/);
    const odd = plan.map((p) => (p.role === 'Reader' ? { ...p, conditioned: true } : p));
    assert.match(compareRoles(odd, expectedRoles('plan')).problems.join(), /must not carry a condition/);
  });

  test('a Key Vault role in another environment does not count', () => {
    const other = [
      ...deploy,
      { role: 'Key Vault Secrets Officer', scope: VAULT.replace('rg-bakery-dev', 'rg-bakery-uat'), conditioned: false },
    ];
    assert.match(
      compareRoles(other, expectedRoles('deploy', 'dev')).problems.join(),
      /unexpected: Key Vault Secrets Officer/,
    );
  });

  test('the deploy identity cannot see its own state role; checking itself it passes without it, checked by the plan identity it must have it', () => {
    // What the deploy identity saw of itself in the first real apply run (2026-11-20): every role but the one in rg-bakery-tfstate.
    const seenBySelf = deploy.filter((d) => d.role !== 'Storage Blob Data Contributor');
    assert.equal(compareRoles(seenBySelf, expectedRoles('deploy', 'dev')).ok, true);
    const byPlan = compareRoles(seenBySelf, expectedRoles('deploy', 'dev', { asSelf: false }));
    assert.equal(byPlan.ok, false);
    assert.match(byPlan.problems.join(), /missing: Storage Blob Data Contributor/);
    assert.equal(compareRoles(deploy, expectedRoles('deploy', 'dev', { asSelf: false })).ok, true);
  });

  test('checked by the plan identity, a deploy role at a scope the deploy identity cannot read is still refused', () => {
    const extra = [...deploy, { role: 'Owner', scope: SUB, conditioned: false }];
    assert.match(
      compareRoles(extra, expectedRoles('deploy', 'dev', { asSelf: false })).problems.join(),
      /unexpected: Owner/,
    );
  });

  test('refuses an unknown identity', () => {
    assert.throws(() => expectedRoles('admin', 'dev'), /unknown identity/);
  });

  test('reads the object id from a token, and recognises a permission refusal', () => {
    const body = Buffer.from(JSON.stringify({ oid: 'abc-123', sub: 'x' })).toString('base64url');
    assert.equal(objectIdOf(`h.${body}.s`), 'abc-123');
    assert.throws(() => objectIdOf('nope'));
    assert.equal(
      isPermissionRefusal("(AuthorizationFailed) The client 'x' with object id 'y' does not have authorization"),
      true,
    );
    assert.equal(isPermissionRefusal('Connection reset by peer'), false);
  });
});
