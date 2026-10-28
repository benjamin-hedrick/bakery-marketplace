#!/usr/bin/env node
// Runs the pipeline's .NET test steps on Linux, in a clean container, from the COMMITTED tree (`git archive HEAD`).
// The Azure agent is Ubuntu and local development here is Windows, and the two differ in ways that hide bugs
// (for example, "/relative" parses as an absolute file:// URI on Linux only). Run this before pushing .NET changes.
//
//   node scripts/ci/linux-check.mjs            all three test steps, like azure-pipelines.yml
//   node scripts/ci/linux-check.mjs catalog    just one: tools | catalog | ordering
//
// Needs Docker. Uncommitted changes are NOT tested: commit first. Emulator-gated tests are skipped, as they are in the pipeline.
// Exit code 0 when every selected step passes.
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const image = 'mcr.microsoft.com/dotnet/sdk:10.0';

const steps = {
  tools: 'dotnet test tools/BakeryMarketplace.slnx --configuration Release',
  catalog: 'dotnet test services/catalog-service/tests/CatalogService.Tests --configuration Release',
  ordering: 'dotnet test services/ordering-service/tests/OrderingService.Tests --configuration Release',
};

const wanted = process.argv.slice(2);
const selected = wanted.length === 0 ? Object.keys(steps) : wanted;
const unknown = selected.filter((s) => !(s in steps));
if (unknown.length > 0) {
  console.error(`Unknown step(s): ${unknown.join(', ')}. Choose from: ${Object.keys(steps).join(', ')}.`);
  process.exit(2);
}

const work = path.join(os.tmpdir(), 'bakery-linux-check');
const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });

// A clean checkout of what is committed (a temporary worktree), so stale bin/obj folders from Windows cannot leak into the Linux build
// and the developer's own working tree and index are left alone.
git('worktree', 'remove', '--force', work);
rmSync(work, { recursive: true, force: true });
git('worktree', 'prune');
const add = git('worktree', 'add', '--detach', '--force', work, 'HEAD');
if (add.status !== 0) {
  console.error('Could not check out the committed tree.', add.stderr);
  process.exit(2);
}

let failed = false;
for (const name of selected) {
  console.log(`\n== ${name}`);
  const script = `${steps[name]} 2>&1 | grep -E "error|Passed!|Failed!|^  Failed |Skipped!" ; test \${PIPESTATUS[0]} -eq 0`;
  const run = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '-v',
      `${work}:/src`,
      '-v',
      'bakery-nuget-cache:/root/.nuget/packages', // keeps repeat runs fast
      '-w',
      '/src',
      '-e',
      'DOTNET_CLI_TELEMETRY_OPTOUT=1',
      '-e',
      'DOTNET_NOLOGO=1',
      image,
      'bash',
      '-c',
      script,
    ],
    { stdio: 'inherit' },
  );
  if (run.status !== 0) failed = true;
}

git('worktree', 'remove', '--force', work);
console.log(failed ? '\nLinux check FAILED.' : '\nLinux check passed.');
process.exit(failed ? 1 : 0);
