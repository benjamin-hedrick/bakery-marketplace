#!/usr/bin/env node
// WI-MOB-001: only the backend the Android app talks to, without the web app: Compose infrastructure (Redis, Cosmos emulator, mock issuer), the seed,
// the catalog and ordering services and the GraphQL BFF, then `adb reverse` for the issuer and the BFF so a running emulator reaches them as
// http://localhost:5100 and http://localhost:4100 (ADR-0023). The BFF runs with the declined-payment test hook ON, because the app's failure flow
// needs it: this is a test stack, never a demo. Stops on Enter, Ctrl+C or when the file artifacts/mobile/STOP appears (for a run with no terminal),
// and tears everything down (--keep leaves Docker up). It does not boot an emulator, build or install the app: for that use
// scripts/dev/mobile-flows.mjs (tests) or scripts/dev/mobile-demo.mjs (a demo).
//
//   node scripts/dev/mobile-stack.mjs [--keep]
//
// Needs Docker, the .NET SDK and Node >= 24; an emulator or device visible to adb for the reverse step (skipped with a warning if there is none).
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createStack, ports } from '../lib/local-stack.mjs';
import * as mobile from '../lib/mobile.mjs';

const keep = process.argv.includes('--keep');
const stack = createStack({ label: 'mobile', outDir: 'artifacts/mobile', distDir: '.next-mobile' });

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  stack.stopAll();
  if (!keep) stack.down();
  process.exit(code);
}

try {
  for (const port of [ports.catalog, ports.ordering, ports.bff]) {
    if (mobile.portInUse(port)) throw new Error(`port ${port} is already in use; stop what is using it first`);
  }
  stack.up();
  await stack.startServices();
  if (/\bdevice\b/.test(mobile.adb('devices').stdout.split('\n').slice(1).join('\n'))) mobile.reversePorts(stack.log);
  else
    stack.log(
      'WARNING: no emulator or device is visible to adb; run `adb reverse tcp:5100 tcp:5100` and tcp:4100 once one is up',
    );
  console.log('\n[mobile] stack is up. Enter or Ctrl+C stops and tears down.\n');
  process.on('SIGINT', () => stop(0));
  process.on('SIGTERM', () => stop(0));
  if (process.stdin.isTTY) process.stdin.once('data', () => stop(0));
  const stopFile = path.join(stack.out, 'STOP');
  rmSync(stopFile, { force: true });
  setInterval(() => existsSync(stopFile) && stop(0), 2000);
  await new Promise(() => {});
} catch (e) {
  console.error(`[mobile] ERROR: ${e.message}`);
  stop(1);
}
