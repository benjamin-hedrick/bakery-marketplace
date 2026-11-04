// A small local control server for the Maestro flows of the Android app (WI-MOB-002), started by scripts/dev/mobile-flows.mjs and by nothing else. A flow
// cannot sign in or stop a process itself, so its setup steps call this server from Maestro's JavaScript (`http.post('http://localhost:4199/...')`):
//
//   POST /profile      {"allergies": [...], "avoid": [...]}   saves Alice's allergen profile through the BFF (both lists empty clears it)
//   GET  /last-order                                           Alice's newest order as the BFF reports it (its allergens), for a flow to assert on
//   POST /bff/stop     /bff/start                              takes the BFF away and brings it back (waits until it answers), for the "check failed" flow
//
// It is test tooling, local only: it listens on 127.0.0.1, and it signs in as the mock issuer's customer Alice the way the app does (authorization code,
// PKCE S256, the public client bakery-mobile and the app's registered redirect address), so it needs no new endpoint or secret on the issuer. The token is
// held in a variable for one request and never logged or returned. It changes no auth logic.
import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';

const REDIRECT = 'com.bakerymarketplace.mobile:/auth/callback';
const CLIENT_ID = 'bakery-mobile';
const ALICE = 'user-customer-1';
const b64url = (buf) => buf.toString('base64url');

/** Signs in as Alice with the app's own flow and returns an access token. */
export async function customerToken(issuer) {
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const state = b64url(randomBytes(8));
  const submit = await fetch(`${issuer}/authorize/submit`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      userId: ALICE,
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

const SAVE = `mutation Save($input: SavePreferencesInput!) { savePreferences(input: $input) { __typename
  ... on SavePreferencesSuccess { preferences { allergies avoid } } ... on SavePreferencesRejected { message } } }`;
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

/** Starts the server. `stack` is the object from createStack (its stopOne and startOne manage the BFF process). Returns { close }. */
export function startFlowControl({
  stack,
  issuer = 'http://localhost:5100',
  bffUrl = 'http://localhost:4100/graphql',
  port = 4199,
  log = console.log,
}) {
  const health = `${new URL(bffUrl).origin}/healthz`;

  /** One GraphQL call to the BFF as Alice (a fresh token each time, held only for the call). */
  async function bff(query, variables) {
    const token = await customerToken(issuer);
    const res = await fetch(bffUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (json.errors?.length) throw new Error(`the BFF answered an error: ${json.errors[0].message}`);
    return json.data;
  }

  const readJson = (req) =>
    new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > 10_000) {
          reject(new Error('body too large'));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => {
        try {
          resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
        } catch {
          reject(new Error('body is not JSON'));
        }
      });
    });

  const server = http.createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.method === 'POST' && req.url === '/profile') {
        const body = await readJson(req);
        const lists = ['allergies', 'avoid'].map((k) =>
          Array.isArray(body[k]) ? body[k].filter((x) => typeof x === 'string') : [],
        );
        const data = await bff(SAVE, { input: { allergies: lists[0], avoid: lists[1] } });
        if (data.savePreferences.__typename !== 'SavePreferencesSuccess')
          throw new Error(data.savePreferences.message ?? 'the profile was rejected');
        log(`profile set: allergies [${lists[0]}], avoid [${lists[1]}]`);
        return send(200, data.savePreferences.preferences);
      }
      if (req.method === 'GET' && req.url === '/last-order') {
        const data = await bff(LAST, {});
        const node = data.orders.edges[0]?.node;
        return node ? send(200, node) : send(404, { error: 'Alice has no order' });
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
  return { close: () => server.close() };
}
