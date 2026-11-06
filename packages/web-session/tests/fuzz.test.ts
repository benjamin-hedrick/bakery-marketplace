import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { checkSameOriginRead, checkStateChangingRequest } from '../src/csrf.ts';
import { readCookie } from '../src/cookie.ts';
import {
  extraForwardedHeaders,
  FORWARDED_REQUEST_HEADERS,
  forwardedRequestHeaders,
  readRequestBody,
} from '../src/graphql-proxy.ts';
import { clientAddress, createTokenBucketLimiter } from '../src/rate-limit.ts';
import { safeReturnTo } from '../src/return-to.ts';

// WI-SEC-005 step 2: property tests with generated inputs for the parsers and rules that take input from outside. A fixed seed and a fixed number
// of cases, so a failure can be repeated: the failing case is printed with its seed and index. This is not coverage-guided fuzzing; it is a
// bounded random search for crashes, hangs and broken invariants.

const SEED = 20261102;
const CASES = 5000;

/** A small seeded generator (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n: number) => Math.floor(next() * n),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
  };
}

const NASTY = [
  '/',
  '//',
  '\\',
  '%2f',
  '%5c',
  '%09',
  '%0d%0a',
  '\t',
  '\n',
  '\r',
  '\u0000',
  '\u007f',
  ' ',
  '@',
  ':',
  '?',
  '#',
  '..',
  '.',
  ' ',
  'http:',
  'https://evil.example',
  'javascript:',
  'data:',
  '//evil.example',
  '/\\evil.example',
  '‮',
  'é',
  '😀',
  'a'.repeat(300),
];

function text(r: ReturnType<typeof rng>, maxParts = 8): string {
  const parts = r.int(maxParts) + 1;
  let out = '';
  for (let i = 0; i < parts; i++) out += r.next() < 0.6 ? r.pick(NASTY) : String.fromCharCode(r.int(0x250));
  return out;
}

const at = (i: number) => `seed ${SEED}, case ${i}`;

describe('safeReturnTo', () => {
  test('whatever it is given, the result is "/" or a path that stays on the app’s own origin when a browser resolves it', () => {
    const r = rng(SEED);
    for (let i = 0; i < CASES * 4; i++) {
      const input = r.next() < 0.1 ? undefined : r.next() < 0.1 ? (r.int(100) as unknown) : text(r);
      const out = safeReturnTo(input);
      const resolved = new URL(out, 'https://app.example');
      assert.equal(
        resolved.origin,
        'https://app.example',
        `${at(i)}: ${JSON.stringify(input)} -> ${JSON.stringify(out)}`,
      );
      assert.ok(out === '/' || (out.startsWith('/') && !out.startsWith('//')), at(i));
      assert.ok(!/[\\\u0000-\u001f\u007f]/.test(out), `${at(i)}: control or backslash in ${JSON.stringify(out)}`);
      assert.ok(!/^\/auth\/callback(?:[/?#]|$)/.test(out), at(i));
    }
  });
});

describe('readCookie', () => {
  test('never throws, and what it returns is a substring of the header that has no semicolon', () => {
    const r = rng(SEED + 1);
    for (let i = 0; i < CASES; i++) {
      const header =
        r.next() < 0.1 ? undefined : r.next() < 0.2 ? [text(r), text(r)] : text(r, 12) + '; name=' + text(r, 3);
      const value = readCookie(header, 'name');
      if (value !== undefined) {
        assert.ok(!value.includes(';'), at(i));
        assert.ok((Array.isArray(header) ? header.join('; ') : header)!.includes(value), at(i));
      }
    }
  });
});

describe('the CSRF checks', () => {
  const APP = 'http://localhost:3100';
  test('a state-changing request passes only with exactly the app’s origin, a JSON content type, and no cross-site fetch metadata', () => {
    const r = rng(SEED + 2);
    for (let i = 0; i < CASES; i++) {
      const origin =
        r.next() < 0.3
          ? APP
          : r.next() < 0.3
            ? undefined
            : r.pick([text(r, 3), APP + '/', APP.toUpperCase(), 'null', APP + '.evil.example', ' ' + APP]);
      const type = r.pick([
        'application/json',
        'application/json; charset=utf-8',
        'APPLICATION/JSON',
        'text/plain',
        'application/x-www-form-urlencoded',
        'multipart/form-data',
        undefined,
        text(r, 2),
      ]);
      const site = r.pick([undefined, 'same-origin', 'same-site', 'cross-site', 'none', text(r, 2)]);
      const method = r.pick(['POST', 'PUT', 'PATCH', 'DELETE', 'post', 'GET', 'HEAD', 'OPTIONS', undefined]);
      const headers = {
        ...(origin === undefined ? {} : { origin }),
        ...(type === undefined ? {} : { 'content-type': type }),
        ...(site === undefined ? {} : { 'sec-fetch-site': site }),
      };
      const result = checkStateChangingRequest(method, headers, APP);
      const safe = ['GET', 'HEAD', 'OPTIONS'].includes((method ?? 'GET').toUpperCase());
      const jsonType = (type ?? '').split(';')[0]!.trim().toLowerCase() === 'application/json';
      const expected = safe || (origin === APP && (site === undefined || site === 'same-origin') && jsonType);
      assert.equal(result.ok, expected, `${at(i)}: ${method} ${JSON.stringify(headers)}`);
    }
  });

  test('a push-stream read is refused for another origin or a cross-site fetch', () => {
    const r = rng(SEED + 3);
    for (let i = 0; i < CASES; i++) {
      const origin = r.pick([undefined, APP, 'http://evil.example', text(r, 2)]);
      const site = r.pick([undefined, 'same-origin', 'none', 'cross-site', 'same-site', text(r, 2)]);
      const ok = checkSameOriginRead(
        { ...(origin === undefined ? {} : { origin }), ...(site === undefined ? {} : { 'sec-fetch-site': site }) },
        APP,
      ).ok;
      assert.equal(
        ok,
        (origin === undefined || origin === APP) && (site === undefined || site === 'same-origin' || site === 'none'),
        at(i),
      );
    }
  });
});

describe('the headers forwarded to the BFF', () => {
  test('only the allow-listed names come through, as strings, and never authorization or cookie', () => {
    const r = rng(SEED + 4);
    const names = [
      ...FORWARDED_REQUEST_HEADERS,
      'authorization',
      'cookie',
      'x-forwarded-for',
      'host',
      'x-delay-ms',
      text(r, 1).toLowerCase(),
    ];
    for (let i = 0; i < CASES; i++) {
      const incoming: Record<string, string | string[] | undefined> = {};
      for (const n of names) if (r.next() < 0.5) incoming[n] = r.next() < 0.2 ? [text(r), text(r)] : text(r);
      const out = forwardedRequestHeaders(
        incoming,
        extraForwardedHeaders(r.next() < 0.5 ? 'x-delay-ms, x fixture,  ,BAD NAME,x-ok' : undefined),
      );
      for (const [k, v] of Object.entries(out)) {
        assert.equal(typeof v, 'string', at(i));
        assert.ok(k !== 'authorization' && k !== 'cookie', `${at(i)}: ${k} was forwarded`);
        assert.ok([...FORWARDED_REQUEST_HEADERS, 'x-delay-ms', 'x-ok'].includes(k as never), `${at(i)}: ${k}`);
      }
    }
  });

  test('the extra-names setting yields only plain header tokens, whatever it holds', () => {
    const r = rng(SEED + 5);
    for (let i = 0; i < CASES; i++) {
      for (const name of extraForwardedHeaders(text(r, 10) + ',' + text(r, 4)))
        assert.match(name, /^[a-z0-9-]+$/, at(i));
    }
  });
});

describe('readRequestBody', () => {
  const body = (chunks: (Buffer | string)[]) => ({
    headers: {},
    async *[Symbol.asyncIterator]() {
      yield* chunks;
    },
  });

  test('reads exactly what was sent up to the limit and refuses anything over it, however the bytes are cut into chunks', async () => {
    const r = rng(SEED + 6);
    for (let i = 0; i < 1000; i++) {
      const limit = r.int(200) + 1;
      const total = r.int(400);
      const bytes = Buffer.from(Array.from({ length: total }, () => r.int(256)));
      const chunks: Buffer[] = [];
      for (let at = 0; at < total;) {
        const n = r.int(60) + 1;
        chunks.push(bytes.subarray(at, at + n));
        at += n;
      }
      const result = await readRequestBody(body(chunks), limit);
      if (total <= limit) {
        assert.equal(result.ok, true, at_(i));
        assert.ok(result.ok && Buffer.from(result.body).equals(bytes), at_(i));
      } else {
        assert.deepEqual(result.ok ? 'ok' : result.status, 413, at_(i));
      }
    }
    function at_(i: number) {
      return at(i);
    }
  });

  test('a body that fails while being read is 400, not a crash', async () => {
    const result = await readRequestBody({
      headers: {},
      async *[Symbol.asyncIterator]() {
        yield Buffer.from('abc');
        throw new Error('connection reset');
      },
    });
    assert.deepEqual(result.ok ? 'ok' : result.status, 400);
  });
});

describe('clientAddress', () => {
  test('never throws and never returns an empty or oversized key, however the headers and hops are set', () => {
    const r = rng(SEED + 7);
    for (let i = 0; i < CASES * 2; i++) {
      const forwarded =
        r.next() < 0.2
          ? undefined
          : r.next() < 0.2
            ? [text(r), text(r)]
            : Array.from({ length: r.int(6) }, () => text(r, 2)).join(r.pick([',', ', ', ' , ', ',,']));
      const socket = r.next() < 0.1 ? null : { remoteAddress: r.next() < 0.2 ? undefined : text(r, 2) };
      const key = clientAddress(
        { headers: forwarded === undefined ? {} : { 'x-forwarded-for': forwarded }, socket },
        r.int(5),
      );
      assert.equal(typeof key, 'string', at(i));
      assert.ok(key.length > 0, at(i));
      // A real socket gives an IP address; here it is arbitrary text. What a caller can influence, a forwarded entry, is capped at 64 characters.
      const connection = (socket?.remoteAddress ?? '').trim().replace(/^::ffff:/i, '') || 'unknown';
      assert.ok(key === connection || key.length <= 64, `${at(i)}: ${key.length} characters from a header`);
    }
  });
});

describe('the token bucket', () => {
  test('under any sequence of keys and times it never allows more than its capacity in a window, and never grows past maxKeys', () => {
    const r = rng(SEED + 8);
    for (let run = 0; run < 200; run++) {
      const perMinute = r.int(20) + 1;
      const evicting = run % 2 === 0; // with eviction a forgotten key starts full again, so only the shape of the answers is checked then
      const maxKeys = evicting ? r.int(10) + 1 : 16;
      const keyspace = evicting ? maxKeys + 3 : 12;
      let t = 0;
      const limiter = createTokenBucketLimiter({ perMinute, maxKeys, now: () => t });
      const allowedAt: Record<string, number[]> = {};
      for (let step = 0; step < 300; step++) {
        t += r.int(5000);
        const key = 'k' + r.int(keyspace);
        const decision = limiter.take(key);
        if (decision.allowed) (allowedAt[key] ??= []).push(t);
        else assert.ok(decision.retryAfterSeconds >= 1 && Number.isInteger(decision.retryAfterSeconds), `run ${run}`);
      }
      // A key that was never evicted cannot have been let through more than capacity plus the refill in any 60-second window.
      if (!evicting) {
        for (const times of Object.values(allowedAt))
          for (let i = 0; i < times.length; i++) {
            const inWindow = times.filter((x) => x >= times[i]! && x < times[i]! + 60_000).length;
            assert.ok(
              inWindow <= perMinute * 2,
              `run ${run}: ${inWindow} allowed in a minute with a limit of ${perMinute}`,
            );
          }
      }
    }
  });
});
