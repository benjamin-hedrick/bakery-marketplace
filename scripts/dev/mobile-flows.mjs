#!/usr/bin/env node
// WI-MOB-001: the one command that runs the Maestro flows of the Android app (apps/mobile-customer/.maestro) on the emulator against the local stack.
//
//   node scripts/dev/mobile-flows.mjs                 boot the emulator if none is running, start the stack, build and install the app, run
//                                                     every flow, tear down what it started; exit 0 only if every flow passed
//   node scripts/dev/mobile-flows.mjs --no-build      reuse the app already installed on the emulator (it must be a test build)
//   node scripts/dev/mobile-flows.mjs --flow 03       run only the flow files whose name starts with 03
//   node scripts/dev/mobile-flows.mjs --keep          leave the stack (and an emulator it booted) running afterwards
//
// Local only, no CI. Needs Docker, the .NET SDK, Node >= 24, JDK 17, the Android SDK with the AVD bakery_pixel and Maestro (scripts/lib/mobile.mjs
// finds them at their usual places when JAVA_HOME and ANDROID_HOME are not set; docs/operations/scripts.md). The app is built WITH the
// declined-payment switch (EXPO_PUBLIC_TEST_HOOKS=1) and the BFF started with ENABLE_TEST_HOOKS=1: a test setup, never a demo.
// Results: artifacts/mobile/maestro-junit.xml and the debug output under artifacts/mobile/maestro-debug.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { createStack, ports } from '../lib/local-stack.mjs';
import * as mobile from '../lib/mobile.mjs';

const args = process.argv.slice(2);
const keep = args.includes('--keep');
const noBuild = args.includes('--no-build');
const only = args.includes('--flow') ? args[args.indexOf('--flow') + 1] : null;
const log = (m) => console.log(`[mobile-flows] ${m}`);
const isWin = process.platform === 'win32';

const stack = createStack({ label: 'mobile', outDir: 'artifacts/mobile', distDir: '.next-mobile' });
let bootedEmulator = false;
let stopping = false;
function teardown() {
  if (stopping) return;
  stopping = true;
  if (keep) return log('--keep: the stack (and the emulator, if booted here) are left running');
  stack.stopAll();
  stack.down();
  if (bootedEmulator) mobile.stopEmulator();
}

let code = 1;
try {
  mobile.requireAdb();
  mobile.requireMaestro();
  for (const port of [ports.catalog, ports.ordering, ports.bff]) {
    if (mobile.portInUse(port)) throw new Error(`port ${port} is already in use; stop what is using it first`);
  }
  bootedEmulator = await mobile.ensureEmulator(log);
  stack.up();
  await stack.startServices({ testHooks: true });
  mobile.reversePorts(log);
  if (!noBuild) mobile.buildApp(log, { testHooks: true });
  mobile.installApp(log);

  const flows = readdirSync(path.join(mobile.appDir, '.maestro')).filter(
    (f) => /^\d.*\.ya?ml$/.test(f) && (!only || f.startsWith(only)),
  );
  if (flows.length === 0) throw new Error('no flow matched');
  log(`running ${flows.length} flow(s): ${flows.join(', ')}`);
  const result = spawnSync(
    path.join(mobile.maestroBin, isWin ? 'maestro.bat' : 'maestro'),
    [
      'test',
      '--format',
      'junit',
      '--output',
      path.join(mobile.out, 'maestro-junit.xml'),
      '--debug-output',
      path.join(mobile.out, 'maestro-debug'),
      ...flows.map((f) => path.join('.maestro', f)),
    ],
    { cwd: mobile.appDir, env: mobile.env, shell: isWin, stdio: 'inherit' },
  );
  code = result.status ?? 1;
  log(
    code === 0
      ? 'every flow passed'
      : 'at least one flow FAILED (artifacts/mobile/maestro-debug has screenshots and the command log)',
  );
} catch (e) {
  console.error(`[mobile-flows] ERROR: ${e.message}`);
} finally {
  teardown();
}
process.exit(code);
