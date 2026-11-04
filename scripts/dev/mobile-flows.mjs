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
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { startFlowControl } from '../lib/flow-control.mjs';
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
let flowControl = null;
let stopping = false;
function teardown() {
  if (stopping) return;
  stopping = true;
  flowControl?.close();
  if (keep) return log('--keep: the stack (and the emulator, if booted here) are left running');
  stack.stopAll();
  stack.down();
  if (bootedEmulator) mobile.stopEmulator();
}

/** The first few lines of a message without the colour codes the checker adds (an escape character, then up to the letter m). */
function plainText(text, lines) {
  const ESC = String.fromCharCode(27);
  const withoutColour = text
    .split(ESC)
    .map((piece, i) => (i === 0 ? piece : piece.slice(piece.indexOf('m') + 1)))
    .join('');
  return withoutColour
    .split(String.fromCharCode(10))
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .slice(0, lines)
    .join(' | ');
}

/**
 * Maestro's own syntax check of the flows to run and of every subflow, before anything is started: a YAML mistake otherwise stops the whole run after the emulator,
 * the stack and the build are up (once, a colon in a flow's name cost a full run). Takes a few seconds a file, needs no device.
 */
function checkSyntax(flows) {
  const dir = path.join(mobile.appDir, '.maestro');
  const subflows = readdirSync(path.join(dir, 'subflows')).map((f) => path.join(dir, 'subflows', f));
  const files = [...flows.map((f) => path.join(dir, f)), ...subflows];
  const bad = [];
  for (const file of files) {
    const r = spawnSync(path.join(mobile.maestroBin, isWin ? 'maestro.bat' : 'maestro'), ['check-syntax', file], {
      cwd: mobile.appDir,
      env: mobile.env,
      shell: isWin,
      encoding: 'utf8',
    });
    if (r.status !== 0) bad.push(`${path.relative(mobile.appDir, file)}: ${plainText(`${r.stdout}${r.stderr}`, 3)}`);
  }
  if (bad.length > 0) throw new Error(`the flows do not parse: ${bad.join(' || ')}`);
  log(`the syntax of ${files.length} flow files is fine`);
}

let code = 1;
try {
  mobile.requireAdb();
  mobile.requireMaestro();
  for (const port of [ports.catalog, ports.ordering, ports.bff]) {
    if (mobile.portInUse(port)) throw new Error(`port ${port} is already in use; stop what is using it first`);
  }
  const flows = readdirSync(path.join(mobile.appDir, '.maestro')).filter(
    (f) => /^\d.*\.ya?ml$/.test(f) && (!only || f.startsWith(only)),
  );
  if (flows.length === 0) throw new Error('no flow matched');
  checkSyntax(flows);
  bootedEmulator = await mobile.ensureEmulator(log);
  stack.up();
  await stack.startServices({ testHooks: true });
  mobile.reversePorts(log);
  // The flows' setup steps (a customer's allergen profile, the newest order, taking the BFF away) call this from Maestro's JavaScript.
  flowControl = startFlowControl({ stack, log });
  if (!noBuild) mobile.buildApp(log, { testHooks: true });
  mobile.installApp(log);

  log(`running ${flows.length} flow(s): ${flows.join(', ')}`);
  // Asynchronous on purpose: the flow-control server above runs in this process and must keep answering while Maestro runs.
  const exitCode = await new Promise((resolve) => {
    const child = spawn(
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
    child.on('error', () => resolve(1));
    child.on('exit', (c) => resolve(c ?? 1));
  });
  code = exitCode;
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
