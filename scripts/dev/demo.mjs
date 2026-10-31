#!/usr/bin/env node
// A demo you can show someone: starts the whole slice-1 stack, warms it, prints where to go and who to log in as, and stops everything
// on request. It starts the same processes as scripts/ci/skeleton-smoke.mjs but no browser tests and no test hooks (never set
// ENABLE_TEST_HOOKS here), and leaves the stack running until you stop it. Steps: docs/operations/demo.md.
//
//   node scripts/dev/demo.mjs                    start, warm, print the guide, wait; Ctrl+C or Enter stops and tears down
//   node scripts/dev/demo.mjs --keep             stop the host processes but leave Docker running
//   node scripts/dev/demo.mjs --stop-after 60    stop by itself after 60 seconds once the guide is printed (for checking the script)
//
// Needs Docker, the .NET SDK, Node >= 24 and `npm ci` already run in apps/web-customer and services/graphql-bff. The first run builds
// the web app and the services. Logs: artifacts/demo/*.log. Ports 3000, 4100, 5200 and 5300 must be free. Data lives in the Cosmos
// emulator and is lost on teardown (docker compose down). Exit code 0 when it ran and stopped cleanly.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, createWriteStream, readFileSync } from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = path.join(root, 'artifacts', 'demo');
mkdirSync(out, { recursive: true });
const args = process.argv.slice(2);
const keep = args.includes('--keep');
const stopAfter = args.includes('--stop-after') ? Number(args[args.indexOf('--stop-after') + 1]) : null;
const isWin = process.platform === 'win32';

// The Cosmos emulator's documented, publicly known fixed key (not a secret). Override with Cosmos__ConnectionString.
const EMULATOR_KEY = 'C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==';
const cosmos =
  process.env.Cosmos__ConnectionString ?? `AccountEndpoint=http://localhost:8081/;AccountKey=${EMULATOR_KEY}`;
const ports = { catalog: 5200, ordering: 5300, bff: 4100, web: 3000 };
const issuer = 'http://localhost:5100';
const bffUrl = `http://localhost:${ports.bff}/graphql`;

const children = [];
const log = (m) => console.log(`[demo] ${m}`);

/** A value from the git-ignored `.env` that scripts/dev/init-env.mjs writes. Never logged. */
function envValue(key) {
  const match = new RegExp(`^${key}=(.+)$`, 'm').exec(readFileSync(path.join(root, '.env'), 'utf8'));
  if (!match) throw new Error(`${key} is not in .env; scripts/dev/init-env.mjs should have created it`);
  return match[1].trim();
}

function run(label, cmd, cmdArgs, opts = {}) {
  log(`${label}: ${cmd} ${cmdArgs.join(' ')}`);
  const r = spawnSync(cmd, cmdArgs, { cwd: root, stdio: 'inherit', ...opts, env: { ...process.env, ...opts.env } });
  if (r.status !== 0) throw new Error(`${label} failed (exit ${r.status ?? r.signal})`);
}

function start(name, cmd, cmdArgs, opts) {
  const file = createWriteStream(path.join(out, `${name}.log`));
  const child = spawn(cmd, cmdArgs, {
    cwd: root,
    ...opts,
    env: { ...process.env, ...opts.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: !isWin,
  });
  child.stdout.pipe(file);
  child.stderr.pipe(file);
  children.push({ name, child });
  return child;
}

function stopAll() {
  for (const { name, child } of children) {
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

async function waitFor(name, url, seconds = 120) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) return log(`${name} is up`);
    } catch {
      /* not yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${name} did not become healthy at ${url} within ${seconds}s (see artifacts/demo/${name}.log)`);
}

const portInUse = (port) =>
  new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('error', () => resolve(false));
  });

/** The first request through each hop is slow on a cold stack (issuer metadata, JIT, the first server render). No order is placed. */
async function warm() {
  const t0 = Date.now();
  const get = (url) => fetch(url, { signal: AbortSignal.timeout(30000) }).catch(() => null);
  await get(`${issuer}/.well-known/openid-configuration`);
  await get(`http://localhost:${ports.web}/`);
  await fetch(bffUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ pickupWindows(vendorId: "vendor-shop-001") { start } }' }),
    signal: AbortSignal.timeout(30000),
  }).catch(() => null);
  log(`warmed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

function guide() {
  const url = `http://localhost:${ports.web}`;
  console.log(`
==================================================================================================
 Bakery marketplace, slice 1, running locally (nothing is deployed; the payment is a test stub)

   Open:      ${url}
   Log in as: Alice Customer (Customer) on the login page that appears when you go to checkout.
              The mock issuer also lists the vendor and admin users; slice 1 has no vendor or admin screens.
   Journey:   browse -> open "Country Sourdough" -> choose quantity or an option -> Add to order
              -> Your order -> log in -> Place test order -> the order page shows its status
   Expect:    a plain order is "Order confirmed" by itself; an order with an option or a pickup time
              waits for the bakery. The first checkout after start-up is slower than the next ones.
   Logs:      ${path.relative(root, out)}${path.sep}*.log
   Stop:      press Enter or Ctrl+C${stopAfter ? ` (or wait ${stopAfter} s)` : ''}; ${keep ? 'Docker is left running (--keep)' : 'everything is torn down'}
==================================================================================================
`);
}

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  stopAll();
  if (!keep) spawnSync('docker', ['compose', 'down'], { cwd: root, stdio: 'inherit' });
  process.exit(code);
}

const web = path.join(root, 'apps', 'web-customer');
const bff = path.join(root, 'services', 'graphql-bff');
try {
  for (const [name, port] of Object.entries(ports)) {
    if (await portInUse(port)) throw new Error(`port ${port} (${name}) is already in use; stop what is using it first`);
  }
  run('local secrets', 'node', ['scripts/dev/init-env.mjs']);
  run('compose up', 'docker', ['compose', 'up', '-d', '--build']);
  run('environment check', 'node', ['scripts/dev/check-env.mjs', '--wait', '180']);
  run('seed', 'dotnet', ['run', '--project', 'tools/BakeryMarketplace.Seed'], {
    env: { Cosmos__ConnectionString: cosmos },
  });

  const dotnetEnv = {
    ASPNETCORE_ENVIRONMENT: 'Development',
    Data__Backend: 'cosmos',
    Events__Backend: 'redis',
    Redis__ConnectionString: '127.0.0.1:6379',
    Cosmos__ConnectionString: cosmos,
  };
  start('catalog', 'dotnet', ['run', '--no-launch-profile', '--project', 'services/catalog-service/src'], {
    env: { ...dotnetEnv, ASPNETCORE_URLS: `http://localhost:${ports.catalog}` },
  });
  start('ordering', 'dotnet', ['run', '--no-launch-profile', '--project', 'services/ordering-service/src'], {
    env: {
      ...dotnetEnv,
      ASPNETCORE_URLS: `http://localhost:${ports.ordering}`,
      ServiceAuth__ClientSecret: envValue('ORDERING_CLIENT_SECRET'),
    },
  });
  start('bff', 'node', ['src/main.ts'], {
    cwd: bff,
    env: {
      BFF_PORT: String(ports.bff),
      CATALOG_URL: `http://localhost:${ports.catalog}`,
      ORDERING_URL: `http://localhost:${ports.ordering}`,
    },
  });
  await waitFor('catalog', `http://localhost:${ports.catalog}/health`);
  await waitFor('ordering', `http://localhost:${ports.ordering}/health`);
  await waitFor('bff', `http://localhost:${ports.bff}/healthz`);

  // GRAPHQL_URL is read at build time (rewrite) and at run time (SSR). NEXT_DIST_DIR keeps this build out of `.next` and `.next-skeleton`.
  const webEnv = { GRAPHQL_URL: bffUrl, NEXT_DIST_DIR: '.next-demo' };
  run('relay compile', 'node', ['scripts/ensure-artifact-dir.mjs'], { cwd: web });
  run('relay compile', 'node', [path.join('node_modules', 'relay-compiler', 'cli.js')], { cwd: web });
  run('web build', 'node', [path.join('node_modules', 'next', 'dist', 'bin', 'next'), 'build'], {
    cwd: web,
    env: webEnv,
  });
  start('web', 'node', [path.join('node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(ports.web)], {
    cwd: web,
    env: webEnv,
  });
  await waitFor('web', `http://localhost:${ports.web}/`);
  await warm();
  guide();

  process.on('SIGINT', () => stop(0));
  process.on('SIGTERM', () => stop(0));
  if (process.stdin.isTTY) process.stdin.once('data', () => stop(0));
  if (stopAfter) setTimeout(() => stop(0), stopAfter * 1000);
  await new Promise(() => {}); // run until a stop is requested
} catch (e) {
  console.error(`[demo] ERROR: ${e.message}`);
  stop(1);
}
