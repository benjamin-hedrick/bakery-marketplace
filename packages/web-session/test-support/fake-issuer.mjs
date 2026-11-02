// A stand-in OpenID issuer for the browser tests of the web apps (ADR-0019). The login now happens on the app's server, so a browser test can
// no longer stub the issuer inside the page; it needs a real HTTP endpoint for /authorize and /token. This is that: no login page (it redirects
// straight back with a code), a token endpoint for the authorization-code and refresh grants with PKCE checked and refresh tokens rotated, and a
// control endpoint the tests use to change who logs in, how long a token lives, and how the issuer misbehaves. Not used outside tests.
//
//   node packages/web-session/test-support/fake-issuer.mjs        listens on FAKE_ISSUER_PORT (default 5101)
//   POST /__state   { user?, accessSeconds?, refreshable?, mode? }   mode: ok | down | revoked | bad-exchange | denied | forged-state
//   GET  /__state   what the issuer saw: the authorize requests and the token calls (grant types and counts, never secrets)
//   POST /__reset
import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';

const PORT = Number(process.env.FAKE_ISSUER_PORT ?? 5101);

const USERS = {
  vendor: { sub: 'vendor-shop-001', name: 'Corner Bakery (owner)', email: 'owner@cornerbakery.local', roles: 'Vendor' },
  customer: { sub: 'user-customer-1', name: 'Alice Customer', email: 'alice@customer.local', roles: 'Customer' },
};

const initial = () => ({ user: 'vendor', accessSeconds: 3600, refreshable: true, mode: 'ok' });
let state = initial();
let seen = { authorize: [], tokens: [] };
const codes = new Map(); // code -> { challenge, redirectUri, user }
const refreshTokens = new Map(); // token -> { user, used }

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const random = () => randomBytes(24).toString('base64url');

function accessToken(userKey) {
  const user = USERS[userKey] ?? USERS.vendor;
  const payload = { ...user, jti: random(), exp: Math.floor(Date.now() / 1000) + state.accessSeconds };
  return `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url(payload)}.${Buffer.from('not-a-real-signature').toString('base64url')}`;
}

function tokenBody(userKey) {
  const body = { access_token: accessToken(userKey), token_type: 'Bearer', expires_in: state.accessSeconds };
  if (state.refreshable) {
    const refresh = random();
    refreshTokens.set(refresh, { user: userKey, used: false });
    body.refresh_token = refresh;
  }
  return body;
}

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake-issuer');

    if (url.pathname === '/healthz') return json(res, 200, { ok: true });

    if (url.pathname === '/__reset' && req.method === 'POST') {
      state = initial();
      seen = { authorize: [], tokens: [] };
      codes.clear();
      refreshTokens.clear();
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/__state' && req.method === 'POST') {
      state = { ...state, ...JSON.parse((await readBody(req)) || '{}') };
      return json(res, 200, state);
    }
    if (url.pathname === '/__state') return json(res, 200, { ...state, ...seen });

    if (url.pathname === '/authorize') {
      const redirectUri = url.searchParams.get('redirect_uri');
      const params = Object.fromEntries(url.searchParams);
      seen.authorize.push(params);
      if (!redirectUri || url.searchParams.get('response_type') !== 'code')
        return json(res, 400, { error: 'invalid_request' });
      const code = random();
      codes.set(code, { challenge: url.searchParams.get('code_challenge'), redirectUri, user: state.user });
      const back = new URL(redirectUri);
      if (state.mode === 'denied') {
        back.searchParams.set('error', 'access_denied'); // the user said no, or the issuer refused
      } else {
        back.searchParams.set('code', code);
      }
      // 'forged-state' is a callback that is not the one this login started (a crafted link).
      const returnedState = state.mode === 'forged-state' ? 'forged' : url.searchParams.get('state');
      if (returnedState) back.searchParams.set('state', returnedState);
      res.writeHead(302, { location: back.toString() });
      return res.end();
    }

    if (url.pathname === '/token' && req.method === 'POST') {
      const form = new URLSearchParams(await readBody(req));
      const grant = form.get('grant_type');
      seen.tokens.push({
        grant,
        clientId: form.get('client_id'),
        hasSecret: form.has('client_secret'),
        hasVerifier: form.has('code_verifier'),
      });
      if (state.mode === 'down') return json(res, 503, { error: 'temporarily_unavailable' });

      if (grant === 'authorization_code') {
        if (state.mode === 'bad-exchange') return json(res, 400, { error: 'invalid_grant' });
        const entry = codes.get(form.get('code') ?? '');
        codes.delete(form.get('code') ?? '');
        const challenge = createHash('sha256')
          .update(form.get('code_verifier') ?? '')
          .digest('base64url');
        if (!entry || entry.redirectUri !== form.get('redirect_uri') || entry.challenge !== challenge)
          return json(res, 400, { error: 'invalid_grant' });
        return json(res, 200, tokenBody(entry.user));
      }

      if (grant === 'refresh_token') {
        if (state.mode === 'revoked') return json(res, 400, { error: 'invalid_grant' });
        const entry = refreshTokens.get(form.get('refresh_token') ?? '');
        if (!entry || entry.used) return json(res, 400, { error: 'invalid_grant' });
        entry.used = true;
        return json(res, 200, tokenBody(entry.user));
      }
      return json(res, 400, { error: 'unsupported_grant_type' });
    }

    json(res, 404, { error: 'not found' });
  })
  .listen(PORT, '127.0.0.1', () => console.log(`fake issuer for browser tests on :${PORT}`));
