#!/usr/bin/env node
// Records the Android emulator's screen in chunks (adb screenrecord stops after 3 minutes) for the demo film (register 163, WI-DEMO-001 follow-up).
// Test tooling that drives nothing: it only watches the screen from outside.
//
//   node scripts/dev/film/record-phone.mjs [--out artifacts/film/phone] [--size 540x1200] [--bit-rate 4000000]
//
// Waits for an emulator, then writes <out>/phone-<n>.mp4 and <out>/phone.json (the wall-clock start of every chunk, in epoch milliseconds, so the
// film script can line the phone up with the browser recordings). Stops when the file <out>/STOP appears, on Ctrl+C, or when the emulator goes away.
// Note: screenrecord writes a frame only when the screen changes, so a still screen gives a small, short-looking file; the film script pads it.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const out = path.resolve(opt('--out', 'artifacts/film/phone'));
const size = opt('--size', '540x1200');
const bitRate = opt('--bit-rate', '4000000');
const sdk =
  process.env.ANDROID_HOME ??
  process.env.ANDROID_SDK_ROOT ??
  path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk');
const adb = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const env = { ...process.env, MSYS_NO_PATHCONV: '1' }; // keep Git Bash from rewriting /sdcard

const run = (a) => spawnSync(adb, a, { encoding: 'utf8', env });
const log = (m) => console.log(`[record-phone] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const online = () => /\bdevice$/m.test(run(['devices']).stdout ?? '');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const stopFile = path.join(out, 'STOP');
let stopping = false;
process.on('SIGINT', () => (stopping = true));

log('waiting for an emulator');
while (!online() && !stopping && !existsSync(stopFile)) await sleep(2000);

const chunks = [];
const save = () => writeFileSync(path.join(out, 'phone.json'), JSON.stringify({ size, chunks }, null, 2));
for (let n = 1; online() && !stopping && !existsSync(stopFile); n++) {
  const remote = `/sdcard/film-${n}.mp4`;
  const startedAt = Date.now();
  log(`chunk ${n} started`);
  const child = spawn(
    adb,
    ['shell', 'screenrecord', '--size', size, '--bit-rate', bitRate, '--time-limit', '175', remote],
    { env, stdio: 'ignore' },
  );
  await new Promise((resolve) => {
    child.on('exit', resolve);
    const watch = setInterval(() => {
      if (stopping || existsSync(stopFile) || !online()) {
        clearInterval(watch);
        run(['shell', 'pkill', '-INT', 'screenrecord']); // lets screenrecord finish the file properly
      }
    }, 500);
    child.on('exit', () => clearInterval(watch));
  });
  await sleep(800); // the file is finalised after the process ends
  const file = path.join(out, `phone-${n}.mp4`);
  const pulled = run(['pull', remote, file]);
  run(['shell', 'rm', remote]);
  if (pulled.status === 0) chunks.push({ file: path.basename(file), startedAt, endedAt: Date.now() });
  else log(`chunk ${n} could not be pulled: ${pulled.stderr?.trim()}`);
  save();
}
save();
log(`stopped; ${chunks.length} chunk(s) in ${out}`);
