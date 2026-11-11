// Chaos smoke (ADR-0024, WI-CHAOS-003): brings up the real local stack with ONE chaos scenario, runs the chaos specs written for it, writes the run's
// resilience summary, tears down. The default suite (scripts/ci/skeleton-smoke.mjs) runs with no scenario and never reads these specs.
//
//   node scripts/ci/chaos-smoke.mjs <scenario> [--keep]
//     <scenario> is the name of a file in chaos/scenarios/ that has a spec at apps/web-customer/tests/chaos/<scenario>.spec.ts
//
// Logs and metrics: artifacts/chaos/<scenario>/ (the services' logs hold the .NET journal, metrics-*.json the specs' recovery figures, summary.json the
// faults injected per layer and fault). Exit code: the test run's. Needs what skeleton-smoke needs (Docker, .NET SDK, Node >= 24, npm ci in apps/web-customer).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createStack, root } from '../lib/local-stack.mjs';

const scenario = process.argv[2];
const keep = process.argv.includes('--keep');
if (!scenario || scenario.startsWith('-') || !/^[a-z0-9][a-z0-9-]*$/.test(scenario)) {
  console.error('usage: node scripts/ci/chaos-smoke.mjs <scenario> [--keep]');
  process.exit(2);
}
const spec = `tests/chaos/${scenario}.spec.ts`; // forward slashes: Playwright reads the argument as a pattern, where a backslash is an escape
if (!existsSync(path.join(root, 'apps', 'web-customer', spec))) {
  console.error(`no chaos spec for '${scenario}': apps/web-customer/${spec} does not exist`);
  process.exit(2);
}
process.env.STACK_CHAOS_SCENARIO = scenario; // the runner gives it to every process; the specs read the same variable

const stack = createStack({
  label: 'chaos',
  outDir: path.join('artifacts', 'chaos', scenario),
  distDir: '.next-chaos',
  logExits: true,
});

// What each scenario must have injected for a pass to mean anything: groups of layer:fault, and at least one fault of each group must be in the journal.
// Checked here, after the services have stopped, because their log files (the journal) are complete only then.
const mustHaveInjected = {
  'checkout-trouble': [['payment:decline', 'catalog:unavailable', 'catalog:reject', 'repository:conflict']],
  'lost-confirmation': [['repository:lostResponse'], ['payment:lostResponse']],
};
// Behaviour known not to hold yet: reported in the summary, and the run still passes while it is the only problem.
const knownGaps = {
  'lost-confirmation': 'register 171: a payment authorized whose answer was lost is authorized again by the retry',
};

/** Orders whose payment was authorized more than once, from the keys the lost-confirmation spec recorded and the ordering service's log. */
function doubleAuthorizations(metrics) {
  const rec = metrics['lost-confirmation-payment'];
  if (!rec) return null;
  const log = readFileSync(path.join(stack.out, 'ordering.log'), 'utf8');
  const per = new Map();
  for (const m of log.matchAll(/payment authorization for order (order-[0-9a-f]+)/g))
    per.set(m[1], (per.get(m[1]) ?? 0) + 1);
  const ids = rec.keys.map(
    (k) => 'order-' + createHash('sha256').update(`${rec.customerId}\n${k}`, 'utf8').digest('hex').slice(0, 32),
  );
  return ids.filter((id) => (per.get(id) ?? 0) > 1).length;
}

/** The "chaos injected" lines of the services' logs, counted per layer:fault (the journal's summary, kept as evidence). Returns the problems found. */
function summarize() {
  const problems = [];
  const counts = {};
  for (const f of readdirSync(stack.out).filter((n) => n.endsWith('.log'))) {
    const text = readFileSync(path.join(stack.out, f), 'utf8');
    for (const m of text.matchAll(/chaos injected: layer=(\S+) fault=(\S+) key=/g)) {
      const k = `${m[1]}:${m[2].split(':')[0]}`;
      counts[k] = (counts[k] ?? 0) + 1;
    }
  }
  const metrics = {};
  for (const f of readdirSync(stack.out).filter((n) => n.startsWith('metrics-') && n.endsWith('.json')))
    metrics[f.slice(8, -5)] = JSON.parse(readFileSync(path.join(stack.out, f), 'utf8'));
  for (const group of mustHaveInjected[scenario] ?? [])
    if (!group.some((k) => (counts[k] ?? 0) > 0))
      problems.push(`no fault of ${group.join(' or ')} was injected: the pass would prove nothing`);
  const doubled = doubleAuthorizations(metrics);
  const gaps = [];
  if (doubled !== null) {
    metrics['lost-confirmation-payment'].ordersAuthorizedMoreThanOnce = doubled;
    if (doubled > 0) gaps.push(`${knownGaps[scenario]} (${doubled} orders)`);
  }
  writeFileSync(
    path.join(stack.out, 'summary.json'),
    JSON.stringify(
      { scenario, faultsInjectedByTheServices: counts, specMetrics: metrics, knownGapsObserved: gaps, problems },
      null,
      2,
    ),
  );
  stack.log(`summary: ${path.join(stack.out, 'summary.json')}`);
  for (const g of gaps) stack.log(`KNOWN GAP: ${g}`);
  for (const p of problems) stack.log(`PROBLEM: ${p}`);
  return problems;
}

let exitCode = 1;
try {
  stack.up();
  await stack.startServices();
  await stack.startWeb();
  await stack.startQueue();

  // An outage window is measured from the start of the process (ADR-0024), and the build above takes longer than any window: start the ordering service
  // again now, so the clock of its scenario starts just before the specs do.
  if (scenario === 'broker-outage') {
    stack.stopOne('ordering');
    await new Promise((r) => setTimeout(r, 2000));
    stack.startOne('ordering');
    const deadline = Date.now() + 120_000;
    for (;;) {
      try {
        if ((await fetch('http://localhost:5300/health')).ok) break;
      } catch {
        /* not up yet */
      }
      if (Date.now() > deadline) throw new Error('ordering did not come back after the restart');
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const pw = spawnSync(
    'node',
    [
      path.join('node_modules', '@playwright', 'test', 'cli.js'),
      'test',
      '-c',
      'playwright.chaos.config.ts',
      spec,
      '--reporter=list,junit',
    ],
    {
      cwd: stack.webDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        ...stack.webEnv,
        CHAOS_LOG_DIR: path.resolve(root, stack.out),
        PLAYWRIGHT_JUNIT_OUTPUT_NAME: path.join(path.resolve(root, stack.out), 'playwright-junit.xml'),
      },
    },
  );
  exitCode = pw.status ?? 1;
  stack.log(`Playwright exit code ${exitCode}`);
} catch (e) {
  console.error(`[chaos] ERROR: ${e.message}`);
} finally {
  stack.stopAll();
  // The services' logs reach their files a moment late; summarize once the processes are gone, so the counts are complete.
  await new Promise((r) => setTimeout(r, 3000));
  try {
    if (summarize().length > 0) exitCode = exitCode === 0 ? 1 : exitCode;
  } catch (e) {
    console.error(`[chaos] could not write the summary: ${e.message}`);
  }
  if (!keep) stack.down();
}
process.exitCode = exitCode;
