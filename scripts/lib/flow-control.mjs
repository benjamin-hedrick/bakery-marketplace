// A small local control server for the Maestro flows of the Android app (WI-MOB-002), started by scripts/dev/mobile-flows.mjs and by nothing else. A flow
// cannot read a user's orders through the BFF or stop a process itself, so two steps call this server from Maestro's JavaScript (`http.get`, `http.post` on 127.0.0.1:4199):
//
//   GET  /last-order?user=<customer id>                        that customer's newest order as the BFF reports it (its allergens), for a flow to assert on
//   GET  /order-count?user=<customer id>                       how many orders that customer has (the newest 50 at most), for the "one order after a retry" flow (WI-MOB-003)
//   POST /bff/stop     /bff/start                              takes the BFF away and brings it back (waits until it answers), for the "check failed" flow
//   POST /issuer/restart                                       restarts the mock issuer's container so it forgets its refresh tokens (WI-MOB-003, "refused session" flow)
//
// It is test tooling, local only, and it is on the list to be reviewed (register item 150): the project's rule is not to build functionality only to close a gap in testing (CLAUDE.md).
// The customers' saved allergen profiles are NOT set here any more: they are seed data (tools/BakeryMarketplace.Seed, SeedData.CustomerProfiles) for customers of the mock
// identity, and a flow logs in as the customer whose profile it needs. It listens on 127.0.0.1 and signs in as the customer asked for the way the app does
// (authorization code, PKCE S256, the public client bakery-mobile and the app's registered redirect address), so it needs no new endpoint or secret on the issuer.
// The token is held in a variable for one request and never logged or returned. It changes no auth logic.
//
// Who may call it: only a local, non-browser client that sends the header `x-flow-control: 1` (Maestro's scripts do). It has no password, so it refuses, with
// 403 and before doing anything, any request that carries an `Origin` header (a web page in a browser always sends one cross-origin, and a "simple" cross-origin
// POST needs no preflight), any request without the custom header (a browser cannot add one cross-origin without a preflight, which this server never
// answers), and any request whose `Host` is not 127.0.0.1 on its own port (DNS rebinding). Another program running as the same user on this machine can still call
// it while a run lasts; that is the limit of a loopback server with no secret.
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REDIRECT = 'com.bakerymarketplace.mobile:/auth/callback';
const CLIENT_ID = 'bakery-mobile';
const ALICE = 'user-customer-1';
/** Only the customers of the mock identity can be asked for; the issuer refuses any other id anyway. */
const CUSTOMER_ID = /^user-customer-[a-z0-9-]+$/;
const b64url = (buf) => buf.toString('base64url');

/** Signs in as a mock customer (Alice by default) with the app's own flow and returns an access token. */
export async function customerToken(issuer, userId = ALICE) {
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const state = b64url(randomBytes(8));
  const submit = await fetch(`${issuer}/authorize/submit`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      userId,
      redirect_uri: REDIRECT,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString(),
  });
  const location = submit.headers.get('location');
  if (submit.status !== 302 || !location) throw new Error(`the issuer did not redirect (${submit.status})`);
  const code = new URL(location).searchParams.get('code');
  if (!code) throw new Error('the issuer sent no code');
  const token = await fetch(`${issuer}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    }).toString(),
  });
  if (!token.ok) throw new Error(`the token request failed (${token.status})`);
  const json = await token.json();
  if (typeof json.access_token !== 'string') throw new Error('the issuer sent no access token');
  return json.access_token;
}

const COUNT = `query Count { orders(first: 50) { edges { node { id } } } }`;
const LAST = `query Last { orders(first: 1) { edges { node { id status allergens total { cents } } } } }`;

async function waitFor(url, up, seconds = 60) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    let answered = false;
    try {
      answered = (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok;
    } catch {
      /* not answering */
    }
    if (answered === up) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} did not ${up ? 'come up' : 'go down'} within ${seconds} s`);
}

/** Restarts the mock issuer's compose service. Its refresh tokens live in memory, so a restart makes it forget all of them (and it signs with a new key). */
function defaultRestartIssuer() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const r = spawnSync('docker', ['compose', 'restart', 'mock-oidc'], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`docker compose restart mock-oidc failed: ${r.stderr}`);
}

/** Starts the server. `stack` is the object from createStack (its stopOne and startOne manage the BFF process). Returns { close }. */
export function startFlowControl({
  stack,
  issuer = 'http://localhost:5100',
  bffUrl = 'http://localhost:4100/graphql',
  port = 4199,
  log = console.log,
  restartIssuer = defaultRestartIssuer,
}) {
  const health = `${new URL(bffUrl).origin}/healthz`;

  /** One GraphQL call to the BFF as the given customer (a fresh token each time, held only for the call). */
  async function bff(query, variables, userId) {
    const token = await customerToken(issuer, userId);
    const res = await fetch(bffUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (json.errors?.length) throw new Error(`the BFF answered an error: ${json.errors[0].message}`);
    return json.data;
  }

  const server = http.createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    // Before anything else: not from a browser page, from a client that knows the header, addressed to this server by its own name.
    const expectedHost = `127.0.0.1:${server.address().port}`;
    if (
      req.headers.origin !== undefined ||
      req.headers['x-flow-control'] !== '1' ||
      req.headers.host !== expectedHost
    ) {
      log(`flow control: refused ${req.method} ${req.url} (not a flow's call)`);
      return send(403, { error: 'refused' });
    }
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/last-order') {
        const user = url.searchParams.get('user') ?? ALICE;
        if (!CUSTOMER_ID.test(user)) return send(400, { error: 'not a customer id' });
        const data = await bff(LAST, {}, user);
        const node = data.orders.edges[0]?.node;
        return node ? send(200, node) : send(404, { error: `${user} has no order` });
      }
      if (req.method === 'GET' && url.pathname === '/order-count') {
        const user = url.searchParams.get('user') ?? ALICE;
        if (!CUSTOMER_ID.test(user)) return send(400, { error: 'not a customer id' });
        const data = await bff(COUNT, {}, user);
        return send(200, { count: data.orders.edges.length });
      }
      if (req.method === 'POST' && req.url === '/issuer/restart') {
        restartIssuer();
        await waitFor(`${issuer}/.well-known/openid-configuration`, true);
        log('the issuer is restarted (it has forgotten its refresh tokens)');
        return send(200, { ok: true });
      }
      if (req.method === 'POST' && req.url === '/bff/stop') {
        stack.stopOne('bff');
        await waitFor(health, false);
        log('the BFF is stopped');
        return send(200, { ok: true });
      }
      if (req.method === 'POST' && req.url === '/bff/start') {
        stack.startOne('bff');
        await waitFor(health, true);
        log('the BFF is back');
        return send(200, { ok: true });
      }
      send(404, { error: 'not found' });
    } catch (e) {
      log(`flow control: ${req.method} ${req.url} failed: ${e.message}`);
      send(500, { error: e.message });
    }
  });
  server.listen(port, '127.0.0.1');
  log(`flow control listening on 127.0.0.1:${port}`);
  return { server, close: () => server.close() };
}
