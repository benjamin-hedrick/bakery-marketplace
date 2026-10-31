#!/usr/bin/env node
// Runs the mock-backed browser suite (apps/web-customer/tests/e2e) several times against one build and one set of servers, records each
// run, and writes the quality report (scripts/ci/quality-report.mjs). This is the flake baseline of docs/evidence/baseline-2026-10-30.md as
// a command: one production build, the mock BFF and `next start` started once and reused, one worker, no retries, JUnit output per run.
//
//   node scripts/ci/repeat-suite.mjs [--runs 10] [--out artifacts/quality/browser-<timestamp>]
//
// Needs `npm ci` and `npx playwright install chromium` in apps/web-customer; ports 3000 and 4000 free. Takes about 40 s a run after a
// build of about a minute. Output: <out>/run-NN/mock-browser.xml, <out>/json/run-NN.json, <out>/report.md. Exit code 1 if any run failed.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const web = path.join(root, 'apps', 'web-customer');
const argv = process.argv.slice(2);
const opt = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const runs = Number(opt('--runs', '10'));
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
const out = path.resolve(root, opt('--out', path.join('artifacts', 'quality', `browser-${stamp}`)));
const isWin = process.platform === 'win32';
const node = process.execPath;
const log = (m) => console.log(`[repeat] ${m}`);

const servers = [];
function startServer(name, args, env = {}) {
  const child = spawn(node, args, { cwd: web, env: { ...process.env, ...env }, stdio: 'ignore', detached: !isWin });
  servers.push({ name, child });
}
function stopServers() {
  for (const { name, child } of servers) {
    if (child.exitCode !== null || !child.pid) continue;
    log(`stopping ${name}`);
    if (isWin) spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)]);
    else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        /* already gone */
      }
    }
  }
}
async function waitFor(url, seconds = 90) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) return;
    } catch {
      /* not yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${url} did not answer within ${seconds}s`);
}

let failedRuns = 0;
try {
  const next = path.join('node_modules', 'next', 'dist', 'bin', 'next');
  log('build (relay compile and next build)');
  const build = spawnSync('npm run build', { cwd: web, stdio: 'inherit', shell: true });
  if (build.status !== 0) throw new Error('build failed');
  startServer('mock BFF', [path.join('mock-bff', 'server.mjs')]);
  startServer('next start', [next, 'start', '-p', '3000'], { ENABLE_TEST_HOOKS: '1' });
  await waitFor('http://localhost:4000/healthz');
  await waitFor('http://localhost:3000/');

  mkdirSync(path.join(out, 'json'), { recursive: true });
  for (let i = 1; i <= runs; i++) {
    const n = String(i).padStart(2, '0');
    const xml = path.join(out, `run-${n}`, 'mock-browser.xml');
    mkdirSync(path.dirname(xml), { recursive: true });
    const t0 = Date.now();
    const r = spawnSync(
      node,
      [path.join('node_modules', '@playwright', 'test', 'cli.js'), 'test', '--reporter=junit'],
      {
        cwd: web,
        stdio: ['ignore', 'ignore', 'inherit'],
        env: { ...process.env, PLAYWRIGHT_JUNIT_OUTPUT_NAME: xml },
      },
    );
    spawnSync(
      node,
      [
        path.join(root, 'scripts', 'ci', 'summarize-results.mjs'),
        '--json',
        path.join(out, 'json', `run-${n}.json`),
        xml,
      ],
      {
        stdio: 'ignore',
      },
    );
    if (r.status !== 0) failedRuns++;
    log(`run ${n}/${runs}: ${r.status === 0 ? 'passed' : 'FAILED'} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
} catch (e) {
  console.error(`[repeat] ERROR: ${e.message}`);
  failedRuns = failedRuns || 1;
} finally {
  stopServers();
}
const report = spawnSync(
  node,
  [
    path.join(root, 'scripts', 'ci', 'quality-report.mjs'),
    path.join(out, 'json'),
    '--title',
    `Browser suite, ${runs} runs`,
    '--out',
    path.join(out, 'report.md'),
  ],
  { stdio: 'inherit' },
);
log(`output: ${path.relative(root, out)}`);
process.exitCode = failedRuns || report.status ? 1 : 0;
