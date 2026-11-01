#!/usr/bin/env node
// Runs the Node and documentation gates the pipeline runs, in one command, so none is forgotten before a push.
// Pipeline jobs `bff` and `web` (azure-pipelines.yml): format check, lint, typecheck (and the tests with --tests). Prettier in
// apps/web-customer also covers scripts/ and azure-pipelines.yml, so a new script is checked by the `web` format step.
//
//   node scripts/ci/node-gates.mjs            format, lint, typecheck in both projects, plus the documentation status and link checks
//   node scripts/ci/node-gates.mjs --tests    also the BFF tests, the web unit tests and the script tests (scripts/ci/tests)
//
// Needs `npm ci` done in services/graphql-bff, apps/web-customer and apps/web-queue-display. Every step runs even if an earlier one fails, so one run lists
// everything to fix. Not covered here (run them separately): .NET (`node scripts/ci/linux-check.mjs`), secrets
// (`node scripts/ci/secret-scan.mjs`), the browser suites and the real-stack smoke (`node scripts/ci/skeleton-smoke.mjs`).
// Exit code 0 when every step passes, 1 when any fails.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const withTests = process.argv.includes('--tests');

const npm = (dir, ...args) => ({ cwd: path.join(root, dir), cmd: 'npm', args: ['run', ...args] });
const steps = [
  { name: 'bff: format', ...npm('services/graphql-bff', 'format:check') },
  { name: 'bff: lint', ...npm('services/graphql-bff', 'lint') },
  { name: 'bff: typecheck', ...npm('services/graphql-bff', 'typecheck') },
  { name: 'web: format (also scripts/ and azure-pipelines.yml)', ...npm('apps/web-customer', 'format:check') },
  { name: 'web: lint', ...npm('apps/web-customer', 'lint') },
  { name: 'web: typecheck (runs relay-compiler)', ...npm('apps/web-customer', 'typecheck') },
  { name: 'queue display: format', ...npm('apps/web-queue-display', 'format:check') },
  { name: 'queue display: lint', ...npm('apps/web-queue-display', 'lint') },
  { name: 'queue display: typecheck (runs relay-compiler)', ...npm('apps/web-queue-display', 'typecheck') },
  { name: 'docs: status check', cwd: root, cmd: process.execPath, args: ['scripts/docs/status.mjs', '--check'] },
  {
    name: 'docs: traceability table',
    cwd: root,
    cmd: process.execPath,
    args: ['scripts/docs/traceability.mjs', '--check'],
  },
  {
    name: 'docs: link check',
    cwd: root,
    cmd: process.execPath,
    args: ['scripts/docs/linkcheck.mjs', '.', '--fail-on-broken-links'],
  },
];
if (withTests) {
  steps.push(
    { name: 'bff: tests', ...npm('services/graphql-bff', 'test') },
    { name: 'web: unit tests', ...npm('apps/web-customer', 'test:unit') },
    { name: 'queue display: unit tests', ...npm('apps/web-queue-display', 'test:unit') },
    {
      name: 'scripts: destroy guard and pipeline structure tests',
      cwd: root,
      cmd: process.execPath,
      args: ['--test', 'scripts/ci/tests/*.test.mjs'],
    },
  );
}

const results = [];
for (const s of steps) {
  const t0 = Date.now();
  // npm is a .cmd file on Windows, which needs a shell; the arguments here are fixed strings, not user input.
  const r = spawnSync(s.cmd, s.args, {
    cwd: s.cwd,
    encoding: 'utf8',
    shell: s.cmd === 'npm' && process.platform === 'win32',
  });
  const ok = r.status === 0;
  const seconds = ((Date.now() - t0) / 1000).toFixed(1);
  results.push({ name: s.name, ok, seconds });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${s.name} (${seconds}s)`);
  if (!ok) {
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? String(r.error) : ''}`.trim().split('\n');
    console.log(
      out
        .slice(-25)
        .map((l) => `      ${l}`)
        .join('\n'),
    );
  }
}

const failed = results.filter((r) => !r.ok);
console.log(
  failed.length
    ? `\n${failed.length} of ${results.length} steps FAILED: ${failed.map((r) => r.name).join('; ')}`
    : `\nAll ${results.length} steps passed.`,
);
process.exit(failed.length ? 1 : 0);
