#!/usr/bin/env node
// A demo you can show someone: starts the whole slice-1 stack, warms it, prints where to go and who to log in as, and stops everything
// on request. It starts the same processes as scripts/ci/skeleton-smoke.mjs (shared in scripts/lib/local-stack.mjs) but no browser
// tests and no test hooks (never set ENABLE_TEST_HOOKS here), and leaves the stack running until you stop it. Steps: docs/operations/demo.md.
//
//   node scripts/dev/demo.mjs                    start, warm, print the guide, wait; Ctrl+C or Enter stops and tears down
//   node scripts/dev/demo.mjs --keep             stop the host processes but leave Docker running
//   node scripts/dev/demo.mjs --stop-after 60    stop by itself after 60 seconds once the guide is printed (for checking the script)
//
// Needs Docker, the .NET SDK, Node >= 24 and `npm ci` already run in apps/web-customer and services/graphql-bff. The first run builds
// the web app and the services. Logs: artifacts/demo/*.log. Ports 3000, 4100, 5200 and 5300 must be free. Data lives in the Cosmos
// emulator and is lost on teardown (docker compose down). Exit code 0 when it ran and stopped cleanly.
import net from 'node:net';
import path from 'node:path';
import { bffUrl, createStack, issuerUrl, ports, root } from '../lib/local-stack.mjs';

const args = process.argv.slice(2);
const keep = args.includes('--keep');
const stopAfter = args.includes('--stop-after') ? Number(args[args.indexOf('--stop-after') + 1]) : null;
const stack = createStack({ label: 'demo', outDir: 'artifacts/demo', distDir: '.next-demo' });

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
  await get(`${issuerUrl}/.well-known/openid-configuration`);
  await get(`http://localhost:${ports.web}/`);
  await fetch(bffUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ pickupWindows(vendorId: "vendor-shop-001") { start } }' }),
    signal: AbortSignal.timeout(30000),
  }).catch(() => null);
  stack.log(`warmed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

function guide() {
  console.log(`
==================================================================================================
 Bakery marketplace, slice 1, running locally (nothing is deployed; the payment is a test stub)

   Open:      http://localhost:${ports.web}
   Log in as: Alice Customer (Customer) on the login page that appears when you go to checkout (she has no saved allergy profile).
              The issuer also lists four customers with a saved allergy profile (Nora, Sam, Dana, Max: seed data, docs/operations/local-dev.md),
              and the vendor and admin users; slice 1 has no vendor or admin screens.
   Journey:   browse -> open "Country Sourdough" -> choose quantity or an option -> Add to order
              -> Your order -> log in -> Place test order -> the order page shows its status
   Expect:    a plain order is "Order confirmed" by itself; an order with an option or a pickup time
              waits for the bakery. The first checkout after start-up is slower than the next ones.
   Logs:      ${path.relative(root, stack.out)}${path.sep}*.log
   Stop:      press Enter or Ctrl+C${stopAfter ? ` (or wait ${stopAfter} s)` : ''}; ${keep ? 'Docker is left running (--keep)' : 'everything is torn down'}
==================================================================================================
`);
}

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  stack.stopAll();
  if (!keep) stack.down();
  process.exit(code);
}

try {
  for (const [name, port] of Object.entries(ports)) {
    if (await portInUse(port)) throw new Error(`port ${port} (${name}) is already in use; stop what is using it first`);
  }
  stack.up();
  await stack.startServices();
  await stack.startWeb();
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
