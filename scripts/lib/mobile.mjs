// The Android toolchain, emulator, app build and install, shared by scripts/dev/mobile-flows.mjs (the Maestro run), scripts/dev/mobile-demo.mjs (the
// demo) and scripts/dev/mobile-stack.mjs (only the backend). Local only, Windows first (WI-MOB-001). JDK 17, the Android SDK with the AVD
// bakery_pixel and, for the flows, Maestro are found at their usual places when JAVA_HOME and ANDROID_HOME are not set.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { root } from './local-stack.mjs';

export const APP_ID = 'com.bakerymarketplace.mobile';
export const appDir = path.join(root, 'apps', 'mobile-customer');
export const out = path.join(root, 'artifacts', 'mobile');
mkdirSync(out, { recursive: true });

const isWin = process.platform === 'win32';
const home = os.homedir();
export const androidHome =
  process.env.ANDROID_HOME ??
  path.join(process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'Android', 'Sdk');
const javaHome =
  process.env.JAVA_HOME ?? (isWin ? 'C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.21.9-hotspot' : undefined);
export const maestroBin = isWin ? 'C:\\tools\\maestro\\maestro\\bin' : path.join(home, '.maestro', 'bin');
export const adbDir = path.join(androidHome, 'platform-tools');
export const env = {
  ...process.env,
  ANDROID_HOME: androidHome,
  ...(javaHome ? { JAVA_HOME: javaHome } : {}),
  PATH: [adbDir, path.join(androidHome, 'emulator'), maestroBin, process.env.PATH].join(path.delimiter),
};
const exe = (name) => (isWin ? `${name}.exe` : name);

export function sh(cmd, cmdArgs, opts = {}) {
  return spawnSync(cmd, cmdArgs, { cwd: root, env, encoding: 'utf8', ...opts });
}
export const adb = (...a) => sh(path.join(adbDir, exe('adb')), a);

export function requireTool(label, ok, hint) {
  if (!ok) throw new Error(`${label} not found. ${hint}`);
}
export const requireAdb = () =>
  requireTool('adb', existsSync(path.join(adbDir, exe('adb'))), `Install the Android SDK platform-tools (${adbDir}).`);
export const requireMaestro = () =>
  requireTool(
    'Maestro',
    existsSync(path.join(maestroBin, isWin ? 'maestro.bat' : 'maestro')),
    `Expected it in ${maestroBin}.`,
  );

/** Whether something already listens on a local port (the stack needs 5200, 5300 and 4100 free). */
export function portInUse(port) {
  const r = spawnSync(process.execPath, [
    '-e',
    `require('net').connect({port:${port},host:'127.0.0.1'}).on('connect',()=>process.exit(1)).on('error',()=>process.exit(0))`,
  ]);
  return r.status === 1;
}

// ---- emulator ---------------------------------------------------------------------------------------------------------------
const hasDevice = () => /\bdevice\b/.test(adb('devices').stdout.split('\n').slice(1).join('\n'));
const booted = () => adb('shell', 'getprop', 'sys.boot_completed').stdout.trim() === '1';

/**
 * Makes sure an emulator (or device) is running. Returns true when this call booted one, so the caller can stop it again.
 * `window: false` starts it headless.
 */
export async function ensureEmulator(log, { window = true } = {}) {
  if (hasDevice() && booted()) {
    log('an emulator or device is already running; using it');
    return false;
  }
  log('starting the emulator bakery_pixel (about 90 s)');
  const child = spawn(
    path.join(androidHome, 'emulator', exe('emulator')),
    [
      '-avd',
      'bakery_pixel',
      '-no-snapshot',
      '-no-boot-anim',
      '-gpu',
      'swiftshader_indirect',
      '-memory',
      '2048',
      ...(window ? [] : ['-no-window']),
    ],
    { env, detached: true, stdio: 'ignore' },
  );
  child.unref();
  const deadline = Date.now() + 360_000;
  while (Date.now() < deadline) {
    if (hasDevice() && booted()) {
      log('the emulator is up');
      return true;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('the emulator did not finish booting within 6 minutes');
}

export const stopEmulator = () => adb('emu', 'kill');

/** The emulator reaches the host's issuer and BFF as localhost, so the issuer URL equals the iss the services expect (ADR-0023). */
export function reversePorts(log, ports = [5100, 4100]) {
  for (const port of ports) adb('reverse', `tcp:${port}`, `tcp:${port}`);
  log(`adb reverse set for ${ports.join(' and ')}`);
}

// ---- the app ----------------------------------------------------------------------------------------------------------------
/**
 * Builds the debug APK. `testHooks` compiles the "decline the payment" switch in (EXPO_PUBLIC_TEST_HOOKS=1): the flows need it, the demo must not
 * have it. The flag is read when the JavaScript bundle is made and Gradle does not treat an environment variable as an input, so the generated
 * bundle is deleted first; without that a build with the other setting would be reused.
 */
export function buildApp(log, { testHooks }) {
  const buildEnv = { ...env, ...(testHooks ? { EXPO_PUBLIC_TEST_HOOKS: '1' } : { EXPO_PUBLIC_TEST_HOOKS: '' }) };
  log(`prebuild (android/ is generated and git-ignored), test hooks ${testHooks ? 'ON' : 'off'}`);
  let r = sh('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install'], {
    cwd: appDir,
    env: buildEnv,
    shell: isWin,
    stdio: 'inherit',
  });
  if (r.status !== 0) throw new Error('expo prebuild failed');
  rmSync(path.join(appDir, 'android', 'app', 'build', 'generated', 'assets'), { recursive: true, force: true });
  rmSync(path.join(appDir, 'android', 'app', 'build', 'generated', 'res', 'createBundleDebugJsAndAssets'), {
    recursive: true,
    force: true,
  });
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

export function installApp(log) {
  const apk = path.join(appDir, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  requireTool('the debug APK', existsSync(apk), 'Run once without --no-build.');
  const r = adb('install', '-r', apk);
  if (!/Success/.test(r.stdout)) throw new Error(`adb install failed: ${r.stdout}${r.stderr}`);
  log('installed the debug APK');
}

export const launchApp = () => adb('shell', 'monkey', '-p', APP_ID, '-c', 'android.intent.category.LAUNCHER', '1');
export const clearAppData = () => adb('shell', 'pm', 'clear', APP_ID);
