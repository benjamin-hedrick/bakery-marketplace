#!/usr/bin/env node
// Runs the pipeline's .NET job on Linux, in clean containers, from the COMMITTED tree.
// The Azure agent is Ubuntu and local development here is Windows, and the two differ in ways that hide bugs
// (for example, "/relative" parses as an absolute file:// URI on Linux only). Run this before pushing .NET changes.
//
//   node scripts/ci/linux-check.mjs                      every step below, in the pipeline's order
//   node scripts/ci/linux-check.mjs tools catalog        just those steps
//
// Steps (azure-pipelines.yml, job `dotnet`): build, format (whitespace and style), tools, catalog, ordering. A real Redis runs beside them
// and, like the pipeline's finding A8 check, the tests must have used it (the adapter tests fall back to fakes when Redis is unreachable).
// Needs Docker. Uncommitted changes are NOT tested: commit first. Emulator-gated tests are skipped, as they are in the pipeline.
// Exit code 0 when every selected step passes.
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const image = 'mcr.microsoft.com/dotnet/sdk:10.0';
const network = 'bakery-linux-check';
const redisName = 'bakery-linux-check-redis';
const minRedisCommands = 50; // same threshold as the pipeline's redis-touch assert

// The Azure agent for a private project has 2 cores, and xUnit runs tests on one worker thread per core, so a test that blocks a worker (a
// constructor calling .GetAwaiter().GetResult() on a call that yields) can deadlock there and nowhere with more cores: on 2026-11-01 the catalog
// tests ran for 38 minutes on the agent and for 4 seconds here. The container is therefore limited to the agent's 2 CPUs, and a test run that
// shows no progress for 3 minutes is stopped and reported as a hang (with a dump) instead of running to the job timeout.
const cpus = '2';
const hang = '--blame-hang-timeout 3m';

const filter = String.raw`grep -E "error|Build succeeded|Passed!|Failed!|^  Failed |Skipped!|WHITESPACE|IDE[0-9]+|CHARSET|FINALNEWLINE|inactivity time|Test Run Aborted"`;
const steps = {
  build: 'dotnet build BakeryMarketplace.slnx --configuration Release',
  format:
    'dotnet format whitespace BakeryMarketplace.slnx --verify-no-changes && dotnet format style BakeryMarketplace.slnx --verify-no-changes',
  tools: `dotnet test tools/BakeryMarketplace.slnx --configuration Release ${hang}`,
  catalog: `dotnet test services/catalog-service/tests/CatalogService.Tests --configuration Release ${hang}`,
  ordering: `dotnet test services/ordering-service/tests/OrderingService.Tests --configuration Release ${hang}`,
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
const docker = (...args) => spawnSync('docker', args, { encoding: 'utf8' });

function cleanup() {
  docker('rm', '-f', redisName);
  docker('network', 'rm', network);
  git('worktree', 'remove', '--force', work);
}

function redisCommands() {
  const out = docker('exec', redisName, 'redis-cli', 'info', 'stats').stdout ?? '';
  const m = /total_commands_processed:(\d+)/.exec(out);
  return m ? Number(m[1]) : null;
}

// A clean checkout of what is committed (a temporary worktree), so stale bin/obj folders from Windows cannot leak into the Linux build and
// the developer's own working tree and index are left alone. autocrlf is off so the files have the line endings stored in git, which is what
// the Azure agent checks out (the format gate is sensitive to them).
cleanup();
rmSync(work, { recursive: true, force: true });
git('worktree', 'prune');
const add = git('-c', 'core.autocrlf=false', 'worktree', 'add', '--detach', '--force', work, 'HEAD');
if (add.status !== 0) {
  console.error('Could not check out the committed tree.', add.stderr);
  process.exit(2);
}

let failed = false;
try {
  docker('network', 'create', network);
  const redis = docker('run', '-d', '--name', redisName, '--network', network, 'redis:7.4-alpine');
  if (redis.status !== 0) throw new Error(`Could not start Redis: ${redis.stderr}`);
  for (let i = 0; i < 30 && redisCommands() === null; i++) spawnSync('node', ['-e', 'setTimeout(()=>{},500)']);
  const before = redisCommands() ?? 0;

  for (const name of selected) {
    console.log(`\n== ${name}`);
    const script = `${steps[name]} 2>&1 | ${filter} ; test \${PIPESTATUS[0]} -eq 0`;
    const run = spawnSync(
      'docker',
      [
        'run',
        '--rm',
        `--cpus=${cpus}`,
        '--network',
        network,
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
        '-e',
        `REDIS_CONNECTION_STRING=${redisName}:6379`,
        image,
        'bash',
        '-c',
        script,
      ],
      { stdio: 'inherit' },
    );
    if (run.status !== 0) {
      failed = true;
      console.log(`-> ${name} FAILED`);
    }
  }

  if (selected.includes('tools')) {
    const grew = (redisCommands() ?? 0) - before;
    const ok = grew >= minRedisCommands;
    console.log(
      `\n== redis (finding A8)\n${ok ? 'OK' : 'FAIL'}: Redis processed ${grew} commands during the tests (needs >= ${minRedisCommands})` +
        (ok ? '' : '; the adapter tests probably fell back to fakes.'),
    );
    if (!ok) failed = true;
  }
} finally {
  cleanup();
}

console.log(failed ? '\nLinux check FAILED.' : '\nLinux check passed.');
process.exit(failed ? 1 : 0);
