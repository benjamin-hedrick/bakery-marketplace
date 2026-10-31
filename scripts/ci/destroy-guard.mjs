#!/usr/bin/env node
// The guard on environment teardown (ADR-0020, decision 7). Reads a destroy plan as JSON (`terraform show -json tfplan`) and refuses unless
// the plan is a pure destroy confined to ONE environment's resource group, and the typed confirmation names that environment.
// The pipeline runs it between `terraform plan -destroy` and the approval, so the approver sees a plan that has already passed, and again
// before `terraform apply` on the saved plan.
//
//   node scripts/ci/destroy-guard.mjs --plan destroy-plan.json --environment dev --resource-group rg-bakery-dev --confirm dev
//
// Fails closed: a change whose resource group cannot be determined is a refusal, not a pass. Exit code 0 = safe to ask for approval,
// 1 = refused (the reasons are printed), 2 = bad usage or an unreadable plan.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Resource types that live in no resource group and hold nothing of value; they may be destroyed with the environment.
const NO_GROUP_TYPES = /^(random_|time_|null_|terraform_data)/;
const RESOURCE_GROUP_IN_ID = /\/resourcegroups\/([^/]+)/i;

/** The resource group a planned change belongs to, from the attributes Terraform records, or undefined when none says. */
export function resourceGroupOf(change) {
  const before = change.change?.before ?? {};
  if (change.type === 'azurerm_resource_group') return before.name;
  if (typeof before.resource_group_name === 'string') return before.resource_group_name;
  for (const key of ['resource_group_id', 'scope', 'id']) {
    const match = typeof before[key] === 'string' ? RESOURCE_GROUP_IN_ID.exec(before[key]) : null;
    if (match) return match[1];
  }
  return undefined;
}

/**
 * @param {object} plan   the parsed `terraform show -json` output
 * @param {{environment: string, resourceGroup: string, confirm: string}} expected
 * @returns {{ok: boolean, problems: string[], deleted: string[]}}
 */
export function checkDestroyPlan(plan, { environment, resourceGroup, confirm }) {
  const problems = [];
  const deleted = [];

  if (!environment || !/^[a-z][a-z0-9-]*$/.test(environment))
    problems.push('The environment name is missing or not a plain name.');
  if (confirm !== environment)
    problems.push(`The confirmation "${confirm ?? ''}" is not the environment name "${environment}".`);
  const group = (resourceGroup ?? '').toLowerCase();
  if (!group) problems.push('No resource group was given for the environment.');
  if (group && environment && !group.split('-').includes(environment)) {
    problems.push(`The resource group "${resourceGroup}" does not carry the environment name "${environment}".`);
  }
  if (/foundation|tfstate/.test(group))
    problems.push(
      `"${resourceGroup}" is a persistent group (foundation or state); it is never torn down with an environment.`,
    );

  if (!plan || !Array.isArray(plan.resource_changes)) {
    problems.push('The plan has no resource_changes; it is not a Terraform plan in JSON.');
    return { ok: false, problems, deleted };
  }

  for (const change of plan.resource_changes) {
    if (change.mode === 'data') continue; // reads of existing things; nothing is changed
    const actions = change.change?.actions ?? [];
    if (actions.length === 1 && actions[0] === 'no-op') continue;
    if (!(actions.length === 1 && actions[0] === 'delete')) {
      problems.push(
        `${change.address}: planned action is [${actions.join(', ')}], not a pure delete. A teardown must only destroy.`,
      );
      continue;
    }
    deleted.push(change.address);

    const tags = change.change?.before?.tags ?? {};
    if (tags.Stack === 'foundation' || tags.Lifetime === 'persistent') {
      problems.push(
        `${change.address}: tagged as persistent foundation (Stack=${tags.Stack ?? ''}, Lifetime=${tags.Lifetime ?? ''}); it must not be destroyed here.`,
      );
      continue;
    }
    const owner = resourceGroupOf(change);
    if (owner === undefined) {
      if (!NO_GROUP_TYPES.test(change.type))
        problems.push(`${change.address}: cannot tell which resource group it is in, so it is not allowed.`);
      continue;
    }
    if (owner.toLowerCase() !== group)
      problems.push(`${change.address}: is in resource group "${owner}", not "${resourceGroup}".`);
  }
  return { ok: problems.length === 0, problems, deleted };
}

function main() {
  const argv = process.argv.slice(2);
  const get = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const planPath = get('--plan');
  if (!planPath) {
    console.error(
      'usage: destroy-guard.mjs --plan <plan.json> --environment <name> --resource-group <name> --confirm <name>',
    );
    process.exit(2);
  }
  let plan;
  try {
    plan = JSON.parse(readFileSync(planPath, 'utf8'));
  } catch (e) {
    console.error(`cannot read the plan: ${e.message}`);
    process.exit(2);
  }
  const result = checkDestroyPlan(plan, {
    environment: get('--environment'),
    resourceGroup: get('--resource-group'),
    confirm: get('--confirm'),
  });
  if (result.ok) {
    console.log(
      `destroy guard: OK. ${result.deleted.length} resource(s) would be deleted, all in "${get('--resource-group')}".`,
    );
    for (const a of result.deleted) console.log(`  - ${a}`);
    process.exit(0);
  }
  console.error('destroy guard: REFUSED');
  for (const p of result.problems) console.error(`  - ${p}`);
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
