#!/usr/bin/env node
// A demo of the Android customer app you can show someone: boots the emulator (with its window), starts the local stack, builds and installs the app,
// opens it, prints where things are and waits; Enter or Ctrl+C (or the file artifacts/mobile/STOP, for a run with no terminal) stops what it started.
// The web demo is scripts/dev/demo.mjs; this one shows the same slice on the phone.
//
//   node scripts/dev/mobile-demo.mjs                 emulator + stack + build + install + open the app, then wait
//   node scripts/dev/mobile-demo.mjs --no-build      reuse the app already installed (the build is the same as the flows use)
//   node scripts/dev/mobile-demo.mjs --keep          leave Docker (and an emulator it booted) running when it stops
//   node scripts/dev/mobile-demo.mjs --phone-only    do not start the vendor's live queue screen (saves a build and some memory)
//
// It also starts the vendor's live queue screen (port 3100, in a browser on this machine), so an order placed on the phone can be accepted and moved
// along there, as in scripts/dev/demo.mjs.
//
// Like scripts/dev/mobile-flows.mjs it builds the same app (there is no test build any more, WI-ORD-010). Nothing is deployed and the payment is a stub. Needs Docker, the .NET SDK, Node >= 24, JDK 17 and the Android SDK with the AVD
// bakery_pixel (Maestro is not needed). The first build takes about ten minutes. Data lives in the Cosmos emulator and is lost on teardown.
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createStack, ports } from '../lib/local-stack.mjs';
import * as mobile from '../lib/mobile.mjs';

const args = process.argv.slice(2);
const keep = args.includes('--keep');
const noBuild = args.includes('--no-build');
const withVendorScreen = !args.includes('--phone-only');
const log = (m) => console.log(`[mobile-demo] ${m}`);

const stack = createStack({ label: 'mobile-demo', outDir: 'artifacts/mobile', distDir: '.next-mobile' });
let bootedEmulator = false;
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  stack.stopAll();
  if (!keep) {
    stack.down();
    if (bootedEmulator) mobile.stopEmulator();
  }
  process.exit(code);
}

function guide() {
  console.log(`
==================================================================================================
 Bakery marketplace, Android app, running locally (nothing is deployed; the payment is a test stub)

   Look at:   the emulator window; the app "Bakery Marketplace" is open on the login screen
   Sign in:   tap "Sign in", Chrome opens the local mock issuer's page; choose "Login as Alice Customer (Customer)".
              A fresh emulator may first show Chrome's welcome screen: tap "Use without an account".
   Journey:   Menu (stock shown) -> "Country Sourdough" -> choose "Sliced" and a quantity -> Add to order
              -> Check out -> pick a pickup time (optional) -> Place order -> the order page shows its status
   Expect:    an order with an option or a pickup time waits for the bakery ("Order received"); a plain order
              confirms itself. Close and reopen the app: you stay signed in. "Sign out" returns to the login screen.
   Cancel:    while the order is placed or confirmed the order page has "Cancel order" (it asks first).
   Vendor:    ${
     withVendorScreen
       ? `http://localhost:${ports.queue} in a browser on this machine: log in as "Corner Bakery (owner) (Vendor)". The order from the phone
              appears there at once; "Accept" (if it waits), "Start preparing", "Mark ready", "Handed over" move it, and the phone's order page
              follows within a few seconds by itself.`
       : `not started (--phone-only). Without --phone-only the live queue screen is at http://localhost:${ports.queue}.`
   }
   Logs:      artifacts/mobile/*.log
   Stop:      press Enter or Ctrl+C; ${keep ? 'Docker is left running (--keep)' : 'everything it started is torn down'}
==================================================================================================
`);
}

try {
  mobile.requireAdb();
  for (const port of [ports.catalog, ports.ordering, ports.bff, ...(withVendorScreen ? [ports.queue] : [])]) {
    if (mobile.portInUse(port)) throw new Error(`port ${port} is already in use; stop what is using it first`);
  }
  bootedEmulator = await mobile.ensureEmulator(log);
  stack.up();
  await stack.startServices();
  if (withVendorScreen) await stack.startQueue();
  mobile.reversePorts(log);
  if (!noBuild) mobile.buildApp(log);
  mobile.installApp(log);
  mobile.clearAppData(); // a demo starts signed out
  mobile.launchApp();
  guide();

  process.on('SIGINT', () => stop(0));
  process.on('SIGTERM', () => stop(0));
  if (process.stdin.isTTY) process.stdin.once('data', () => stop(0));
  const stopFile = path.join(mobile.out, 'STOP');
  rmSync(stopFile, { force: true });
  setInterval(() => existsSync(stopFile) && stop(0), 2000);
  await new Promise(() => {});
} catch (e) {
  console.error(`[mobile-demo] ERROR: ${e.message}`);
  stop(1);
}
