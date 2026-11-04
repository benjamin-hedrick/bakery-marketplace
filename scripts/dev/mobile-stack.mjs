#!/usr/bin/env node
// WI-MOB-001: the local stack the Android app talks to, without the web app: Compose infrastructure (Redis, Cosmos emulator, mock issuer), the seed,
// the catalog and ordering services and the GraphQL BFF, then `adb reverse` for the issuer and the BFF so the emulator reaches them as
// http://localhost:5100 and http://localhost:4100 (ADR-0023). The BFF runs with the declined-payment test hook ON, because the app's failure flow
// needs it: this is a test stack, never a demo. Stops on Enter, Ctrl+C or when the file artifacts/mobile/STOP appears (for a run with no terminal),
// and tears everything down (--keep leaves Docker up).
//
//   node scripts/dev/mobile-stack.mjs [--keep]
//
// Needs Docker, the .NET SDK, Node >= 24, and an emulator or device visible to adb for the reverse step (skipped with a warning if there is none).
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createStack, ports } from '../lib/local-stack.mjs';

const keep = process.argv.includes('--keep');
const stack = createStack({ label: 'mobile', outDir: 'artifacts/mobile', distDir: '.next-mobile' });

const portInUse = (port) =>
  new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('error', () => resolve(false));
  });

function reversePorts() {
  const devices = spawnSync('adb', ['devices'], { encoding: 'utf8' }).stdout ?? '';
  if (!/\bdevice\b/.test(devices.split('\n').slice(1).join('\n'))) {
    stack.log(
      'WARNING: no emulator or device is visible to adb; run `adb reverse tcp:5100 tcp:5100` and tcp:4100 once one is up',
    );
    return;
  }
  for (const port of [5100, ports.bff])
    spawnSync('adb', ['reverse', `tcp:${port}`, `tcp:${port}`], { stdio: 'inherit' });
  stack.log('adb reverse set for 5100 (issuer) and 4100 (BFF)');
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
  for (const port of [ports.catalog, ports.ordering, ports.bff]) {
    if (await portInUse(port)) throw new Error(`port ${port} is already in use; stop what is using it first`);
  }
  stack.up();
  await stack.startServices({ testHooks: true });
  reversePorts();
  console.log('\n[mobile] stack is up (test hooks ON). Enter or Ctrl+C stops and tears down.\n');
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
