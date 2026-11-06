import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, test } from 'node:test';
import { defaultStorePrefix, parseEncryptionKey, sessionConfigFromEnv } from '../src/config.ts';
import { clearCookie, readCookie, serializeCookie } from '../src/cookie.ts';
import { createSealer } from '../src/crypto.ts';
import { checkSameOriginRead, checkStateChangingRequest } from '../src/csrf.ts';
import { LOGIN_MESSAGES, loginMessage } from '../src/messages.ts';
import { newKey } from './helpers.ts';

describe('the sealer (AES-256-GCM)', () => {
  test('opens what it sealed, and the sealed text shows nothing of the plaintext', () => {
    const sealer = createSealer(newKey());
    const sealed = sealer.seal('{"refreshToken":"very-secret"}', 'session:abc');

    assert.equal(sealer.open(sealed, 'session:abc'), '{"refreshToken":"very-secret"}');
    assert.doesNotMatch(sealed, /secret|refresh/);
    assert.match(sealed, /^s1\.k1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  test('seals the same text differently each time (a fresh nonce)', () => {
    const sealer = createSealer(newKey());

    assert.notEqual(sealer.seal('x', 'a'), sealer.seal('x', 'a'));
  });

  test('a record moved to another id, or altered, or opened with another key, is a miss', () => {
    const sealer = createSealer(newKey());
    const sealed = sealer.seal('payload', 'session:one');
    const [, kid, nonce, body] = sealed.split('.');
    const flipped = Buffer.from(body!, 'base64url');
    flipped[0] = flipped[0]! ^ 1;

    assert.equal(sealer.open(sealed, 'session:two'), null);
    assert.equal(sealer.open(`s1.${kid}.${nonce}.${flipped.toString('base64url')}`, 'session:one'), null);
    assert.equal(createSealer(newKey()).open(sealed, 'session:one'), null);
    assert.equal(sealer.open('garbage', 'session:one'), null);
    assert.equal(sealer.open('s1.k1.AAAA.AAAA', 'session:one'), null);
  });

  test('a record written under the previous key still opens during a rotation, and new records use the current key', () => {
    const oldKey = newKey('k1');
    const before = createSealer(oldKey).seal('kept', 'session:a');
    const rotated = createSealer(newKey('k2'), oldKey);

    assert.equal(rotated.open(before, 'session:a'), 'kept');
    assert.match(rotated.seal('new', 'session:a'), /^s1\.k2\./);
    assert.equal(createSealer(newKey('k2')).open(before, 'session:a'), null); // with the old key gone, the old sessions are gone
  });
});

describe('the settings', () => {
  const base = {
    AUTH_ISSUER: 'http://localhost:5100',
    AUTH_CLIENT_ID: 'web-queue-display',
    APP_ORIGIN: 'http://localhost:3100',
    SESSION_ENCRYPTION_KEY: randomBytes(32).toString('base64url'),
    SESSION_REDIS_URL: 'redis://127.0.0.1:6379',
  };

  test('plain HTTP on a loopback address gives the unprefixed, non-Secure cookie, with the documented defaults', () => {
    const result = sessionConfigFromEnv(base);

    assert.ok(result.ok);
    assert.equal(result.config.sessionCookieName, 'bakery-session-web-queue-display');
    assert.equal(result.config.cookieSecure, false);
    assert.equal(result.config.redirectUri, 'http://localhost:3100/api/auth/callback');
    assert.equal(result.config.idleSeconds, 12 * 3600);
    assert.equal(result.config.absoluteSeconds, 7 * 24 * 3600);
    assert.equal(result.config.scope, 'openid offline_access');
  });

  test('two apps on one host get different cookie names and store prefixes, so they cannot overwrite or read each other', () => {
    const queue = sessionConfigFromEnv(base);
    const customer = sessionConfigFromEnv({
      ...base,
      AUTH_CLIENT_ID: 'web-customer',
      APP_ORIGIN: 'http://localhost:3000',
    });

    assert.ok(queue.ok && customer.ok);
    assert.notEqual(queue.config.sessionCookieName, customer.config.sessionCookieName);
    assert.notEqual(queue.config.loginCookieName, customer.config.loginCookieName);
    assert.notEqual(defaultStorePrefix('web-queue-display'), defaultStorePrefix('web-customer'));
    assert.match(queue.config.sessionCookieName, /^bakery-session-web-queue-display$/);
  });

  test('an HTTPS origin gives the __Host- cookie names and Secure', () => {
    const result = sessionConfigFromEnv({ ...base, APP_ORIGIN: 'https://queue.example.com' });

    assert.ok(result.ok);
    assert.equal(result.config.sessionCookieName, '__Host-bakery-session-web-queue-display');
    assert.equal(result.config.loginCookieName, '__Host-bakery-login-web-queue-display');
    assert.equal(result.config.cookieSecure, true);
  });

  test('plain HTTP anywhere but a loopback address is refused to start', () => {
    const result = sessionConfigFromEnv({ ...base, APP_ORIGIN: 'http://queue.example.com' });

    assert.ok(!result.ok);
    assert.match(result.reason, /https/);
  });

  test('the server can reach the issuer by another address than the browser does', () => {
    const result = sessionConfigFromEnv({ ...base, AUTH_ISSUER_INTERNAL: 'http://mock-oidc:5100/' });

    assert.ok(result.ok);
    assert.equal(result.config.issuerBrowser, 'http://localhost:5100');
    assert.equal(result.config.issuerServer, 'http://mock-oidc:5100');
  });

  test('every missing or malformed setting is named in the refusal, and no value is printed', () => {
    const cases: [string, Record<string, string | undefined>][] = [
      ['AUTH_ISSUER', { AUTH_ISSUER: undefined }],
      ['AUTH_ISSUER', { AUTH_ISSUER: 'javascript:alert(1)' }],
      ['AUTH_CLIENT_ID', { AUTH_CLIENT_ID: '  ' }],
      ['APP_ORIGIN', { APP_ORIGIN: 'http://localhost:3100/some/path' }],
      ['SESSION_ENCRYPTION_KEY', { SESSION_ENCRYPTION_KEY: undefined }],
      ['SESSION_ENCRYPTION_KEY', { SESSION_ENCRYPTION_KEY: 'too-short-to-be-a-key' }],
      ['SESSION_ENCRYPTION_KEY_PREVIOUS', { SESSION_ENCRYPTION_KEY_PREVIOUS: 'nope' }],
      ['SESSION_REDIS_URL', { SESSION_REDIS_URL: undefined }],
      ['SESSION_IDLE_MINUTES', { SESSION_IDLE_MINUTES: '0' }],
      ['SESSION_ABSOLUTE_HOURS', { SESSION_ABSOLUTE_HOURS: 'a week' }],
    ];
    for (const [name, change] of cases) {
      const result = sessionConfigFromEnv({ ...base, ...change });
      assert.ok(!result.ok, name);
      assert.ok(result.reason.includes(name), `${name}: ${result.reason}`);
      for (const value of Object.values(change))
        if (value) assert.ok(!result.reason.includes(value), 'a value was printed');
    }
  });

  test('the in-memory store must be asked for twice: by name and by the explicit allowance', () => {
    assert.ok(!sessionConfigFromEnv({ ...base, SESSION_REDIS_URL: 'memory' }).ok);
    const allowed = sessionConfigFromEnv({ ...base, SESSION_REDIS_URL: 'memory', SESSION_ALLOW_MEMORY_STORE: '1' });
    assert.ok(allowed.ok);
    assert.equal(allowed.config.redisUrl, 'memory');
    // the allowance alone changes nothing for a real Redis address
    const real = sessionConfigFromEnv({
      ...base,
      SESSION_REDIS_URL: 'redis://127.0.0.1:6379',
      SESSION_ALLOW_MEMORY_STORE: '1',
    });
    assert.ok(real.ok && real.config.redisUrl === 'redis://127.0.0.1:6379');
  });

  test('the in-memory store is refused when the app origin is not a loopback address, even with the allowance (register 122)', () => {
    const result = sessionConfigFromEnv({
      ...base,
      APP_ORIGIN: 'https://web.example.com',
      SESSION_REDIS_URL: 'memory',
      SESSION_ALLOW_MEMORY_STORE: '1',
    });
    assert.ok(!result.ok);
    assert.ok(result.reason.includes('SESSION_REDIS_URL=memory'), result.reason);
    // loopback over https still works
    assert.ok(
      sessionConfigFromEnv({
        ...base,
        APP_ORIGIN: 'https://localhost:3100',
        SESSION_REDIS_URL: 'memory',
        SESSION_ALLOW_MEMORY_STORE: '1',
      }).ok,
    );
    // a real Redis address is unaffected by the origin
    assert.ok(sessionConfigFromEnv({ ...base, APP_ORIGIN: 'https://web.example.com' }).ok);
  });

  test('the renewal margin defaults to 60 seconds and can be set for tests', () => {
    const normal = sessionConfigFromEnv(base);
    const short = sessionConfigFromEnv({ ...base, SESSION_REFRESH_MARGIN_SECONDS: '5' });

    assert.ok(normal.ok && short.ok);
    assert.equal(normal.config.refreshMarginSeconds, 60);
    assert.equal(short.config.refreshMarginSeconds, 5);
    assert.ok(!sessionConfigFromEnv({ ...base, SESSION_REFRESH_MARGIN_SECONDS: '0' }).ok);
  });

  test('the previous key must have a different id from the current one', () => {
    const k = (id: string) => `${id}:${randomBytes(32).toString('base64url')}`;

    assert.ok(
      !sessionConfigFromEnv({ ...base, SESSION_ENCRYPTION_KEY: k('k1'), SESSION_ENCRYPTION_KEY_PREVIOUS: k('k1') }).ok,
    );
    assert.ok(
      sessionConfigFromEnv({ ...base, SESSION_ENCRYPTION_KEY: k('k2'), SESSION_ENCRYPTION_KEY_PREVIOUS: k('k1') }).ok,
    );
  });

  test('a key is exactly 32 bytes', () => {
    assert.ok(parseEncryptionKey(randomBytes(32).toString('base64url')));
    assert.equal(parseEncryptionKey(randomBytes(31).toString('base64url')), undefined);
    assert.equal(parseEncryptionKey(randomBytes(33).toString('base64url')), undefined);
    assert.equal(parseEncryptionKey(undefined), undefined);
  });
});

describe('cookies', () => {
  test('the session cookie is HttpOnly, SameSite=Lax, Path=/ with no Domain, and Secure when asked', () => {
    const secure = serializeCookie('__Host-bakery-session-web-queue-display', 'abc_DEF-123', {
      secure: true,
      maxAgeSeconds: 3600,
    });
    const plain = serializeCookie('bakery-session-web-queue-display', 'abc', { secure: false, maxAgeSeconds: 3600 });

    assert.match(
      secure,
      /^__Host-bakery-session-web-queue-display=abc_DEF-123; Path=\/; HttpOnly; SameSite=Lax; Max-Age=3600; Secure$/,
    );
    assert.ok(!/Secure/.test(plain));
    assert.ok(!/Domain/i.test(secure));
  });

  test('a value that is not an opaque id is refused, so a cookie cannot be used to inject attributes', () => {
    assert.throws(() => serializeCookie('x', 'a; Domain=evil.example', { secure: true, maxAgeSeconds: 1 }));
    assert.throws(() => serializeCookie('x', 'a\r\nSet-Cookie: y=z', { secure: true, maxAgeSeconds: 1 }));
  });

  test('clearing a cookie expires it at once', () => {
    const cleared = clearCookie('bakery-session-web-queue-display', false);

    assert.match(cleared, /^bakery-session-web-queue-display=; /);
    assert.match(cleared, /Max-Age=0/);
    assert.match(cleared, /Expires=Thu, 01 Jan 1970/);
  });

  test('reading one cookie from the header, the first of a name wins, and a missing one is undefined', () => {
    assert.equal(
      readCookie('a=1; bakery-session-web-queue-display=abc; b=2', 'bakery-session-web-queue-display'),
      'abc',
    );
    assert.equal(
      readCookie(
        'bakery-session-web-queue-display=first; bakery-session-web-queue-display=second',
        'bakery-session-web-queue-display',
      ),
      'first',
    );
    assert.equal(
      readCookie(['a=1', 'bakery-session-web-queue-display=abc'], 'bakery-session-web-queue-display'),
      'abc',
    );
    assert.equal(readCookie('xbakery-session-web-queue-display=nope', 'bakery-session-web-queue-display'), undefined);
    assert.equal(readCookie(undefined, 'bakery-session-web-queue-display'), undefined);
  });
});

describe('CSRF checks', () => {
  const ORIGIN = 'http://localhost:3100';
  const json = { 'content-type': 'application/json', origin: ORIGIN };

  test('a safe method is let through whatever it carries', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS', undefined])
      assert.ok(checkStateChangingRequest(method, {}, ORIGIN).ok, String(method));
  });

  test('a post from the app itself with a JSON body is accepted', () => {
    assert.ok(checkStateChangingRequest('POST', json, ORIGIN).ok);
    assert.ok(
      checkStateChangingRequest(
        'POST',
        { ...json, 'content-type': 'application/json; charset=utf-8', 'sec-fetch-site': 'same-origin' },
        ORIGIN,
      ).ok,
    );
  });

  test('a post from another origin, with no origin, or with another type is refused, and says which check failed', () => {
    assert.deepEqual(checkStateChangingRequest('POST', { ...json, origin: 'http://evil.example' }, ORIGIN), {
      ok: false,
      reason: 'origin',
    });
    assert.deepEqual(checkStateChangingRequest('POST', { 'content-type': 'application/json' }, ORIGIN), {
      ok: false,
      reason: 'origin',
    });
    assert.deepEqual(
      checkStateChangingRequest(
        'POST',
        { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
        ORIGIN,
      ),
      { ok: false, reason: 'content-type' },
    );
    assert.deepEqual(checkStateChangingRequest('POST', { origin: ORIGIN, 'content-type': 'text/plain' }, ORIGIN), {
      ok: false,
      reason: 'content-type',
    });
    assert.deepEqual(checkStateChangingRequest('POST', { origin: ORIGIN }, ORIGIN), {
      ok: false,
      reason: 'content-type',
    });
  });

  test('every state-changing method is checked, and a cross-site fetch is refused even with the right headers', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.ok(
        !checkStateChangingRequest(
          method,
          { origin: 'http://evil.example', 'content-type': 'application/json' },
          ORIGIN,
        ).ok,
        method,
      );
    }
    assert.deepEqual(checkStateChangingRequest('POST', { ...json, 'sec-fetch-site': 'cross-site' }, ORIGIN), {
      ok: false,
      reason: 'fetch-site',
    });
    assert.deepEqual(checkStateChangingRequest('POST', { ...json, 'sec-fetch-site': 'same-site' }, ORIGIN), {
      ok: false,
      reason: 'fetch-site',
    });
  });

  test('a read-only request that uses a resource is refused only when the browser says it comes from elsewhere', () => {
    assert.ok(checkSameOriginRead({}, ORIGIN).ok);
    assert.ok(checkSameOriginRead({ origin: ORIGIN }, ORIGIN).ok);
    assert.ok(checkSameOriginRead({ 'sec-fetch-site': 'same-origin' }, ORIGIN).ok);
    assert.ok(checkSameOriginRead({ 'sec-fetch-site': 'none' }, ORIGIN).ok);
    assert.ok(!checkSameOriginRead({ origin: 'http://evil.example' }, ORIGIN).ok);
    assert.ok(!checkSameOriginRead({ 'sec-fetch-site': 'cross-site' }, ORIGIN).ok);
  });
});

describe('the login messages', () => {
  test('a code from the query string gets its own fixed text, and anything else gets the general one', () => {
    assert.equal(loginMessage('state_mismatch'), LOGIN_MESSAGES.state_mismatch);
    for (const unknown of ['nonsense', '', undefined, 7, null, 'constructor', '__proto__', 'toString']) {
      assert.equal(loginMessage(unknown), LOGIN_MESSAGES.exchange_failed, String(unknown));
    }
  });

  test('no message mentions a token, a secret or a code', () => {
    for (const text of Object.values(LOGIN_MESSAGES)) assert.doesNotMatch(text, /token|secret|verifier|password/i);
  });
});
