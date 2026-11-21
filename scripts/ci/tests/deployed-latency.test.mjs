import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { cookieJar, logIn, pct, summarise } from '../deployed-latency.mjs';

const WEB = 'https://web.example.test';
const ISSUER = 'https://mock-oidc.example.test';

/** A Response-like object: status, Location, Set-Cookie. */
const reply = (status, { location, cookies = [] } = {}) => ({
  status,
  headers: {
    get: (name) => (name.toLowerCase() === 'location' ? (location ?? null) : null),
    getSetCookie: () => cookies,
  },
});

describe('numbers', () => {
  test('nearest-rank percentiles', () => {
    const xs = [5, 1, 4, 2, 3, 10, 9, 8, 7, 6];
    assert.equal(pct(xs, 50), 5);
    assert.equal(pct(xs, 95), 10);
    assert.equal(pct([7], 95), 7);
  });

  test('a 429 is counted apart and left out of the timings; a failure is counted', () => {
    const [row] = summarise({
      reads: [
        { ms: 10, ok: true, limited: false },
        { ms: 30, ok: true, limited: false },
        { ms: 999, ok: false, limited: true },
        { ms: 20, ok: false, limited: false },
      ],
    });
    assert.deepEqual(row, { label: 'reads', n: 4, failed: 1, limited: 1, p50: 20, p95: 30, max: 30 });
  });

  test('only 429s leaves no timings rather than inventing them', () => {
    const [row] = summarise({ x: [{ ms: 5, ok: false, limited: true }] });
    assert.equal(row.p50, null);
    assert.equal(row.limited, 1);
  });
});

describe('the login the browser does', () => {
  test('the jar keeps name=value pairs and sends them back', () => {
    const jar = cookieJar();
    jar.take(reply(302, { cookies: ['__Host-bakery-login-web-customer=abc; Path=/; Secure; HttpOnly', 'other=1'] }));
    jar.take(reply(302, { cookies: ['other=2; Path=/'] }));
    assert.equal(jar.header(), '__Host-bakery-login-web-customer=abc; other=2');
  });

  test('login route, issuer form with the login parameters, callback; a session cookie at the end', async () => {
    const calls = [];
    const http = async (url, init = {}) => {
      calls.push({ url, init });
      if (url.startsWith(`${WEB}/api/auth/login`))
        return reply(302, {
          location: `${ISSUER}/authorize?client_id=web-customer&redirect_uri=${encodeURIComponent(`${WEB}/api/auth/callback`)}&state=s1&code_challenge=c1&code_challenge_method=S256&scope=openid`,
          cookies: ['__Host-bakery-login-web-customer=L; Path=/; Secure; HttpOnly'],
        });
      if (url === `${ISSUER}/authorize/submit`)
        return reply(302, { location: `${WEB}/api/auth/callback?code=k&state=s1` });
      if (url.startsWith(`${WEB}/api/auth/callback`))
        return reply(302, {
          location: '/',
          cookies: ['__Host-bakery-session-web-customer=S; Path=/; Secure; HttpOnly'],
        });
      throw new Error(url);
    };
    const jar = await logIn(WEB, ISSUER, 'user-customer-1', http);
    const form = calls[1].init.body;
    assert.equal(form.get('userId'), 'user-customer-1');
    for (const [k, v] of [
      ['state', 's1'],
      ['code_challenge', 'c1'],
      ['client_id', 'web-customer'],
      ['redirect_uri', `${WEB}/api/auth/callback`],
    ])
      assert.equal(form.get(k), v, k);
    assert.match(calls[2].init.headers.cookie, /__Host-bakery-login-web-customer=L/);
    assert.match(jar.header(), /__Host-bakery-session-web-customer=S/);
  });

  test('a login that goes anywhere but the issuer, or comes back without a session, is an error', async () => {
    const elsewhere = async () => reply(302, { location: 'https://evil.example/authorize' });
    await assert.rejects(() => logIn(WEB, ISSUER, 'u', elsewhere), /did not go to the issuer/);
    const noSession = async (url) =>
      url.includes('/api/auth/login')
        ? reply(302, { location: `${ISSUER}/authorize?state=s` })
        : url.endsWith('/authorize/submit')
          ? reply(302, { location: `${WEB}/api/auth/callback?code=k&state=s` })
          : reply(302, { location: '/auth/error?code=no_pending' });
    await assert.rejects(() => logIn(WEB, ISSUER, 'u', noSession), /did not start a session/);
  });
});
