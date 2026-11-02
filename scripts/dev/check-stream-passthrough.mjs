// WI-QUE-003 step 5: does the real `next start` pass an event stream through incrementally, uncompressed, and close the call to the BFF when the
// browser leaves? Starts a fake issuer (5191), a fake BFF that sends an event every 300 ms (4199) and the built queue display app (3100), logs
// in through the app's own routes, opens /api/graphql-stream asking for gzip and reports. Needs `npm run build` in apps/web-queue-display first.
//   node scripts/dev/check-stream-passthrough.mjs        exit 0 when every check passes, 1 otherwise
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const APP = `${ROOT}/apps/web-queue-display`;
const APP_URL = 'http://localhost:3100';
const procs = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- fake BFF: an event every 300 ms
const bffSeen = [];
let bffClosed = 0;
let bffOpen = 0;
const bff = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  bffSeen.push({
    authorization: req.headers.authorization,
    accept: req.headers.accept,
    body: Buffer.concat(chunks).toString(),
    cookie: req.headers.cookie,
  });
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    'content-encoding': 'none',
    connection: 'keep-alive',
  });
  res.write(':\n\n');
  bffOpen++;
  let i = 0;
  const timer = setInterval(() => res.write(`event: next\ndata: {"data":{"n":${++i}}}\n\n`), 300);
  res.on('close', () => {
    clearInterval(timer);
    bffClosed++;
    bffOpen--;
  });
});
await new Promise((r) => bff.listen(4199, '127.0.0.1', r));

function start(name, cmd, args, opts) {
  const p = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {});
  p.stderr.on('data', (d) => process.stderr.write(`[${name}] ${d}`));
  procs.push(p);
  return p;
}
start('issuer', 'node', [`${ROOT}/packages/web-session/test-support/fake-issuer.mjs`], {
  env: { ...process.env, FAKE_ISSUER_PORT: '5191' },
});
start('next', 'node', [`${APP}/node_modules/next/dist/bin/next`, 'start', '-p', '3100'], {
  cwd: APP,
  env: {
    ...process.env,
    GRAPHQL_URL: 'http://127.0.0.1:4199/graphql',
    AUTH_ISSUER: 'http://localhost:5191',
    AUTH_CLIENT_ID: 'web-queue-display',
    APP_ORIGIN: APP_URL,
    SESSION_REDIS_URL: 'memory',
    SESSION_ALLOW_MEMORY_STORE: '1',
    SESSION_ENCRYPTION_KEY: randomBytes(32).toString('base64url'),
  },
});

let failed = false;
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed = true;
};

try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${APP_URL}/api/auth/me`)).ok && (await fetch('http://localhost:5191/healthz')).ok) break;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }

  // ---- log in through the app's own routes and the fake issuer
  const jar = new Map();
  const remember = (res) => {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const [k, v] = pair.split('=');
      if (/Max-Age=0|Expires=Thu, 01 Jan 1970/.test(c)) jar.delete(k);
      else jar.set(k, v);
    }
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  let res = await fetch(`${APP_URL}/api/auth/login?returnTo=/`, { redirect: 'manual' });
  remember(res);
  res = await fetch(res.headers.get('location'), { redirect: 'manual' }); // the issuer sends the browser back with a code
  const callback = res.headers.get('location');
  res = await fetch(callback, { redirect: 'manual', headers: { cookie: cookie() } });
  remember(res);
  const me = await (await fetch(`${APP_URL}/api/auth/me`, { headers: { cookie: cookie() } })).json();
  check(me.authenticated === true, `logged in through the app (${me.user?.subject})`);

  // ---- open the stream, as a browser would (it asks for gzip)
  const t0 = Date.now();
  const stream = await fetch(`${APP_URL}/api/graphql-stream`, {
    method: 'POST',
    headers: {
      origin: APP_URL,
      'content-type': 'application/json',
      accept: 'text/event-stream',
      'accept-encoding': 'gzip, deflate, br',
      cookie: cookie(),
    },
    body: JSON.stringify({ query: 'subscription { vendorOrderChanged { id } }' }),
  });
  check(stream.status === 200, `status ${stream.status}`);
  check(
    stream.headers.get('content-encoding') === null,
    `no content-encoding (got ${stream.headers.get('content-encoding')})`,
  );
  check(
    stream.headers.get('cache-control') === 'no-store, no-transform',
    `cache-control: ${stream.headers.get('cache-control')}`,
  );
  check(
    /^text\/event-stream/.test(stream.headers.get('content-type') ?? ''),
    `content-type: ${stream.headers.get('content-type')}`,
  );

  const reader = stream.body.getReader();
  const arrivals = [];
  let text = '';
  while (arrivals.length < 5) {
    const { done, value } = await Promise.race([reader.read(), sleep(5000).then(() => ({ timeout: true }))]);
    if (done || value === undefined) break;
    text += new TextDecoder().decode(value);
    arrivals.push(Date.now() - t0);
  }
  console.log('chunk arrival times (ms after request):', arrivals.join(', '));
  const spread = arrivals.at(-1) - arrivals[0];
  check(
    arrivals.length >= 4 && spread >= 600,
    `frames arrived over time, not all at the end (spread ${spread} ms across ${arrivals.length} chunks)`,
  );
  check(/event: next/.test(text), 'the BFF events came through');
  check(bffSeen[0]?.authorization?.startsWith('Bearer ey'), 'the BFF received a bearer token built from the session');
  check(bffSeen[0]?.cookie === undefined, 'the BFF received no cookie');
  check(bffSeen[0]?.accept === 'text/event-stream', 'the BFF received the event-stream accept header');

  // ---- the browser leaves
  check(bffOpen === 1, `the BFF has one stream open (${bffOpen})`);
  const leftAt = Date.now();
  await reader.cancel();
  while (bffOpen > 0 && Date.now() - leftAt < 3000) await sleep(20);
  check(bffOpen === 0, `the call to the BFF closed ${Date.now() - leftAt} ms after the browser left`);
} catch (e) {
  console.error('ERROR', e);
  failed = true;
} finally {
  for (const p of procs) p.kill();
  bff.closeAllConnections();
  bff.close();
}
console.log(failed ? 'RESULT: FAILED' : 'RESULT: all checks passed');
process.exit(failed ? 1 : 0);
