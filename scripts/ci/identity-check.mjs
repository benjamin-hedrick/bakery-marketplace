#!/usr/bin/env node
// The pipeline identities' role checks (bootstrap check 6, docs/operations/runbooks/bootstrap-terraform-state.md; ADR-0020, WI-DEP-001).
//
//   node scripts/ci/identity-check.mjs --identity plan|deploy [--environment dev] [--probe-name rg-...]
//       The signed-in identity checks itself: it lists its own role assignments and fails unless they are exactly the expected ones, then
//       tries to create a resource group and fails unless Azure refuses. Its object id comes from its own token (the pipeline identities have
//       no Microsoft Graph permission to look themselves up).
//   node scripts/ci/identity-check.mjs --identity deploy --principal <object id> [--environment dev]
//       The signed-in plan identity checks another identity's complete role set. An identity sees only the assignments at scopes it can read:
//       the deploy identity cannot read rg-bakery-tfstate, so its own check cannot see its state role, nor any assignment at a scope it cannot
//       read (seen 2026-11-20). The plan identity reads the whole subscription and sees all of them. No create probe in this mode.
//
// Exit code 0 = exactly the expected roles (and, checking itself, creating was refused), 1 = not, 2 = bad usage or an Azure call that failed
// for another reason.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * What each identity must hold (ADR-0020; the bootstrap and the 2026-11-20 evidence; narrowed per environment by register 231, the lead's direction
 * of 2026-11-21: no identity of one environment holds a role on the other's resources). `optional` entries may be absent: the deploy identity's
 * Key Vault role exists only while an environment does (the environment stack creates it), and the deploy identity cannot see its own state role.
 * `conditioned` says whether the assignment must carry a condition (the constrained role-assignment right) or must not.
 *
 * Each environment has its own plan identity (bakery-plan for dev, bakery-uat-plan for UAT) and its own deploy identity (bakery-deploy,
 * bakery-uat-deploy). Every one of them is checked for exactly this set, so a role added by hand later fails the next run.
 */
export function expectedRoles(identity, environment = 'dev', { asSelf = true } = {}) {
  const group = (name) => new RegExp(`^/subscriptions/[^/]+/resourceGroups/${name}$`, 'i');
  // dev's state is in the container tfstate (with the foundation's), every other environment's in tfstate-<environment> (WI-DEP-002).
  const stateContainer = new RegExp(
    `/blobServices/default/containers/${environment === 'dev' ? 'tfstate' : `tfstate-${environment}`}$`,
    'i',
  );
  const registry =
    /^\/subscriptions\/[^/]+\/resourceGroups\/rg-bakery-foundation\/providers\/Microsoft\.ContainerRegistry\/registries\/[^/]+$/i;
  const appsIdentity = new RegExp(
    `^/subscriptions/[^/]+/resourceGroups/rg-bakery-foundation/providers/Microsoft\\.ManagedIdentity/userAssignedIdentities/id-bakery-${environment}-apps$`,
    'i',
  );
  const vault = new RegExp(
    `^/subscriptions/[^/]+/resourceGroups/rg-bakery-${environment}/providers/Microsoft\\.KeyVault/vaults/[^/]+$`,
    'i',
  );
  // The plan identity reads the subscription (it checks the deploy identity's complete roles, which needs every scope) and its own environment's
  // state only. Reader gives no secret: listing keys, reading Key Vault secrets and registry credentials are actions Reader does not hold.
  if (identity === 'plan')
    return [
      { role: 'Reader', scope: /^\/subscriptions\/[^/]+$/i, conditioned: false },
      { role: 'Storage Blob Data Reader', scope: stateContainer, conditioned: false },
    ];
  if (identity !== 'deploy') throw new Error(`unknown identity "${identity}" (plan or deploy)`);
  // The deploy identity: its own group, its own state, its own apps identity, and the shared registry. In the foundation group it only reads
  // (az acr list and az acr login look the registry up there); the foundation itself is applied by the lead, never by a pipeline. Managed Identity
  // Operator on its own apps identity is what lets Terraform give the environment's container apps that identity (an action on the identity), and
  // nothing else: it cannot add credentials to the identity or touch the other environment's.
  const roles = [
    { role: 'Contributor', scope: group(`rg-bakery-${environment}`), conditioned: false },
    { role: 'Role Based Access Control Administrator', scope: group(`rg-bakery-${environment}`), conditioned: true },
    // Not visible to the deploy identity itself (it cannot read rg-bakery-tfstate); checked by the plan identity instead (--principal).
    { role: 'Storage Blob Data Contributor', scope: stateContainer, conditioned: false, optional: asSelf },
    { role: 'Reader', scope: group('rg-bakery-foundation'), conditioned: false },
    { role: 'Managed Identity Operator', scope: appsIdentity, conditioned: false },
    { role: 'Key Vault Secrets Officer', scope: vault, conditioned: false, optional: true },
  ];
  // dev builds and pushes the images; UAT deploys dev's digests and only reads the registry (the build tags of what its apps run, register 110).
  roles.push({ role: environment === 'dev' ? 'AcrPush' : 'AcrPull', scope: registry, conditioned: false });
  return roles;
}

/**
 * @param {{role: string, scope: string, conditioned: boolean}[]} held  the identity's assignments, role names resolved
 * @param {ReturnType<typeof expectedRoles>} expected
 * @returns {{ok: boolean, problems: string[]}}
 */
export function compareRoles(held, expected) {
  const problems = [];
  const used = new Set();
  for (const want of expected) {
    const matches = held.filter((h, i) => !used.has(i) && h.role === want.role && want.scope.test(h.scope));
    if (matches.length === 0) {
      if (!want.optional) problems.push(`missing: ${want.role} at a scope matching ${want.scope}`);
      continue;
    }
    if (matches.length > 1) problems.push(`more than one ${want.role} at a scope matching ${want.scope}`);
    const index = held.indexOf(matches[0]);
    used.add(index);
    if (matches[0].conditioned !== want.conditioned)
      problems.push(
        `${want.role} at ${matches[0].scope}: ${want.conditioned ? 'must carry its condition' : 'must not carry a condition'}`,
      );
  }
  held.forEach((h, i) => {
    if (!used.has(i)) problems.push(`unexpected: ${h.role} at ${h.scope}`);
  });
  return { ok: problems.length === 0, problems };
}

/** The object id (oid claim) of a JWT access token. */
export function objectIdOf(token) {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('not a JWT');
  const claims = JSON.parse(Buffer.from(payload.replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString('utf8'));
  if (typeof claims.oid !== 'string') throw new Error('the token has no oid claim');
  return claims.oid;
}

/** Whether the output of a refused `az group create` is a permission refusal (and not, say, a network failure). */
export function isPermissionRefusal(output) {
  return /AuthorizationFailed|does not have authorization/i.test(output);
}

// The pipeline runs this on Linux, where az is called directly. On Windows (a local check) az is a .cmd that needs a shell, so each argument
// is quoted for cmd (an & in a URL would otherwise end the command).
const az = (args) =>
  (process.platform === 'win32'
    ? execFileSync(`az.cmd ${args.map((a) => `"${a.replaceAll('"', '""')}"`).join(' ')}`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      })
    : execFileSync('az', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  ).trim();

function main() {
  const argv = process.argv.slice(2);
  const get = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const identity = get('--identity');
  const environment = get('--environment') ?? 'dev';
  const probe = get('--probe-name') ?? `rg-bakery-identity-probe-${Date.now()}`;
  const principal = get('--principal');
  if (principal !== undefined && !/^[0-9a-f-]{36}$/i.test(principal)) {
    console.error('identity check: --principal must be an object id');
    process.exit(2);
  }
  let expected;
  try {
    expected = expectedRoles(identity, environment, { asSelf: principal === undefined });
  } catch (e) {
    console.error(
      `usage: identity-check.mjs --identity plan|deploy [--environment dev] [--principal <object id>]: ${e.message}`,
    );
    process.exit(2);
  }

  let held;
  try {
    const sub = az(['account', 'show', '--query', 'id', '-o', 'tsv']);
    const self = objectIdOf(az(['account', 'get-access-token', '--query', 'accessToken', '-o', 'tsv']));
    const oid = principal ?? self;
    console.log(
      principal
        ? `Signed in as object id ${self}, checking the ${identity} identity, object id ${oid}`
        : `Signed in as the ${identity} identity, object id ${oid}`,
    );
    const listUrl = `https://management.azure.com/subscriptions/${sub}/providers/Microsoft.Authorization/roleAssignments?api-version=2022-04-01&$filter=principalId%20eq%20'${oid}'`;
    const assignments = JSON.parse(az(['rest', '--method', 'get', '--url', listUrl])).value ?? [];
    const names = new Map();
    held = assignments.map((a) => {
      const id = a.properties.roleDefinitionId;
      if (!names.has(id))
        names.set(
          id,
          az([
            'rest',
            '--method',
            'get',
            '--url',
            `https://management.azure.com${id}?api-version=2022-04-01`,
            '--query',
            'properties.roleName',
            '-o',
            'tsv',
          ]),
        );
      return { role: names.get(id), scope: a.properties.scope, conditioned: a.properties.condition != null };
    });
  } catch (e) {
    console.error(`identity check: an Azure call failed: ${e.stderr ?? e.message}`);
    process.exit(2);
  }
  for (const h of held) console.log(`  ${h.role} at ${h.scope} (condition: ${h.conditioned})`);

  const result = compareRoles(held, expected);
  if (!result.ok) {
    for (const p of result.problems) console.log(`##vso[task.logissue type=error]Identity check: ${p}`);
    process.exit(1);
  }
  if (principal) {
    console.log(`The ${identity} identity's roles are exactly the ${held.length} expected.`);
    process.exit(0);
  }

  try {
    az(['group', 'create', '-n', probe, '-l', 'eastus', '--tags', 'Purpose=identity-probe']);
  } catch (e) {
    const output = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    if (isPermissionRefusal(output)) {
      console.log(
        `Roles are exactly the ${held.length} expected, and creating a resource group was refused (AuthorizationFailed).`,
      );
      process.exit(0);
    }
    console.error(`identity check: creating ${probe} failed, but not for lack of permission:\n${output}`);
    process.exit(2);
  }
  console.log(
    `##vso[task.logissue type=error]The ${identity} identity created ${probe}; it must not be able to. Deleting it.`,
  );
  try {
    az(['group', 'delete', '-n', probe, '--yes', '--no-wait']);
  } catch {
    // reported above; the run fails either way
  }
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
