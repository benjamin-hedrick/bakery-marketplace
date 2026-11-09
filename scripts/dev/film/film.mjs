#!/usr/bin/env node
// The demo film director (register 163): runs a short, paced story on the real local stack and records three screens at once, a web customer, a phone customer
// and the bakery's live queue, plus a timeline of what happened when. `compose.mjs` turns the recordings into one video. The storyboard is in docs/operations/demo-film.md.
//
//   node scripts/dev/film/film.mjs [--out artifacts/film/run-<time>] [--dry-run] [--no-build] [--no-phone] [--keep]
//     --dry-run   check the tools, the ports and the files and print the plan; starts nothing
//     --no-build  reuse the Android app already installed on the emulator
//     --no-phone  film the web customer and the queue only (no emulator, no Maestro)
//     --keep      leave Docker and the emulator running afterwards
//
// STATUS: written 2026-11-07; first runs 2026-11-08 (web and queue alone, then with the phone): both finished and composed, see docs/operations/demo-film.md for what
// is proven. Test tooling: it drives the apps from outside, the way the browser suites and the Maestro flows do.
//
// How it works. The director (this process) starts the stack, the queue display, the web app and the emulator, brings the Android app to its first screen
// and only then starts the phone recorder (the film begins on the app, not on Android). It records the web customer's and the vendor's browsers with Playwright
// (video per browser context, 1280x720) and starts four actors in parallel: the vendor agent (acts on whatever is in the queue, a few seconds apart, so it
// needs no knowledge of the other actors), the web customer (Nora), the phone customer (Max, a Maestro flow that calls back here for its pauses and cues)
// and the other customers (placed through the BFF at set times). Everything is paced for a viewer: several seconds between steps, not realistic timings.
//
// Order of teardown matters (register 163): the phone recorder is stopped and waited for BEFORE the emulator goes, or its last chunk is lost.
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { customerToken } from '../../lib/flow-control.mjs';
import { bffUrl, createStack, issuerUrl, ports, root } from '../../lib/local-stack.mjs';
import * as mobile from '../../lib/mobile.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const dryRun = flag('--dry-run');
const noBuild = flag('--no-build');
const noPhone = flag('--no-phone');
const keep = flag('--keep');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = path.resolve(root, opt('--out', `artifacts/film/run-${stamp}`));
const log = (m) => console.log(`[film] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the story's numbers (seconds are of the viewer's time, not realistic ones) ------------------------------------------------------------------------
const CONTROL_PORT = 4198;
const WEB = `http://localhost:${ports.web}`;
const QUEUE = `http://localhost:${ports.queue}`;
const SIZE = { width: 1280, height: 720 };
const PAUSE = { read: 4000, short: 2500 }; // how long a viewer needs to read a screen / notice a change
const VENDOR = { seenMs: 7000, stepMs: 6000, spacingMs: 5000 }; // an order must have been on the queue 7 s before it is touched; 6 s between steps of one order; 5 s between any two actions
// Once the web order is completed and the phone order is cancelled, both screens are static and nobody gains from a slow queue: the rest goes at 2 s a step.
const VENDOR_FAST = { seenMs: 2000, stepMs: 2000, spacingMs: 2000 };
const BACKGROUND = [
  // when (after the recording rolls, so the orders arrive while the phone customer is still signing in), who, what. A plain order confirms itself; an option or a pickup time waits for the bakery.
  {
    afterBeat: 'rolling',
    delayMs: 6000,
    user: 'user-customer-1',
    method: 'pm-alice-ok',
    listing: 'listing-latte-001',
    modifiers: [],
    quantity: 2,
    window: false,
    allergens: null,
    caption: 'More customers order at the same time',
  },
  {
    afterBeat: 'rolling',
    delayMs: 14000,
    user: 'user-customer-avoiddairy',
    method: 'pm-avoiddairy-ok',
    listing: 'listing-sourdough-001',
    modifiers: [],
    quantity: 1,
    window: true,
    allergens: null,
    caption: 'A pickup time waits for the bakery to accept',
  },
  {
    afterBeat: 'rolling',
    delayMs: 22000,
    user: 'user-customer-sesame',
    method: 'pm-sesame-ok',
    listing: 'listing-sourdough-001',
    modifiers: ['mod-seeds'],
    quantity: 1,
    window: false,
    allergens: ['sesame'],
    caption: 'An allergy told to the bakery shows on its card',
  },
];
const WHO = { 'user-customer-1': 'Alice', 'user-customer-avoiddairy': 'Dana', 'user-customer-sesame': 'Sam' };
const EXPECTED_COMPLETED = 1 /* Nora */ + BACKGROUND.length; // Max cancels
const HARD_LIMIT_MS = 4 * 60 * 1000;

// ---- the timeline: what the compositor needs -------------------------------------------------------------------------------------------------------------
const timeline = { createdAt: new Date().toISOString(), recordings: {}, beats: [], captions: [], notes: [] };
const beatWaiters = new Map();
const beats = new Set();
const mark = (name) => {
  if (beats.has(name)) return;
  beats.add(name);
  timeline.beats.push({ name, at: Date.now() });
  log(`beat: ${name}`);
  for (const resolve of beatWaiters.get(name) ?? []) resolve();
};
const waitBeat = (name, ms = 120000) =>
  beats.has(name)
    ? Promise.resolve()
    : new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`beat ${name} did not happen within ${ms / 1000} s`)), ms);
        beatWaiters.set(name, [...(beatWaiters.get(name) ?? []), () => (clearTimeout(t), resolve())]);
      });
/** A caption for the viewer, shown from now for `ms`. */
const caption = (text, ms = 6000) => timeline.captions.push({ at: Date.now(), ms, text });
const note = (text) => (timeline.notes.push({ at: Date.now(), text }), log(text));

// ---- preflight -----------------------------------------------------------------------------------------------------------------------------------------
function preflight() {
  const problems = [];
  const need = (label, ok, hint) => ok || problems.push(`${label}: ${hint}`);
  const ffmpeg = findFfmpeg();
  need('ffmpeg', ffmpeg, 'not found (winget install Gyan.FFmpeg); only compose.mjs needs it, so this is a warning');
  for (const dir of [
    'apps/web-customer',
    'apps/web-queue-display',
    'services/graphql-bff',
    'packages/web-session',
    'packages/customer-core',
  ])
    need(`${dir}/node_modules`, existsSync(path.join(root, dir, 'node_modules')), 'run npm ci there');
  need(
    'Playwright Chromium',
    existsSync(path.join(root, 'apps/web-customer/node_modules/@playwright/test')),
    'npx playwright install chromium in apps/web-customer',
  );
  if (!noPhone) {
    need(
      'Maestro',
      existsSync(path.join(mobile.maestroBin, process.platform === 'win32' ? 'maestro.bat' : 'maestro')),
      `not found in ${mobile.maestroBin}`,
    );
    need(
      'adb',
      existsSync(path.join(mobile.adbDir, process.platform === 'win32' ? 'adb.exe' : 'adb')),
      `not found in ${mobile.adbDir}`,
    );
    need(
      'demo flow',
      existsSync(path.join(mobile.appDir, '.maestro/demo/phone-max.yaml')),
      'apps/mobile-customer/.maestro/demo/phone-max.yaml is missing',
    );
  }
  for (const [name, port] of Object.entries({ ...ports, control: CONTROL_PORT, issuer: 5100 }))
    if (mobile.portInUse(port)) problems.push(`port ${port} (${name}) is in use`);
  return problems;
}

function findFfmpeg() {
  const winget = path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Packages');
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg'], { encoding: 'utf8' });
  if (r.status === 0) return r.stdout.split(/\r?\n/)[0];
  return existsSync(winget) ? 'winget package folder (compose.mjs finds it)' : null;
}

if (dryRun) {
  const problems = preflight();
  console.log(
    `\nFilm plan (nothing is started):\n  output       ${out}\n  actors       vendor agent, web customer (Nora), ${noPhone ? 'no phone' : 'phone customer (Max, Maestro demo flow)'}, ${BACKGROUND.length} other customers by API`,
  );
  console.log(
    `  other orders ${BACKGROUND.map((b) => `${WHO[b.user] ?? b.user}: ${b.listing.replace('listing-', '').replace('-001', '')}${b.window ? ' + pickup time' : ''}${b.modifiers.length ? ' + option' : ''}`).join('; ')}`,
  );
  console.log(
    `  ends when    ${EXPECTED_COMPLETED} orders are Completed on the vendor side and the queue is empty (hard limit ${HARD_LIMIT_MS / 60000} min)`,
  );
  console.log(problems.length ? `\nProblems:\n  - ${problems.join('\n  - ')}` : '\nNo problems found.');
  process.exit(problems.some((p) => !p.startsWith('ffmpeg')) ? 1 : 0);
}

// ---- the control server the Maestro flow calls (pauses, beats) -------------------------------------------------------------------------------------------
function startControl() {
  const server = http.createServer(async (req, res) => {
    // Local tooling, but not for a web page: refuse a request a browser sends (it always carries an Origin) or one not addressed to this server by name.
    if (req.headers.origin !== undefined || req.headers.host !== `127.0.0.1:${CONTROL_PORT}`)
      return res.writeHead(403).end('refused');
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname === '/pause') await sleep(Math.min(20000, Number(url.searchParams.get('ms') ?? 0)));
      else if (url.pathname === '/beat') mark(url.searchParams.get('name'));
      else if (url.pathname === '/wait') await waitBeat(url.searchParams.get('name'), 300000);
      else if (url.pathname === '/caption')
        caption(url.searchParams.get('text') ?? '', Number(url.searchParams.get('ms') ?? 6000));
      else return res.writeHead(404).end('unknown');
      res.writeHead(200).end('ok');
    } catch (e) {
      res.writeHead(500).end(String(e.message));
    }
  });
  server.listen(CONTROL_PORT, '127.0.0.1');
  return server;
}

// ---- actors --------------------------------------------------------------------------------------------------------------------------------------------
const PLACE = `mutation($input: PlaceOrderInput!) { placeOrder(input: $input) { __typename
  ... on PlaceOrderSuccess { order { id } } ... on PlaceOrderRejected { code message } } }`;
const WINDOWS = `query($v: ID!) { pickupWindows(vendorId: $v) { start end } }`;
const gid = (type, id) => Buffer.from(`${type}:${id}`).toString('base64');

async function gql(token, query, variables) {
  const res = await fetch(bffUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

/** Another customer's order, through the BFF with that customer's own token (the same request the apps send). */
async function placeBackgroundOrder(o) {
  const token = await customerToken(issuerUrl, o.user);
  let pickupWindow = null;
  if (o.window) {
    const windows = (await gql(null, WINDOWS, { v: 'vendor-shop-001' })).data?.pickupWindows ?? [];
    if (windows.length) pickupWindow = windows[Math.min(2, windows.length - 1)];
  }
  const body = await gql(token, PLACE, {
    input: {
      idempotencyKey: `film-${randomUUID()}`,
      paymentMethodId: o.method,
      vendorId: 'vendor-shop-001',
      lineItems: [{ listingId: gid('Listing', o.listing), modifierIds: o.modifiers, quantity: o.quantity }],
      pickupWindow,
      allergens: o.allergens,
    },
  });
  const result = body.data?.placeOrder;
  if (result?.__typename !== 'PlaceOrderSuccess') throw new Error(`background order refused: ${JSON.stringify(body)}`);
}

async function backgroundActor() {
  await waitBeat('rolling', HARD_LIMIT_MS);
  const started = Date.now();
  for (const o of BACKGROUND) {
    await sleep(Math.max(0, started + o.delayMs - Date.now()));
    caption(o.caption, 7000);
    await placeBackgroundOrder(o);
    note(`order placed for ${o.user}`);
  }
  mark('background-done');
}

/** Acts on whatever is in the queue, a few seconds apart, so the audience can follow. Needs no knowledge of the other actors. */
async function vendorAgent(page, done) {
  const firstSeen = new Map();
  const lastStep = new Map();
  let lastAny = 0;
  while (!done.value) {
    const cards = await page
      .$$eval('[data-testid="queue-order"]', (els) =>
        els.map((e) => ({
          ref: e.getAttribute('data-reference'),
          actions: [...e.querySelectorAll('button[data-action]')].map((b) => b.getAttribute('data-action')),
        })),
      )
      .catch(() => []);
    const now = Date.now();
    const T = beats.has('web-completed') && beats.has('phone-cancelled') ? VENDOR_FAST : VENDOR;
    for (const c of cards) if (!firstSeen.has(c.ref)) firstSeen.set(c.ref, now);
    const ready = cards
      .map((c) => ({ ...c, next: c.actions.find((a) => a !== 'CANCEL' && a !== 'DECLINE') }))
      .filter((c) => c.next && now - firstSeen.get(c.ref) >= T.seenMs && now - (lastStep.get(c.ref) ?? 0) >= T.stepMs)
      // a bakery answers a new order before it moves the others along (the customers are waiting on their screens); then the newest first, so that the
      // two customers on screen (the last to order) are worked while the orders from earlier wait, and the earlier ones can be cleared quickly afterwards
      .sort((a, b) => (b.next === 'CONFIRM') - (a.next === 'CONFIRM') || firstSeen.get(b.ref) - firstSeen.get(a.ref));
    if (ready.length && now - lastAny >= T.spacingMs) {
      const c = ready[0];
      await page
        .locator(`[data-testid="queue-order"][data-reference="${c.ref}"] button[data-action="${c.next}"]`)
        .click({ timeout: 4000 })
        .then(() => {
          lastStep.set(c.ref, Date.now());
          lastAny = Date.now();
          note(`vendor: ${c.next} on ${c.ref}`);
          if (c.next === 'COMPLETE') done.completed = (done.completed ?? 0) + 1;
        })
        .catch((e) => note(`vendor: ${c.next} on ${c.ref} did not click (${e.message.split('\n')[0]})`));
    }
    await sleep(600);
  }
}

/** Nora, tree-nut allergy, on the web: browse, the warning on the croissant, acknowledge, order, then follow the order to the end. */
async function webCustomer(page) {
  await page.goto(WEB);
  await sleep(3500); // the opening caption ("nothing yet" on the queue) is on screen first
  caption('Nora has a tree-nut allergy and is ordering on the web', 6000);
  await sleep(PAUSE.read);
  await page.getByTestId('listing').filter({ hasText: 'Almond Croissant' }).getByRole('link').click();
  await sleep(PAUSE.short);
  await page.getByRole('checkbox', { name: /Extra almond/ }).check();
  await page.getByRole('button', { name: 'Add to order' }).click();
  await sleep(PAUSE.short);
  await page.getByTestId('cart-link').click();
  await page.getByTestId('login-required').getByRole('button', { name: 'Log in' }).click();
  await page.getByRole('button', { name: /Login as Nora/ }).click(); // first run: the issuer page lists users by name; Nora is the tree-nut customer
  await page.getByRole('form', { name: 'Place your order' }).waitFor();
  // Wait here for the phone customer to reach its warnings too (at most 30 s: the film goes on without it), so the caption is true of both screens.
  await waitBeat('phone-warnings', 30000).catch(() =>
    note('the phone did not reach its warnings within 30 s; going on without it'),
  );
  caption('Both customers are warned about their allergies and must acknowledge them', 7000);
  await sleep(PAUSE.read + 2000);
  await page.getByRole('checkbox', { name: 'I have read this and still want to order' }).check();
  await sleep(PAUSE.short);
  await page.getByRole('button', { name: 'Place test order' }).click();
  await page.waitForURL(/\/orders\/.+/);
  mark('web-ordered');
  caption('The bakery works its queue; each customer sees every step', 7000);
  // The order page follows the order by itself (polling); the viewer watches the status change as the bakery works.
  await page.locator('[data-testid="order-status"][data-status="COMPLETED"]').waitFor({ timeout: HARD_LIMIT_MS });
  mark('web-completed');
  await sleep(1500);
}

/**
 * Max on the phone: a paced Maestro flow. Maestro takes a while to start, so it is started BEFORE the recording rolls; the flow tells the director it is
 * ready (beat phone-ready) and then waits to be released (beat go-phone, set when the recording rolls). It calls back here for its pauses, to say when it
 * has ordered (beat phone-ordered) and for captions.
 */
function startPhoneFlow() {
  return new Promise((resolve) => {
    const child = spawn(
      path.join(mobile.maestroBin, process.platform === 'win32' ? 'maestro.bat' : 'maestro'),
      [
        'test',
        '-e',
        `FILM_URL=http://127.0.0.1:${CONTROL_PORT}`,
        '--debug-output',
        path.join(out, 'maestro-debug'),
        '.maestro/demo/phone-max.yaml',
      ],
      {
        cwd: mobile.appDir,
        env: { ...mobile.env, FILM_URL: `http://127.0.0.1:${CONTROL_PORT}` },
        shell: process.platform === 'win32',
        stdio: 'inherit',
      },
    );
    child.on('error', () => resolve(1));
    child.on('exit', (c) => resolve(c ?? 1));
  }).then((code) => (note(`phone flow finished (exit ${code})`), mark('phone-done'), code));
}

// ---- the run ---------------------------------------------------------------------------------------------------------------------------------------------
const stack = createStack({
  label: 'film',
  outDir: path.relative(root, path.join(out, 'stack')),
  distDir: '.next-film',
});
let control = null;
let recorder = null;
let bootedEmulator = false;
let browser = null;

async function stopPhoneRecorder() {
  if (!recorder) return;
  writeFileSync(path.join(out, 'phone', 'STOP'), '');
  await new Promise((resolve) => {
    recorder.on('exit', resolve);
    setTimeout(resolve, 20000);
  });
  recorder = null;
}

async function main() {
  const problems = preflight().filter((p) => !p.startsWith('ffmpeg'));
  if (problems.length) throw new Error(`preflight failed:\n  - ${problems.join('\n  - ')}`);
  // `out` is timestamped and createStack has already made out/stack for the logs: do not remove it here
  mkdirSync(path.join(out, 'video'), { recursive: true });
  control = startControl();

  // 1. the stack, the web apps, the emulator and the app on its first screen
  if (!noPhone) bootedEmulator = await mobile.ensureEmulator(log);
  stack.up();
  await stack.startServices();
  await stack.startWeb();
  await stack.startQueue();
  if (!noPhone) {
    mobile.reversePorts(log);
    if (!noBuild) mobile.buildApp(log);
    mobile.installApp(log);
    mobile.clearAppData();
    mobile.launchApp();
    await sleep(6000); // the splash screen, then the sign-in screen
  }

  // 2. the vendor's login (not filmed), then the recorded browsers
  const { chromium } = createRequire(path.join(root, 'apps/web-customer/package.json'))('@playwright/test');
  browser = await chromium.launch();
  const login = await browser.newContext({ baseURL: QUEUE });
  const lp = await login.newPage();
  await lp.goto('/');
  await lp.getByRole('button', { name: 'Log in' }).first().click();
  await lp.getByRole('button', { name: 'Login as Corner Bakery (owner) (Vendor)' }).click();
  await lp.getByTestId('queue-mode').filter({ hasText: 'Live' }).waitFor({ timeout: 30000 });
  const vendorState = await login.storageState();
  await login.close();

  // 3. the phone flow starts and waits for its release; then rolling: the phone recorder first (the app is on its first screen), then the two browsers
  let phoneRun = Promise.resolve(0);
  if (!noPhone) {
    phoneRun = startPhoneFlow();
    await waitBeat('phone-ready', 240000);
  }
  if (!noPhone) {
    mkdirSync(path.join(out, 'phone'), { recursive: true });
    recorder = spawn('node', [path.join(root, 'scripts/dev/film/record-phone.mjs'), '--out', path.join(out, 'phone')], {
      stdio: 'inherit',
    });
    await sleep(3000);
  }
  const vendorCtx = await browser.newContext({
    baseURL: QUEUE,
    storageState: vendorState,
    viewport: SIZE,
    recordVideo: { dir: path.join(out, 'video', 'vendor'), size: SIZE },
  });
  const vendorStarted = Date.now();
  const vendorPage = await vendorCtx.newPage();
  await vendorPage.goto('/');
  await vendorPage.getByTestId('queue-mode').filter({ hasText: 'Live' }).waitFor({ timeout: 30000 });
  const webCtx = await browser.newContext({
    baseURL: WEB,
    viewport: SIZE,
    recordVideo: { dir: path.join(out, 'video', 'web'), size: SIZE },
  });
  const webStarted = Date.now();
  const webPage = await webCtx.newPage();
  timeline.recordings.vendor = { startedAt: vendorStarted, dir: 'video/vendor' };
  timeline.recordings.web = { startedAt: webStarted, dir: 'video/web' };
  if (!noPhone) timeline.recordings.phone = { dir: 'phone' };
  mark('rolling');
  caption("Corner Bakery's live queue: nothing yet", 3000);
  if (!noPhone) setTimeout(() => mark('go-phone'), 1500); // the phone starts its story a moment after the browsers (its sign-in then runs while the first orders arrive)

  // 4. the actors
  const done = { value: false, completed: 0 };
  const vendor = vendorAgent(vendorPage, done);
  const background = backgroundActor();
  if (noPhone) for (const b of ['phone-warnings', 'phone-ordered', 'phone-cancelled']) mark(b); // nothing to wait for
  const web = webCustomer(webPage);
  const limit = setTimeout(() => note('HARD LIMIT reached; stopping'), HARD_LIMIT_MS);

  await Promise.race([Promise.all([web, phoneRun, background]), sleep(HARD_LIMIT_MS)]);
  // The actors are done placing orders; the vendor still has to work the queue down (the hard limit bounds this too).
  const endBy = webStarted + HARD_LIMIT_MS;
  while ((done.completed ?? 0) < EXPECTED_COMPLETED && Date.now() < endBy) await sleep(500);
  clearTimeout(limit);
  // Everything ordered is Completed (or cancelled): let the queue empty, hold the last screen for the viewer, then finish.
  await sleep(1000);
  caption('Local demo: test payments', 4500);
  await sleep(4500);
  done.value = true;
  await vendor;
  timeline.recordings.endedAt = Date.now();

  // 5. stop in the right order: the phone recorder first, then the browsers (their videos are written when a context closes), then the rest
  await stopPhoneRecorder();
  const files = {};
  for (const [name, ctx, pg] of [
    ['vendor', vendorCtx, vendorPage],
    ['web', webCtx, webPage],
  ]) {
    const v = pg.video();
    await ctx.close();
    files[name] = v ? await v.path() : null;
  }
  timeline.recordings.vendor.file = files.vendor && path.relative(out, files.vendor);
  timeline.recordings.web.file = files.web && path.relative(out, files.web);
  if (!noPhone && existsSync(path.join(out, 'phone', 'phone.json')))
    timeline.recordings.phone = {
      ...timeline.recordings.phone,
      ...JSON.parse(readFileSync(path.join(out, 'phone', 'phone.json'), 'utf8')),
    };
}

let code = 1;
try {
  await main();
  code = 0;
} catch (e) {
  console.error(`[film] ERROR: ${e.message}`);
  note(`ERROR: ${e.message}`);
} finally {
  await stopPhoneRecorder().catch(() => {});
  await browser?.close().catch(() => {});
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'timeline.json'), JSON.stringify(timeline, null, 2));
  control?.close();
  stack.stopAll();
  if (!keep) {
    stack.down();
    if (bootedEmulator) mobile.stopEmulator();
  }
  log(
    code === 0
      ? `recorded; next: node scripts/dev/film/compose.mjs --run ${path.relative(root, out)}`
      : `failed; the timeline so far is in ${path.join(out, 'timeline.json')}`,
  );
}
process.exit(code);
