import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  authSettingsFromEnv,
  cleanIssuer,
  fetchAuthSettings,
  parseAuthSettings,
  resetAuthSettingsCache,
  toAuthConfig,
} from '../../src/lib/auth/config.ts';

describe('the login settings the server reads from its environment', () => {
  test('in production both settings are required, and nothing is defaulted', () => {
    for (const env of [
      { NODE_ENV: 'production' },
      { NODE_ENV: 'production', AUTH_ISSUER: 'https://login.example.test' },
      { NODE_ENV: 'production', AUTH_CLIENT_ID: 'web' },
      { NODE_ENV: 'production', AUTH_ISSUER: '  ', AUTH_CLIENT_ID: 'web' },
    ]) {
      assert.deepEqual(authSettingsFromEnv(env), { ok: false, reason: 'AUTH_ISSUER and AUTH_CLIENT_ID are not set' });
    }
  });

  test('outside production the local mock issuer is the default', () => {
    assert.deepEqual(authSettingsFromEnv({}), {
      ok: true,
      settings: { issuer: 'http://localhost:5100', clientId: 'web-customer' },
    });
  });

  test('the settings are used as given, with trailing slashes removed', () => {
    const result = authSettingsFromEnv({
      NODE_ENV: 'production',
      AUTH_ISSUER: ' https://login.example.test// ',
      AUTH_CLIENT_ID: 'abc',
    });
    assert.deepEqual(result, { ok: true, settings: { issuer: 'https://login.example.test', clientId: 'abc' } });
  });

  test('an issuer that is not a plain http(s) address is refused, and the reason does not repeat the value', () => {
    for (const bad of [
      'not a url',
      'javascript:alert(1)',
      'ftp://login.example.test',
      'https://user:pw@login.example.test',
      'https://login.example.test/#x',
    ]) {
      const result = authSettingsFromEnv({ NODE_ENV: 'production', AUTH_ISSUER: bad, AUTH_CLIENT_ID: 'abc' });
      assert.deepEqual(result, { ok: false, reason: 'AUTH_ISSUER is not an http(s) address' });
    }
  });
});

describe('what the browser accepts from /api/config', () => {
  test('a good answer becomes settings; anything else is rejected', () => {
    assert.deepEqual(parseAuthSettings({ issuer: 'https://login.example.test/', clientId: 'abc' }), {
      issuer: 'https://login.example.test',
      clientId: 'abc',
    });
    for (const bad of [
      null,
      'x',
      {},
      { issuer: 'https://a.test' },
      { issuer: 'javascript:1', clientId: 'a' },
      { issuer: 'https://a.test', clientId: '' },
      { issuer: 1, clientId: 'a' },
    ]) {
      assert.equal(parseAuthSettings(bad), undefined);
    }
    assert.equal(cleanIssuer(undefined), undefined);
  });

  test("the authorize and token addresses and the callback are built from the settings and this app's own origin", () => {
    assert.deepEqual(
      toAuthConfig({ issuer: 'https://login.example.test', clientId: 'abc' }, 'https://shop.example.test'),
      {
        authorizeUrl: 'https://login.example.test/authorize',
        tokenUrl: 'https://login.example.test/token',
        clientId: 'abc',
        redirectUri: 'https://shop.example.test/auth/callback',
      },
    );
  });
});

describe('asking the server for the settings', () => {
  beforeEach(() => resetAuthSettingsCache());

  const answer = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  test('is asked once per page and the answer is reused', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return answer({ issuer: 'https://login.example.test', clientId: 'abc' });
    }) as unknown as typeof fetch;

    const first = await fetchAuthSettings(fetchImpl);
    const second = await fetchAuthSettings(fetchImpl);

    assert.deepEqual(first, { issuer: 'https://login.example.test', clientId: 'abc' });
    assert.deepEqual(second, first);
    assert.equal(calls, 1);
  });

  test('a failed answer is an error, is not kept, and the next attempt asks again', async () => {
    const responses = [
      answer({ error: 'Login is not configured' }, 503),
      answer({ issuer: 'https://login.example.test', clientId: 'abc' }),
    ];
    const fetchImpl = (async () => responses.shift()!) as unknown as typeof fetch;

    await assert.rejects(fetchAuthSettings(fetchImpl), /Login is not configured/);
    assert.deepEqual(await fetchAuthSettings(fetchImpl), { issuer: 'https://login.example.test', clientId: 'abc' });
  });

  test('an answer that is not valid settings is an error', async () => {
    const fetchImpl = (async () =>
      answer({ issuer: 'javascript:alert(1)', clientId: 'abc' })) as unknown as typeof fetch;
    await assert.rejects(fetchAuthSettings(fetchImpl), /Login is not configured/);
  });
});
