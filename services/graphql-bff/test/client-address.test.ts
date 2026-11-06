import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { loadConfig } from '../src/config.ts';
import { NO_TRUSTED_SOURCES, rateKey, trustedSourcesFromEnv } from '../src/rate-limit.ts';
import { createServer } from '../src/server.ts';

// Register 137: the web app names the client in X-Bakery-Client-Address; the BFF believes it only from a trusted source and counts per client.

describe('the trusted sources setting', () => {
  test('unset or empty trusts nobody; addresses and IPv4 ranges match; IPv4 inside IPv6 matches', () => {
    assert.equal(trustedSourcesFromEnv({})('127.0.0.1'), false);
    assert.equal(trustedSourcesFromEnv({ BFF_TRUSTED_CLIENT_SOURCES: '  ' })('127.0.0.1'), false);
    const t = trustedSourcesFromEnv({ BFF_TRUSTED_CLIENT_SOURCES: '127.0.0.1, ::1, 10.20.0.0/16' });
    assert.deepEqual(['127.0.0.1', '::1', '10.20.3.4', '10.21.0.1', '192.0.2.1', 'unknown', ''].map(t), [
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  test('a bad entry stops the start naming the variable only', () => {
    for (const bad of ['web', '10.0.0.0/33', '10.0.0.0/x', '::1/64', '1.2.3.4/8/9', '127.0.0.1,,']) {
      assert.throws(
        () => loadConfig({ BFF_TRUSTED_CLIENT_SOURCES: bad }),
        (e: Error) => e.message.includes('BFF_TRUSTED_CLIENT_SOURCES') && !e.message.includes(bad),
        bad,
      );
    }
  });
});

describe('rateKey', () => {
  const trusted = trustedSourcesFromEnv({ BFF_TRUSTED_CLIENT_SOURCES: '10.0.0.5' });
  test('a trusted source with a single address in the header is counted as that client', () => {
    assert.equal(rateKey({ remoteAddress: '10.0.0.5' }, '203.0.113.9', trusted), 'client:203.0.113.9');
    assert.equal(rateKey({ remoteAddress: '::ffff:10.0.0.5' }, ' ::ffff:203.0.113.9 ', trusted), 'client:203.0.113.9');
    assert.equal(rateKey({ remoteAddress: '10.0.0.5' }, '2001:db8::1', trusted), 'client:2001:db8::1');
  });
  test('an untrusted source is counted by its own address, whatever it sends', () => {
    assert.equal(rateKey({ remoteAddress: '198.51.100.1' }, '203.0.113.9', trusted), '198.51.100.1');
    assert.equal(rateKey({ remoteAddress: '10.0.0.5' }, '203.0.113.9', NO_TRUSTED_SOURCES), '10.0.0.5');
  });
  test('a trusted source with no usable header is counted by its own address', () => {
    for (const header of [undefined, '', 'not-an-ip', '1.2.3.4, 5.6.7.8', ['1.2.3.4', '5.6.7.8']])
      assert.equal(rateKey({ remoteAddress: '10.0.0.5' }, header, trusted), '10.0.0.5');
  });
});

describe('/graphql counts per client for a trusted source and ignores the header from anyone else', () => {
  const reply = (res: http.ServerResponse) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ items: [], nextCursor: null }));
  };
  const downstream = http.createServer((_req, res) => reply(res));
  const servers: http.Server[] = [];
  let trustedUrl: string;
  let untrustedUrl: string;

  const start = async (trustedClientSources: ReturnType<typeof trustedSourcesFromEnv>) => {
    const port = (downstream.address() as AddressInfo).port;
    const bff = createServer(
      {
        port: 0,
        catalogUrl: `http://127.0.0.1:${port}`,
        orderingUrl: `http://127.0.0.1:${port}`,
        timeoutMs: 300,
        checkoutTimeoutMs: 300,
        testHooks: false,
        rateLimitPerMinute: 2,
        trustedClientSources,
      },
      { log: { info: () => {}, error: () => {} }, exporter: () => {} },
    );
    await new Promise<void>((r) => bff.listen(0, '127.0.0.1', r));
    servers.push(bff);
    return `http://127.0.0.1:${(bff.address() as AddressInfo).port}`;
  };
  before(async () => {
    await new Promise<void>((r) => downstream.listen(0, '127.0.0.1', r));
    trustedUrl = await start(trustedSourcesFromEnv({ BFF_TRUSTED_CLIENT_SOURCES: '127.0.0.1' }));
    untrustedUrl = await start(NO_TRUSTED_SOURCES);
  });
  after(() => {
    for (const s of servers) {
      s.closeAllConnections();
      s.close();
    }
    downstream.close();
  });

  const query = (url: string, client?: string) =>
    fetch(`${url}/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(client ? { 'x-bakery-client-address': client } : {}) },
      body: JSON.stringify({ query: '{ listings { edges { cursor } } }' }),
    }).then((r) => r.status);

  test('from a trusted source each client has its own allowance; one client using its allowance does not refuse another', async () => {
    assert.deepEqual([await query(trustedUrl, '203.0.113.1'), await query(trustedUrl, '203.0.113.1')], [200, 200]);
    assert.equal(await query(trustedUrl, '203.0.113.1'), 429); // the first client is out
    assert.deepEqual([await query(trustedUrl, '203.0.113.2'), await query(trustedUrl, '203.0.113.2')], [200, 200]);
    assert.equal(await query(trustedUrl, '203.0.113.2'), 429);
  });

  test('a trusted source that names no client (or a malformed one) shares the allowance of its own address', async () => {
    assert.deepEqual([await query(trustedUrl), await query(trustedUrl, 'not-an-ip')], [200, 200]);
    assert.equal(await query(trustedUrl), 429);
  });

  test('from an untrusted source the header is ignored: changing it does not give a new allowance', async () => {
    assert.deepEqual([await query(untrustedUrl, '203.0.113.1'), await query(untrustedUrl, '203.0.113.2')], [200, 200]);
    assert.equal(await query(untrustedUrl, '203.0.113.3'), 429);
    assert.equal(await query(untrustedUrl, '203.0.113.4'), 429);
  });
});
