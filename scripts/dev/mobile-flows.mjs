#!/usr/bin/env node
// WI-MOB-001: the one command that runs the Maestro flows of the Android app (apps/mobile-customer/.maestro) on the emulator against the local stack.
//
//   node scripts/dev/mobile-flows.mjs                 boot the emulator if none is running, start the stack, build and install the app, run
//                                                     every flow, tear down what it started; exit 0 only if every flow passed
//   node scripts/dev/mobile-flows.mjs --no-build      reuse the app already installed on the emulator (it must be a test build)
//   node scripts/dev/mobile-flows.mjs --flow 03       run only the flow files whose name starts with 03
//   node scripts/dev/mobile-flows.mjs --keep          leave the stack (and an emulator it booted) running afterwards
//
// Local only, no CI. Needs Docker, the .NET SDK, Node >= 24, JDK 17, the Android SDK with the AVD bakery_pixel and Maestro (JAVA_HOME, ANDROID_HOME
// and the Maestro folder are found at their usual places when the variables are not set; docs/operations/local-dev.md). The app is built WITH the
// declined-payment switch (EXPO_PUBLIC_TEST_HOOKS=1) and the BFF started with ENABLE_TEST_HOOKS=1: a test setup, never a demo.
// Results: artifacts/mobile/maestro-junit.xml and artifacts/mobile/maestro.log.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStack, ports, root } from '../lib/local-stack.mjs';

const args = process.argv.slice(2);
const keep = args.includes('--keep');
const noBuild = args.includes('--no-build');
const only = args.includes('--flow') ? args[args.indexOf('--flow') + 1] : null;
const appDir = path.join(root, 'apps', 'mobile-customer');
const out = path.join(root, 'artifacts', 'mobile');
mkdirSync(out, { recursive: true });
const log = (m) => console.log(`[mobile-flows] ${m}`);
const isWin = process.platform === 'win32';

// ---- the toolchain ----------------------------------------------------------------------------------------------------------
const home = os.homedir();
const androidHome =
  process.env.ANDROID_HOME ??
  path.join(process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'Android', 'Sdk');
const javaHome =
  process.env.JAVA_HOME ?? (isWin ? 'C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.21.9-hotspot' : undefined);
const maestroBin = isWin ? 'C:\\tools\\maestro\\maestro\\bin' : path.join(home, '.maestro', 'bin');
const adbDir = path.join(androidHome, 'platform-tools');
const env = {
  ...process.env,
  ANDROID_HOME: androidHome,
  ...(javaHome ? { JAVA_HOME: javaHome } : {}),
  PATH: [adbDir, path.join(androidHome, 'emulator'), maestroBin, process.env.PATH].join(path.delimiter),
};
const exe = (name) => (isWin ? `${name}.exe` : name);

function sh(cmd, cmdArgs, opts = {}) {
  return spawnSync(cmd, cmdArgs, {
    cwd: root,
    env,
    encoding: 'utf8',
    shell: isWin && /\.(bat|cmd)$|^maestro$/.test(cmd),
    ...opts,
  });
}
const adb = (...a) => sh(path.join(adbDir, exe('adb')), a);

function requireTool(label, ok, hint) {
  if (!ok) throw new Error(`${label} not found. ${hint}`);
}

// ---- emulator ---------------------------------------------------------------------------------------------------------------
let bootedEmulator = false;
const hasDevice = () => /\bdevice\b/.test(adb('devices').stdout.split('\n').slice(1).join('\n'));
const booted = () => adb('shell', 'getprop', 'sys.boot_completed').stdout.trim() === '1';

async function ensureEmulator() {
  if (hasDevice() && booted()) return log('an emulator or device is already running; using it');
  log('starting the emulator bakery_pixel (about 90 s)');
  const child = spawn(
    path.join(androidHome, 'emulator', exe('emulator')),
    ['-avd', 'bakery_pixel', '-no-snapshot', '-no-boot-anim', '-gpu', 'swiftshader_indirect', '-memory', '2048'],
    { env, detached: true, stdio: 'ignore' },
  );
  child.unref();
  bootedEmulator = true;
  const deadline = Date.now() + 360_000;
  while (Date.now() < deadline) {
    if (hasDevice() && booted()) return log('the emulator is up');
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('the emulator did not finish booting within 6 minutes');
}

// ---- stack ------------------------------------------------------------------------------------------------------------------
const stack = createStack({ label: 'mobile', outDir: 'artifacts/mobile', distDir: '.next-mobile' });
let stopping = false;
function teardown() {
  if (stopping) return;
  stopping = true;
  if (keep) return log('--keep: the stack (and the emulator, if booted here) are left running');
  stack.stopAll();
  stack.down();
  if (bootedEmulator) adb('emu', 'kill');
}

function build() {
  const buildEnv = { ...env, EXPO_PUBLIC_TEST_HOOKS: '1' };
  log('prebuild (android/ is generated and git-ignored)');
  let r = sh('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install'], {
    cwd: appDir,
    env: buildEnv,
    shell: isWin,
    stdio: 'inherit',
  });
  if (r.status !== 0) throw new Error('expo prebuild failed');
  log('gradle assembleDebug (the first build takes about ten minutes, later ones about one)');
  const gradle = isWin ? '.\\gradlew.bat' : './gradlew';
  r = sh(gradle, ['app:assembleDebug', '-PreactNativeArchitectures=x86_64', '--console=plain'], {
    cwd: path.join(appDir, 'android'),
    env: buildEnv,
    shell: isWin,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1 << 28,
  });
  writeFileSync(path.join(out, 'gradle.log'), `${r.stdout ?? ''}\n${r.stderr ?? ''}`);
  if (r.status !== 0) throw new Error('the Gradle build failed (artifacts/mobile/gradle.log)');
}

function install() {
  const apk = path.join(appDir, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  requireTool('the debug APK', existsSync(apk), 'Run without --no-build once.');
  const r = adb('install', '-r', apk);
  if (!/Success/.test(r.stdout)) throw new Error(`adb install failed: ${r.stdout}${r.stderr}`);
  log('installed the debug APK');
}

// ---- run --------------------------------------------------------------------------------------------------------------------
let code = 1;
try {
  requireTool('adb', existsSync(path.join(adbDir, exe('adb'))), `Install the Android SDK platform-tools (${adbDir}).`);
  requireTool(
    'Maestro',
    existsSync(path.join(maestroBin, isWin ? 'maestro.bat' : 'maestro')),
    `Expected it in ${maestroBin}.`,
  );
  for (const port of [ports.catalog, ports.ordering, ports.bff]) {
    const s = spawnSync(process.execPath, [
      '-e',
      `require('net').connect({port:${port},host:'127.0.0.1'}).on('connect',()=>process.exit(1)).on('error',()=>process.exit(0))`,
    ]);
    if (s.status === 1) throw new Error(`port ${port} is already in use; stop what is using it first`);
  }
  await ensureEmulator();
  stack.up();
  await stack.startServices({ testHooks: true });
  for (const port of [5100, ports.bff]) adb('reverse', `tcp:${port}`, `tcp:${port}`);
  log('adb reverse set for 5100 (issuer) and 4100 (BFF)');
  if (!noBuild) build();
  install();

  const flows = readdirSync(path.join(appDir, '.maestro')).filter(
    (f) => /^\d.*\.ya?ml$/.test(f) && (!only || f.startsWith(only)),
  );
  if (flows.length === 0) throw new Error('no flow matched');
  log(`running ${flows.length} flow(s): ${flows.join(', ')}`);
  const result = spawnSync(
    path.join(maestroBin, isWin ? 'maestro.bat' : 'maestro'),
    [
      'test',
      '--format',
      'junit',
      '--output',
      path.join(out, 'maestro-junit.xml'),
      '--debug-output',
      path.join(out, 'maestro-debug'),
      ...flows.map((f) => path.join('.maestro', f)),
    ],
    { cwd: appDir, env, shell: isWin, stdio: 'inherit' },
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
