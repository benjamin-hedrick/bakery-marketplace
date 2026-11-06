#!/usr/bin/env node
// A dynamic scan of the local stack with OWASP ZAP (WI-SEC-005 step 4, register item 129). It starts the real stack (Docker for the
// infrastructure, the services and the two web apps as host processes), then runs ZAP from its container image against:
//   - the customer app (http://localhost:3000) and the vendor's queue display (http://localhost:3100): the baseline scan (a spider and the passive
//     rules: headers, cookies, information leaks). No attack requests.
//   - the GraphQL BFF (http://localhost:4100/graphql): the API scan with the GraphQL importer, which also sends attack requests (active rules).
// All three are the lead's own system running on this machine. The scan is unauthenticated: it sees what an anonymous visitor sees, not what a
// logged-in vendor sees (no login script for ZAP exists yet), so it says nothing about the pages behind a login.
//
//   node scripts/ci/zap-scan.mjs [--keep] [--image ghcr.io/zaproxy/zaproxy:stable] [--spider-minutes 1]
//
// Needs Docker (the image is large the first time). Reports (HTML, JSON, markdown) go to artifacts/zap/; a summary of the alerts by risk is printed.
// Exit code 0 when the scans ran (alerts are findings to read, not failures); 1 when a scan could not run.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createStack, root } from '../lib/local-stack.mjs';

const argv = process.argv.slice(2);
const opt = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const keep = argv.includes('--keep');
const image = opt('--image', 'ghcr.io/zaproxy/zaproxy:stable');
const spiderMinutes = opt('--spider-minutes', '1');

const stack = createStack({ label: 'zap', outDir: 'artifacts/zap', distDir: '.next-zap' });
const out = path.join(root, 'artifacts', 'zap');
mkdirSync(out, { recursive: true });
let exitCode = 1;

function zap(name, script, args) {
  stack.log(`${name}: ${script} ${args.join(' ')}`);
  // /zap/wrk is where ZAP writes its reports; --add-host lets the container reach the host's ports.
  const r = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--add-host',
      'host.docker.internal:host-gateway',
      '-v',
      `${out}:/zap/wrk:rw`,
      image,
      script,
      ...args,
    ],
    { stdio: 'inherit' },
  );
  // ZAP's scripts exit 0 (no alerts), 1 (failures), 2 (warnings), 3 (other): 1 and 2 still mean the scan ran and wrote its report.
  return r.status;
}

function summarise(name, jsonFile) {
  const file = path.join(out, jsonFile);
  if (!existsSync(file)) return { name, error: 'no report was written' };
  const report = JSON.parse(readFileSync(file, 'utf8'));
  const alerts = (report.site ?? []).flatMap((s) => s.alerts ?? []);
  const byRisk = {};
  for (const a of alerts)
    (byRisk[a.riskdesc.split(' ')[0]] ??= []).push({
      name: a.name,
      instances: a.instances?.length ?? Number(a.count ?? 0),
    });
  return { name, alerts: alerts.length, byRisk };
}

try {
  stack.up();
  await stack.startServices();
  await stack.startWeb();
  await stack.startQueue();

  const results = [];
  for (const [name, target, report] of [
    ['customer app', 'http://host.docker.internal:3000', 'customer'],
    ['queue display', 'http://host.docker.internal:3100', 'queue'],
  ]) {
    const status = zap(name, 'zap-baseline.py', [
      '-t',
      target,
      '-m',
      spiderMinutes,
      '-J',
      `${report}.json`,
      '-r',
      `${report}.html`,
      '-w',
      `${report}.md`,
      '-I',
    ]);
    results.push({ ...summarise(name, `${report}.json`), exit: status });
  }
  // The API scan imports the GraphQL schema from the endpoint (introspection is on) and attacks it.
  const status = zap('GraphQL BFF', 'zap-api-scan.py', [
    '-t',
    'http://host.docker.internal:4100/graphql',
    '-f',
    'graphql',
    '-J',
    'bff.json',
    '-r',
    'bff.html',
    '-w',
    'bff.md',
    '-I',
  ]);
  results.push({ ...summarise('GraphQL BFF', 'bff.json'), exit: status });

  console.log(JSON.stringify(results, null, 2));
  exitCode = results.every((r) => !r.error) ? 0 : 1;
} catch (e) {
  console.error(`[zap] ERROR: ${e.stack ?? e.message}`);
} finally {
  stack.stopAll();
  if (!keep) stack.down();
}
process.exitCode = exitCode;
