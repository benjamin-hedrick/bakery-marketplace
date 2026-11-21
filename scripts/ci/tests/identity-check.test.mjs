import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { compareRoles, expectedRoles, isPermissionRefusal, objectIdOf } from '../identity-check.mjs';

const SUB = '/subscriptions/00000000-0000-0000-0000-000000000000';
const STATE = `${SUB}/resourceGroups/rg-bakery-tfstate/providers/Microsoft.Storage/storageAccounts/sttest/blobServices/default/containers/tfstate`;
const DEV = `${SUB}/resourceGroups/rg-bakery-dev`;
const FOUNDATION = `${SUB}/resourceGroups/rg-bakery-foundation`;
const REGISTRY = `${FOUNDATION}/providers/Microsoft.ContainerRegistry/registries/bakerytest`;
const VAULT = `${DEV}/providers/Microsoft.KeyVault/vaults/kv-bakery-dev-test`;

const plan = [
  { role: 'Reader', scope: SUB, conditioned: false },
  { role: 'Storage Blob Data Reader', scope: STATE, conditioned: false },
];
const deploy = [
  { role: 'Contributor', scope: DEV, conditioned: false },
  { role: 'Contributor', scope: FOUNDATION, conditioned: false },
  { role: 'Role Based Access Control Administrator', scope: DEV, conditioned: true },
  { role: 'Role Based Access Control Administrator', scope: FOUNDATION, conditioned: true },
  { role: 'Storage Blob Data Contributor', scope: STATE, conditioned: false },
  { role: 'AcrPush', scope: REGISTRY, conditioned: false },
];

describe('the UAT identities (WI-DEP-002 step 7)', () => {
  const UAT = `${SUB}/resourceGroups/rg-bakery-uat`;
  const STATE_UAT = STATE.replace(/tfstate$/, 'tfstate-uat');
  const APPS_UAT = `${FOUNDATION}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-bakery-uat-apps`;
  const uatDeploy = [
    { role: 'Contributor', scope: UAT, conditioned: false },
    { role: 'Role Based Access Control Administrator', scope: UAT, conditioned: true },
    { role: 'Storage Blob Data Contributor', scope: STATE_UAT, conditioned: false },
    { role: 'Managed Identity Operator', scope: APPS_UAT, conditioned: false },
    { role: 'AcrPull', scope: REGISTRY, conditioned: false },
  ];

  test('the shared plan identity passes with or without its read of the UAT state container, for either environment', () => {
    const withUat = [...plan, { role: 'Storage Blob Data Reader', scope: STATE_UAT, conditioned: false }];
    for (const env of ['dev', 'uat']) {
      assert.equal(compareRoles(plan, expectedRoles('plan', env)).ok, true, env);
      assert.equal(compareRoles(withUat, expectedRoles('plan', env)).ok, true, env);
    }
  });

  test('the UAT deploy identity passes with exactly its promote-run roles, checked by itself and by the plan identity', () => {
    assert.deepEqual(compareRoles(uatDeploy, expectedRoles('deploy', 'uat', { asSelf: false })), {
      ok: true,
      problems: [],
    });
    const asSelf = uatDeploy.filter((r) => r.role !== 'Storage Blob Data Contributor');
    assert.equal(compareRoles(asSelf, expectedRoles('deploy', 'uat')).ok, true, 'it cannot see its state role itself');
    const withVault = [
      ...uatDeploy,
      {
        role: 'Key Vault Secrets Officer',
        scope: `${UAT}/providers/Microsoft.KeyVault/vaults/kv-uat`,
        conditioned: false,
      },
    ];
    assert.equal(compareRoles(withVault, expectedRoles('deploy', 'uat', { asSelf: false })).ok, true);
  });

  test("the UAT deploy identity is refused dev's state, any foundation group role, AcrPush, or the other environment's apps identity", () => {
    for (const extra of [
      { role: 'Storage Blob Data Contributor', scope: STATE, conditioned: false },
      { role: 'Contributor', scope: FOUNDATION, conditioned: false },
      { role: 'Role Based Access Control Administrator', scope: FOUNDATION, conditioned: true },
      { role: 'AcrPush', scope: REGISTRY, conditioned: false },
      { role: 'Contributor', scope: DEV, conditioned: false },
      { role: 'Managed Identity Operator', scope: APPS_UAT.replace('-uat-', '-dev-'), conditioned: false },
    ])
      assert.equal(
        compareRoles([...uatDeploy, extra], expectedRoles('deploy', 'uat', { asSelf: false })).ok,
        false,
        `${extra.role} at ${extra.scope}`,
      );
    const wrongApps = uatDeploy.map((r) =>
      r.role === 'Managed Identity Operator' ? { ...r, scope: APPS_UAT.replace('-uat-', '-dev-') } : r,
    );
    assert.equal(compareRoles(wrongApps, expectedRoles('deploy', 'uat', { asSelf: false })).ok, false);
  });

  test("dev's deploy identity is unchanged by the UAT set", () => {
    assert.equal(compareRoles(deploy, expectedRoles('deploy', 'dev', { asSelf: false })).ok, true);
    assert.equal(compareRoles(uatDeploy, expectedRoles('deploy', 'dev', { asSelf: false })).ok, false);
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
