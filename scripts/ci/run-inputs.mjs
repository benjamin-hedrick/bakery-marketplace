#!/usr/bin/env node
// The environment pipelines' issuer inputs (WI-DEP-002 step 3), checked and turned into the Terraform variables the environment module takes.
// scripts/ci/dev-stack-env.sh calls it, so the plan and the apply after approval get exactly the same values from the same run inputs.
//
//   node scripts/ci/run-inputs.mjs check  --mock-issuer <true|false> --roles <list> --allowed-ips <list|none>
//       exit 0 and nothing printed when the inputs are acceptable; exit 1 and the reasons otherwise (the inputs stage runs this)
//   node scripts/ci/run-inputs.mjs tfvars --mock-issuer <true|false> --roles <list> --allowed-ips <list|none>
//       prints three lines, NAME=value, for TF_VAR_issuer_mode, TF_VAR_issuer_roles and TF_VAR_allowed_ips (JSON lists)
//
// Azure DevOps prints a boolean parameter as True or False. No input is a secret, but an allowed IP is the lead's own address: it is shown in the
// run's parameters, so this prints it only into the variables (never to the log).
import { fileURLToPath } from 'node:url';

/** The roles the mock issuer knows (tools/BakeryMarketplace.Auth/MockOidcDeployment.cs). */
export const ROLES = ['Customer', 'Vendor', 'Admin'];

const CIDR = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}\/(3[0-2]|[12]?\d)$/;

/** Splits a comma- or space-separated list; "none" or empty is the empty list. */
export function list(text) {
  const t = String(text ?? '').trim();
  if (t === '' || t.toLowerCase() === 'none') return [];
  return t.split(/[\s,]+/).filter(Boolean);
}

/** True for Azure DevOps' True/true, false for False/false; anything else is an error. */
export function bool(text) {
  if (/^true$/i.test(String(text))) return true;
  if (/^false$/i.test(String(text))) return false;
  throw new Error(`not a boolean: ${text}`);
}

/**
 * Checks the inputs. Returns {problems, tfvars}: the reasons to refuse (empty when acceptable) and, when acceptable, the Terraform values.
 * Until Entra External ID exists (register 222) the mock issuer is the only issuer, so a run with it off is refused (decided by the lead 2026-11-21);
 * the module refuses entra mode without its addresses as well.
 */
export function inputs({ mockIssuer, roles, allowedIps }) {
  const problems = [];
  let mock;
  try {
    mock = bool(mockIssuer);
  } catch (e) {
    problems.push(`mockIssuer: ${e.message}`);
  }
  if (mock === false)
    problems.push(
      'mockIssuer is off, and until Entra External ID exists (register 222) the environment has no other issuer: nobody could log in. Run with mockIssuer on.',
    );
  const r = list(roles);
  if (r.length === 0) problems.push('issuerRoles names no role');
  for (const role of r)
    if (!ROLES.includes(role)) problems.push(`issuerRoles: unknown role ${role} (known: ${ROLES.join(', ')})`);
  if (new Set(r).size !== r.length) problems.push('issuerRoles names a role twice');
  if (!r.includes('Customer') && r.length > 0)
    problems.push('issuerRoles must include Customer (the deployed suite logs in as customers)');
  const ips = list(allowedIps);
  for (const ip of ips) if (!CIDR.test(ip)) problems.push(`issuerAllowedIps: not an IPv4 CIDR range: ${ip}`);
  if (r.some((x) => x !== 'Customer') && ips.length === 0)
    problems.push(
      'a role other than Customer may log in only when issuerAllowedIps restricts the environment (the mock issuer refuses it otherwise)',
    );
  if (problems.length > 0) return { problems, tfvars: null };
  return {
    problems,
    tfvars: {
      TF_VAR_issuer_mode: mock ? 'mock' : 'entra',
      TF_VAR_issuer_roles: JSON.stringify(r),
      TF_VAR_allowed_ips: JSON.stringify(ips),
    },
  };
}

function main() {
  const argv = process.argv.slice(2);
  const get = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const command = argv[0];
  const given = { mockIssuer: get('--mock-issuer'), roles: get('--roles'), allowedIps: get('--allowed-ips') };
  if (!['check', 'tfvars'].includes(command) || Object.values(given).some((v) => v === undefined)) {
    console.error(
      'usage: run-inputs.mjs check|tfvars --mock-issuer <true|false> --roles <list> --allowed-ips <list|none>',
    );
    process.exit(2);
  }
  const { problems, tfvars } = inputs(given);
  if (problems.length > 0) {
    // tfvars runs inside $(...), which keeps standard output: its reasons go to standard error so the step's log shows them.
    const say = command === 'tfvars' ? console.error : console.log;
    for (const p of problems) say(`##vso[task.logissue type=error]${p}`);
    process.exit(1);
  }
  if (command === 'tfvars') for (const [k, v] of Object.entries(tfvars)) console.log(`${k}=${v}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
