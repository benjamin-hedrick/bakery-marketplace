#!/usr/bin/env node
// The post-apply secret step of the dev pipeline (ADR-0020 amendment of 2026-10-31; register 108; the rules decided on 2026-11-20 in
// docs/architecture/secrets-and-sensitive-values.md, decision 3). Runs as bakery-deploy (Key Vault Secrets Officer on the dev vault) inside the
// approved application deploy job, before the apps are updated:
//
//   node scripts/ci/dev-secrets.mjs --vault <name> --cosmos-account <name> --resource-group <name> --temp <job temp folder>
//
// Terraform creates each secret with a placeholder (write-only value_wo, never in the state). For each secret whose newest version is not one
// this step wrote, it sets the real value: the Cosmos connection string read from Azure, or a new random value (32 bytes, base64url, the format
// scripts/dev/init-env.mjs uses locally). A secret this step already set is left alone, so a second deploy does not rotate the session key (which
// would log everyone out). Which version is which is told by its tags, read with the versions list, which never returns a value.
//
// How a value travels: never on a command line and never in a shell variable. It is held in this process, masked in the pipeline log
// (##vso[task.setsecret]), written to a file (mode 600) in a private folder (mode 700) under the job's temporary folder, read from there by
// "az keyvault secret set --file", and the folder is deleted at once. Azure CLI output is switched off for the write, which would echo the value.
// Exit code 0 = every secret is real, 1 = an Azure call failed or something is not as expected, 2 = bad usage.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The tag this step puts on every version it writes. Terraform's placeholder version carries the stack's tags, not this one. */
export const WRITTEN_BY = { key: 'written-by', value: 'post-apply-step' };

/** The secrets of infra/modules/environment/main.tf (local.placeholder_secrets) and where each value comes from. */
export const SECRETS = [
  { name: 'cosmos-connection-string', source: 'cosmos' },
  { name: 'ordering-client-secret', source: 'random' },
  { name: 'session-encryption-key', source: 'random' },
];

/** A new random secret: 32 bytes, base64url (what the session store and the mock issuer's client secret expect). */
export function newSecret() {
  return randomBytes(32).toString('base64url');
}

/**
 * Whether a secret needs its real value, from its versions as "az keyvault secret list-versions" lists them (attributes and tags, no values).
 * The newest enabled version decides: written by this step means done; anything else (Terraform's placeholder, or a placeholder made again on a
 * vault recovered from soft delete) means it must be written.
 */
export function needsValue(versions) {
  const enabled = (versions ?? []).filter((v) => v?.attributes?.enabled !== false);
  if (enabled.length === 0)
    throw new Error('the secret has no enabled version; Terraform creates it with a placeholder, so apply first');
  const newest = enabled.reduce((a, b) =>
    String(b.attributes?.created ?? '') > String(a.attributes?.created ?? '') ? b : a,
  );
  return newest.tags?.[WRITTEN_BY.key] !== WRITTEN_BY.value;
}

/** The SQL API's primary connection string from "az cosmosdb keys list --type connection-strings". */
export function primaryConnectionString(listed) {
  const all = listed?.connectionStrings ?? [];
  const primary = all.filter(
    (c) => c?.description === 'Primary SQL Connection String' || (c?.keyKind === 'Primary' && c?.type === 'SQL'),
  );
  if (
    primary.length !== 1 ||
    typeof primary[0].connectionString !== 'string' ||
    !primary[0].connectionString.startsWith('AccountEndpoint=')
  )
    throw new Error(`expected one primary SQL connection string, found ${primary.length}`);
  return primary[0].connectionString;
}

/** The arguments that write one secret: the value only from the file, the output switched off (it would print the value). */
export function setArgs(vault, name, file) {
  return [
    'keyvault',
    'secret',
    'set',
    '--vault-name',
    vault,
    '--name',
    name,
    '--file',
    file,
    '--encoding',
    'utf-8',
    '--tags',
    `${WRITTEN_BY.key}=${WRITTEN_BY.value}`,
    '--output',
    'none',
  ];
}

/**
 * Sets every secret that still has its placeholder.
 * @param {{vault: string, cosmosAccount: string, resourceGroup: string, temp: string}} options
 * @param {(args: string[]) => string} az  runs the Azure CLI and returns its standard output (never printed)
 * @param {(line: string) => void} log
 * @returns {{name: string, action: 'set'|'kept'}[]}
 */
export function setSecrets({ vault, cosmosAccount, resourceGroup, temp }, az, log = console.log) {
  const results = [];
  for (const secret of SECRETS) {
    const versions = JSON.parse(
      az(['keyvault', 'secret', 'list-versions', '--vault-name', vault, '--name', secret.name, '--output', 'json']),
    );
    if (!needsValue(versions)) {
      log(`${secret.name}: already set by this step; left as it is.`);
      results.push({ name: secret.name, action: 'kept' });
      continue;
    }
    const value =
      secret.source === 'cosmos'
        ? primaryConnectionString(
            JSON.parse(
              az([
                'cosmosdb',
                'keys',
                'list',
                '--name',
                cosmosAccount,
                '--resource-group',
                resourceGroup,
                '--type',
                'connection-strings',
                '--output',
                'json',
              ]),
            ),
          )
        : newSecret();
    log(`##vso[task.setsecret]${value}`);
    const dir = mkdtempSync(path.join(temp, 'kv-'));
    try {
      const file = path.join(dir, 'value');
      writeFileSync(file, value, { mode: 0o600 });
      az(setArgs(vault, secret.name, file));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    log(
      `${secret.name}: set (${secret.source === 'cosmos' ? "the Cosmos account's primary connection string" : 'a new random value'}).`,
    );
    results.push({ name: secret.name, action: 'set' });
  }
  return results;
}

function main() {
  const argv = process.argv.slice(2);
  const get = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const options = {
    vault: get('--vault'),
    cosmosAccount: get('--cosmos-account'),
    resourceGroup: get('--resource-group'),
    temp: get('--temp'),
  };
  if (Object.values(options).some((v) => !v || v.startsWith('$('))) {
    console.error(
      'usage: dev-secrets.mjs --vault <name> --cosmos-account <name> --resource-group <name> --temp <folder>',
    );
    process.exit(2);
  }
  // Written for the pipeline's Linux agent (on Windows the CLI is az.cmd, which execFileSync does not start without a shell).
  const az = (args) => execFileSync('az', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    const results = setSecrets(options, az);
    console.log(
      `dev secrets: ${results.filter((r) => r.action === 'set').length} set, ${results.filter((r) => r.action === 'kept').length} kept.`,
    );
  } catch (e) {
    // The message never holds a value: values are only in the file and the masking line.
    console.error(`dev secrets: ${e.message.split('\n')[0]}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
