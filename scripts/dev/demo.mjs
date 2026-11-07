#!/usr/bin/env node
// A demo you can show someone: starts the whole slice-1 stack, warms it, prints where to go and who to log in as, and stops everything
// on request. It starts the same processes as scripts/ci/skeleton-smoke.mjs (shared in scripts/lib/local-stack.mjs) but no browser
// tests and no test hooks (never set ENABLE_TEST_HOOKS here), and leaves the stack running until you stop it. Steps: docs/operations/demo.md.
//
//   node scripts/dev/demo.mjs                    start, warm, print the guide, wait; Ctrl+C or Enter stops and tears down
//   node scripts/dev/demo.mjs --keep             stop the host processes but leave Docker running
//   node scripts/dev/demo.mjs --stop-after 60    stop by itself after 60 seconds once the guide is printed (for checking the script)
//   node scripts/dev/demo.mjs --customer-only    do not start the vendor's live queue screen (saves a build and some memory)
//
// It starts both halves of the slice: the customer web app (port 3000) and the vendor's live queue screen (port 3100), so an order placed in one
// can be accepted and moved along in the other.
//
// Needs Docker, the .NET SDK, Node >= 24 and `npm ci` already run in apps/web-customer, apps/web-queue-display and services/graphql-bff. The first
// run builds the web apps and the services. Logs: artifacts/demo/*.log. Ports 3000, 3100, 4100, 5200 and 5300 must be free. Data lives in the Cosmos
// emulator and is lost on teardown (docker compose down). Exit code 0 when it ran and stopped cleanly.
import net from 'node:net';
import path from 'node:path';
import { bffUrl, createStack, issuerUrl, ports, root } from '../lib/local-stack.mjs';

const args = process.argv.slice(2);
const keep = args.includes('--keep');
const stopAfter = args.includes('--stop-after') ? Number(args[args.indexOf('--stop-after') + 1]) : null;
const withVendorScreen = !args.includes('--customer-only');
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
  if (withVendorScreen) await get(`http://localhost:${ports.queue}/`);
  await fetch(bffUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ pickupWindows(vendorId: "vendor-shop-001") { start } }' }),
    signal: AbortSignal.timeout(30000),
  }).catch(() => null);
  stack.log(`warmed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

function guide() {
  const vendor = withVendorScreen
    ? `
   Vendor:    http://localhost:${ports.queue}  (the live queue: log in as "Corner Bakery (owner) (Vendor)" on the issuer's page)
              An order placed above appears there at once. An order with an option or a pickup time waits for "Accept"; then
              "Start preparing" -> "Mark ready" -> "Handed over". Refresh the customer's order page to see each status.`
    : `
   Vendor:    not started (--customer-only). Without --customer-only the live queue screen is at http://localhost:${ports.queue}.`;
  console.log(`
==================================================================================================
 Bakery marketplace, slice 1, running locally (nothing is deployed; the payment is a test stub)

   Customer:  http://localhost:${ports.web}
   Log in as: Alice Customer (Customer) on the login page that appears when you go to checkout (she has no saved allergy profile).
              The issuer also lists four customers with a saved allergy profile (Nora, Sam, Dana, Max: seed data, docs/operations/local-dev.md),
              one with no saved payment method, and the vendor and admin users; there is no admin screen.
   Journey:   browse -> open "Country Sourdough" -> choose quantity or an option -> Add to order
              -> Your order -> log in -> Place test order -> the order page shows its status
   Expect:    a plain order is "Order confirmed" by itself; an order with an option or a pickup time
              waits for the bakery. The first checkout after start-up is slower than the next ones.${vendor}
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
  if (withVendorScreen) await stack.startQueue();
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
