#!/usr/bin/env node
// Runs the mock-backed browser suite (apps/web-customer/tests/e2e) several times, records each run, and writes the quality report
// (scripts/ci/quality-report.mjs). This is the flake baseline of docs/evidence/baseline-2026-10-30.md as a command: one worker, no retries, JUnit
// output per run. The servers (mock BFF, fake issuer, the built app with its login settings) are started and stopped by the Playwright config itself
// (`webServer` in apps/web-customer/playwright.config.ts), so each run gets fresh servers and this script cannot drift from what `npm run test:e2e`
// runs (register 167: a copy of that setup here had gone out of date and every logged-in test failed).
//
//   node scripts/ci/repeat-suite.mjs [--runs 10] [--out artifacts/quality/browser-<timestamp>]
//
// Needs `npm ci` and `npx playwright install chromium` in apps/web-customer; ports 3000, 4000 and 5101 free. Takes about 1.5 minutes a run (the
// build is repeated, from Next's cache). Output: <out>/run-NN/mock-browser.xml, <out>/json/run-NN.json, <out>/report.md. Exit code 1 if any run failed.
import { spawnSync } from 'node:child_process';
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
const node = process.execPath;
const log = (m) => console.log(`[repeat] ${m}`);

let failedRuns = 0;
try {
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
