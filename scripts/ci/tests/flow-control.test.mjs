// scripts/lib/flow-control.mjs (WI-MOB-002): the local control server the Maestro flows call (the newest order of a customer, and stopping and starting the BFF). These tests use a fake issuer, a fake BFF and a fake stack, so they run
// without Docker or an emulator. What matters most: a request that is not a flow's own call (a browser page, a missing header, a wrong Host) is refused before it
// reaches the issuer, the BFF or the process control.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { after, before, describe, test } from 'node:test';
import { startFlowControl } from '../../lib/flow-control.mjs';

const listen = async (handler) => {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, port: server.address().port };
};
const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });

describe('flow control server', () => {
  const seen = { issuer: [], bff: [], stack: [], users: [] };
  let issuer, bff, control, base;
  let bffUp = true; // what the fake stack's stop and start do to the fake BFF's health answer

  before(async () => {
    issuer = await listen(async (req, res) => {
      const body = await readBody(req);
      seen.issuer.push(`${req.method} ${req.url}`);
      if (req.url === '/authorize/submit') {
        const form = new URLSearchParams(body);
        seen.users.push(form.get('userId'));
        assert.equal(form.get('redirect_uri'), 'com.bakerymarketplace.mobile:/auth/callback');
        assert.equal(form.get('code_challenge_method'), 'S256');
        res.writeHead(302, {
          location: `com.bakerymarketplace.mobile:/auth/callback?code=the-code&state=${form.get('state')}`,
        });
        return res.end();
      }
      if (req.url === '/token') {
        const form = new URLSearchParams(body);
        assert.equal(form.get('code'), 'the-code');
        assert.equal(form.get('client_id'), 'bakery-mobile');
        assert.ok(form.get('code_verifier')?.length >= 43); // the PKCE verifier is sent
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ access_token: 'alice-token' }));
      }
      if (req.url === '/.well-known/openid-configuration') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end('{}');
      }
      res.writeHead(404).end();
    });
    bff = await listen(async (req, res) => {
      const body = JSON.parse((await readBody(req)) || '{}');
      seen.bff.push({
        url: req.url,
        auth: req.headers.authorization,
        query: body.query ?? '',
        variables: body.variables,
      });
      if (req.url === '/healthz') {
        res.writeHead(bffUp ? 200 : 503);
        return res.end('{}');
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      if (body.query?.includes('savePreferences')) {
        return res.end(
          JSON.stringify({
            data: { savePreferences: { __typename: 'SavePreferencesSuccess', preferences: body.variables.input } },
          }),
        );
      }
      return res.end(
        JSON.stringify({ data: { orders: { edges: [{ node: { id: 'o1', allergens: ['tree-nut'] } }] } } }),
      );
    });
    const stack = {
      stopOne: (n) => (seen.stack.push(`stop ${n}`), (bffUp = false)),
      startOne: (n) => (seen.stack.push(`start ${n}`), (bffUp = true)),
    };
    const restartIssuer = () => seen.stack.push('restart issuer');
    control = startFlowControl({
      stack,
      issuer: `http://127.0.0.1:${issuer.port}`,
      bffUrl: `http://127.0.0.1:${bff.port}/graphql`,
      port: 0,
      restartIssuer,
      log: () => {},
    });
    await once(control.server, 'listening');
    base = `http://127.0.0.1:${control.server.address().port}`;
  });

  after(() => {
    control.close();
    issuer.server.close();
    bff.server.close();
  });

  const reset = () => {
    seen.issuer.length = 0;
    seen.bff.length = 0;
    seen.stack.length = 0;
    seen.users.length = 0;
  };
  const flow = { 'x-flow-control': '1', 'content-type': 'application/json' };

  test('reports the newest order of the customer asked for: the PKCE sign-in as that customer, then one orders query with their bearer token', async () => {
    reset();
    const res = await fetch(`${base}/last-order?user=user-customer-treenut`, { headers: flow });
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).allergens, ['tree-nut']);
    assert.deepEqual(seen.users, ['user-customer-treenut']);
    assert.deepEqual(seen.issuer, ['POST /authorize/submit', 'POST /token']);
    const call = seen.bff.find((b) => b.query.includes('orders'));
    assert.equal(call.auth, 'Bearer alice-token'); // the fake issuer hands out one token
    assert.ok(!seen.bff.some((b) => b.query.includes('savePreferences')), 'nothing here writes a profile any more');
  });

  test('without a user it asks as Alice', async () => {
    reset();
    assert.equal((await fetch(`${base}/last-order`, { headers: flow })).status, 200);
    assert.deepEqual(seen.users, ['user-customer-1']);
  });

  test('only customers of the mock identity can be asked for: anything else is a 400 before the issuer is reached', async () => {
    for (const user of [
      'user-vendor-1',
      'vendor-shop-001',
      'user-admin-1',
      '../x',
      'user-customer-',
      'USER-CUSTOMER-1',
      'user-customer-1;x',
    ]) {
      reset();
      const res = await fetch(`${base}/last-order?user=${encodeURIComponent(user)}`, { headers: flow });
      assert.equal(res.status, 400, user);
      assert.deepEqual(seen.issuer, [], user);
    }
  });

  test('the profile endpoint is gone: profiles are seed data, not something a flow sets', async () => {
    reset();
    const res = await fetch(`${base}/profile`, {
      method: 'POST',
      headers: flow,
      body: JSON.stringify({ allergies: ['tree-nut'], avoid: [] }),
    });
    assert.equal(res.status, 404);
    assert.deepEqual(seen.bff, []);
  });

  test('counts the customer’s orders (WI-MOB-003): one orders query as that customer', async () => {
    reset();
    const res = await fetch(`${base}/order-count?user=user-customer-2`, { headers: flow });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { count: 1 }); // the fake BFF has one order
    assert.deepEqual(seen.users, ['user-customer-2']);
    reset();
    assert.equal((await fetch(`${base}/order-count?user=user-vendor-1`, { headers: flow })).status, 400);
    assert.deepEqual(seen.issuer, []);
  });

  test('restarts the issuer and waits until it answers (WI-MOB-003)', async () => {
    reset();
    assert.equal((await fetch(`${base}/issuer/restart`, { method: 'POST', headers: flow, body: '{}' })).status, 200);
    assert.deepEqual(seen.stack, ['restart issuer']);
    assert.ok(seen.issuer.includes('GET /.well-known/openid-configuration'));
  });

  test('stops and starts the BFF process', async () => {
    reset();
    assert.equal((await fetch(`${base}/bff/stop`, { method: 'POST', headers: flow, body: '{}' })).status, 200);
    assert.equal((await fetch(`${base}/bff/start`, { method: 'POST', headers: flow, body: '{}' })).status, 200);
    assert.deepEqual(seen.stack, ['stop bff', 'start bff']);
  });

  describe('refuses what is not a flow’s own call, before touching the issuer, the BFF or the processes', () => {
    const refused = async (label, init, url = '/bff/stop') => {
      reset();
      const res = await fetch(`${base}${url}`, init);
      assert.equal(res.status, 403, label);
      assert.deepEqual(seen, { issuer: [], bff: [], stack: [], users: [] }, `${label}: nothing may have been reached`);
    };

    test('a web page: a cross-origin POST carries an Origin header, even a "simple" one with no preflight', async () => {
      await refused('origin', {
        method: 'POST',
        headers: { 'x-flow-control': '1', origin: 'http://evil.example', 'content-type': 'text/plain' },
        body: '{}',
      });
      await refused('origin, no custom header', {
        method: 'POST',
        headers: { origin: 'http://evil.example', 'content-type': 'text/plain' },
        body: '{}',
      });
    });

    test('a request without the custom header', async () => {
      await refused('no header', { method: 'POST', body: '{}' });
      await refused('wrong value', { method: 'POST', headers: { 'x-flow-control': 'yes' }, body: '{}' });
      await refused(
        'profile, no header',
        { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"allergies":["x"],"avoid":[]}' },
        '/profile',
      );
      await refused('last order, no header', { method: 'GET' }, '/last-order');
      await refused('order count, no header', { method: 'GET' }, '/order-count');
      await refused('issuer restart, no header', { method: 'POST', body: '{}' }, '/issuer/restart');
      await refused(
        'issuer restart from a web page',
        { method: 'POST', headers: { 'x-flow-control': '1', origin: 'http://evil.example' }, body: '{}' },
        '/issuer/restart',
      );
    });

    test('a request whose Host is not this server by address (DNS rebinding)', async () => {
      reset();
      const res = await new Promise((resolve, reject) => {
        const req = http.request(
          {
            host: '127.0.0.1',
            port: control.server.address().port,
            path: '/bff/stop',
            method: 'POST',
            headers: { ...flow, host: 'rebound.example' },
          },
          resolve,
        );
        req.on('error', reject);
        req.end('{}');
      });
      assert.equal(res.statusCode, 403);
      res.resume();
      assert.deepEqual(seen, { issuer: [], bff: [], stack: [], users: [] });
    });

    test('a browser’s preflight is not answered with permission', async () => {
      const res = await fetch(`${base}/bff/stop`, {
        method: 'OPTIONS',
        headers: {
          origin: 'http://evil.example',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'x-flow-control',
        },
      });
      assert.equal(res.status, 403);
      assert.equal(res.headers.get('access-control-allow-origin'), null);
    });
  });

  test('an unknown path is a 404 and the server keeps serving', async () => {
    assert.equal((await fetch(`${base}/nope`, { headers: flow })).status, 404);
    assert.equal((await fetch(`${base}/last-order`, { headers: flow })).status, 200);
  });
});
