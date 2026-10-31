#!/usr/bin/env node
// Terraform checks that need no Azure account and no credentials (ADR-0020): formatting of everything under infra/, then for each stack
// `init -backend=false`, `validate`, and `test` (plan-level tests with a mocked provider, when the stack has a tests folder).
// The pipeline's `terraform` job runs this same script on every pull request, so the image and the steps live here only.
//
//   node scripts/ci/terraform-checks.mjs [--roots infra/foundation,infra/environments/dev]
//
// Needs Docker; the first run pulls the image and the azurerm provider. Exit code 0 when every step passes, 1 when a step fails,
// 2 when Docker could not run. What this does NOT prove: that Azure accepts the plan (needs a real `plan`), anything about state, identity
// or permissions. Those are proved by the gated runs (docs/operations/runbooks/prove-the-pipeline-gates.md).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// Pinned by digest (Terraform 1.13.5) so a new release cannot change the result unnoticed. Update deliberately.
const image = 'hashicorp/terraform@sha256:6bbb82d575aa7bd4f0a2c6e3a0838ab9590426c08a71d7a2783643f01004d356';

const argv = process.argv.slice(2);
const rootsArg = argv.includes('--roots') ? argv[argv.indexOf('--roots') + 1] : undefined;
const roots = (rootsArg ?? 'infra/foundation,infra/environments/dev').split(',').map((r) => r.trim());

function terraform(workdir, args) {
  const docker = ['run', '--rm', '-e', 'HOME=/tmp', '-e', 'TF_IN_AUTOMATION=1', '-e', 'TF_INPUT=0'];
  // On Linux the container user must own the mounted files, or the folder it writes (.terraform) is owned by root.
  if (process.platform !== 'win32') docker.push('--user', `${process.getuid()}:${process.getgid()}`);
  docker.push('-v', `${root}:/repo`, '-w', `/repo/${workdir}`, image, ...args);
  return spawnSync('docker', docker, { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
}

const steps = [
  { name: 'fmt (all of infra/)', workdir: 'infra', args: ['fmt', '-check', '-diff', '-recursive', '-no-color'] },
];
for (const r of roots) {
  steps.push({ name: `${r}: init`, workdir: r, args: ['init', '-backend=false', '-input=false', '-no-color'] });
  steps.push({ name: `${r}: validate`, workdir: r, args: ['validate', '-no-color'] });
  if (existsSync(path.join(root, r, 'tests')))
    steps.push({ name: `${r}: test (mocked provider)`, workdir: r, args: ['test', '-no-color'] });
}

let failed = 0;
for (const step of steps) {
  const started = Date.now();
  const r = terraform(step.workdir, step.args);
  if (r.error || r.status === 125 || r.status === 126 || r.status === 127) {
    console.error(`terraform checks could not run (is Docker running?): ${r.error?.message ?? r.stderr}`);
    process.exit(2);
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (r.status === 0) {
    console.log(`PASS  ${step.name} (${seconds}s)`);
  } else {
    failed += 1;
    console.log(`FAIL  ${step.name} (${seconds}s)`);
    console.log(
      `${r.stdout}${r.stderr}`
        .split('\n')
        .map((l) => `      ${l}`)
        .join('\n'),
    );
  }
}
console.log(failed === 0 ? `\nAll ${steps.length} steps passed.` : `\n${failed} of ${steps.length} steps FAILED.`);
process.exit(failed === 0 ? 0 : 1);
