#!/usr/bin/env node
// The summary of a Terraform plan that the dev pipeline publishes (ADR-0020; WI-DEP-001). A saved plan holds every input and every refreshed
// attribute in clear text, sensitive ones included, so the pipeline never publishes it: it publishes this summary, which keeps only each
// resource's address and planned actions, the names of changed outputs and the counts. No attribute value is copied, so nothing in a
// resource (a name, an id, a key) can reach the artifact.
//
//   node scripts/ci/plan-summary.mjs --plan plan.json --exit-code <terraform plan -detailed-exitcode result> --out summary.json
//
// It also sets the pipeline output variable hasChanges from the plan's exit code (0 = no changes, 2 = changes), after checking that the
// plan's JSON agrees with it. Exit code 0 = summary written, 1 = the exit code and the plan disagree or the plan failed, 2 = bad usage or an
// unreadable plan.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ACTION_ORDER = ['create', 'update', 'replace', 'delete', 'read'];

/** The action word for one change: Terraform writes a replacement as [delete, create] or [create, delete]. */
function actionOf(actions) {
  if (actions.length === 2 && actions.includes('delete') && actions.includes('create')) return 'replace';
  return actions.length === 1 ? actions[0] : actions.join('+');
}

/**
 * @param {object} plan  the parsed `terraform show -json` output
 * @returns {{terraformVersion: string|undefined, changes: {address: string, action: string}[], outputs: string[],
 *   counts: Record<string, number>, hasChanges: boolean}}
 */
export function summarisePlan(plan) {
  if (!plan || !Array.isArray(plan.resource_changes ?? []))
    throw new Error('the plan has no resource_changes list; it is not a Terraform plan in JSON');
  const changes = [];
  for (const change of plan.resource_changes ?? []) {
    if (change.mode === 'data') continue;
    const action = actionOf(change.change?.actions ?? []);
    if (action === 'no-op' || action === '') continue;
    changes.push({ address: String(change.address), action });
  }
  const outputs = Object.entries(plan.output_changes ?? {})
    .filter(([, c]) => !(c?.actions?.length === 1 && c.actions[0] === 'no-op'))
    .map(([name]) => name)
    .sort();
  const counts = Object.fromEntries(ACTION_ORDER.map((a) => [a, 0]));
  for (const { action } of changes) counts[action] = (counts[action] ?? 0) + 1;
  return {
    terraformVersion: typeof plan.terraform_version === 'string' ? plan.terraform_version : undefined,
    changes,
    outputs,
    counts,
    hasChanges: changes.length > 0 || outputs.length > 0,
  };
}

/** Checks the plan's exit code against the summary; returns a problem sentence, or undefined when they agree. */
export function checkExitCode(exitCode, summary) {
  if (exitCode === 0 && summary.hasChanges)
    return 'terraform plan said "no changes" (exit 0) but the plan lists changes.';
  if (exitCode === 2 && !summary.hasChanges) return 'terraform plan said "changes" (exit 2) but the plan lists none.';
  if (exitCode !== 0 && exitCode !== 2) return `terraform plan failed (exit ${exitCode}).`;
  return undefined;
}

function main() {
  const argv = process.argv.slice(2);
  const get = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const planPath = get('--plan');
  const exitCode = Number(get('--exit-code'));
  const outPath = get('--out');
  if (!planPath || !outPath || !Number.isInteger(exitCode)) {
    console.error('usage: plan-summary.mjs --plan <plan.json> --exit-code <0|2> --out <summary.json>');
    process.exit(2);
  }
  let summary;
  try {
    summary = summarisePlan(JSON.parse(readFileSync(planPath, 'utf8')));
  } catch (e) {
    console.error(`cannot read the plan: ${e.message}`);
    process.exit(2);
  }
  const problem = checkExitCode(exitCode, summary);
  if (problem) {
    console.error(`plan summary: REFUSED. ${problem}`);
    process.exit(1);
  }
  writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
  const counted = ACTION_ORDER.filter((a) => summary.counts[a] > 0).map((a) => `${summary.counts[a]} to ${a}`);
  console.log(
    `plan summary: ${counted.length ? counted.join(', ') : 'no resource changes'}; ${summary.outputs.length} output(s) changed.`,
  );
  for (const c of summary.changes) console.log(`  ${c.action.padEnd(8)} ${c.address}`);
  console.log(`##vso[task.setvariable variable=hasChanges;isOutput=true]${summary.hasChanges}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
