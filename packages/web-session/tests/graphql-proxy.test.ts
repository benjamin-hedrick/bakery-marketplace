import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FORWARDED_REQUEST_HEADERS,
  extraForwardedHeaders,
  forwardedRequestHeaders,
  proxyGraphql,
} from '../src/graphql-proxy.ts';
import type { ProxyRequest, ProxyResponse } from '../src/graphql-proxy.ts';

function request(method: string, headers: Record<string, string>, body = ''): ProxyRequest {
  return {
    method,
    headers,
    async *[Symbol.asyncIterator]() {
      if (body) yield Buffer.from(body);
    },
  };
}

function response() {
  const out = {
    status: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    json: undefined as unknown,
  };
  const res: ProxyResponse = {
    status: (code) => void (out.status = code),
    setHeader: (name, value) => void (out.headers[name] = value),
    send: (body) => void (out.body = body),
    json: (body) => void (out.json = body),
  };
  return { res, out };
}

type Call = { url: string; init: RequestInit };
function fakeFetch(answer: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return answer();
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const TARGET = 'http://bff.internal:4100/graphql';

describe('the GraphQL proxy', () => {
  test('sends the body and only the allowed headers to the address it is given at run time', async () => {
    const { calls, fetchImpl } = fakeFetch(() => new Response('{"data":{}}', { status: 200 }));
    const { res } = response();
    const req = request(
      'POST',
      {
        'content-type': 'application/json',
        authorization: 'Bearer abc',
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
        cookie: 'session=secret',
        'x-forwarded-for': '203.0.113.9',
        host: 'shop.example',
      },
      '{"query":"{a}"}',
    );

    await proxyGraphql(req, res, TARGET, [], fetchImpl);

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, TARGET);
    assert.equal(calls[0]!.init.method, 'POST');
    assert.deepEqual(calls[0]!.init.headers, {
      'content-type': 'application/json',
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
    }); // the browser's own authorization header is not forwarded
    assert.equal(Buffer.from(calls[0]!.init.body as Uint8Array).toString(), '{"query":"{a}"}');
  });

  test('a different address on the next call goes to that address (the setting is not captured)', async () => {
    const { calls, fetchImpl } = fakeFetch(() => new Response('{}'));
    await proxyGraphql(request('POST', {}, '{}'), response().res, 'http://one/graphql', [], fetchImpl);
    await proxyGraphql(request('POST', {}, '{}'), response().res, 'http://two/graphql', [], fetchImpl);
    assert.deepEqual(
      calls.map((c) => c.url),
      ['http://one/graphql', 'http://two/graphql'],
    );
  });

  test('relays status, body and the BFF headers (trace id, no-store) but not its connection headers', async () => {
    const upstream = new Response('{"errors":[{"message":"no"}]}', {
      status: 400,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'private, no-store',
        'x-correlation-id': 'abc123',
        traceparent: '00-abc-def-01',
        connection: 'keep-alive',
        'keep-alive': 'timeout=5',
      },
    });
    const { fetchImpl } = fakeFetch(() => upstream);
    const { res, out } = response();

    await proxyGraphql(request('POST', {}, '{}'), res, TARGET, [], fetchImpl);

    assert.equal(out.status, 400);
    assert.equal(Buffer.from(out.body as Buffer).toString(), '{"errors":[{"message":"no"}]}');
    assert.equal(out.headers['cache-control'], 'private, no-store');
    assert.equal(out.headers['x-correlation-id'], 'abc123');
    assert.equal(out.headers['traceparent'], '00-abc-def-01');
    assert.equal(out.headers['connection'], undefined);
    assert.equal(out.headers['keep-alive'], undefined);
  });

  test('a GET sends no body', async () => {
    const { calls, fetchImpl } = fakeFetch(() => new Response('{}'));
    await proxyGraphql(request('GET', {}), response().res, TARGET, [], fetchImpl);
    assert.equal('body' in calls[0]!.init, false);
  });

  test('with no address it answers 502 and calls nothing', async () => {
    const { calls, fetchImpl } = fakeFetch(() => new Response('{}'));
    for (const target of [undefined, '']) {
      const { res, out } = response();
      await proxyGraphql(request('POST', {}, '{}'), res, target, [], fetchImpl);
      assert.equal(out.status, 502);
      assert.deepEqual(out.json, { error: 'The GraphQL service is not configured' });
    }
    assert.equal(calls.length, 0);
  });

  test('when the BFF cannot be reached it answers 502 with a fixed message that names neither the address nor the reason', async () => {
    const { res, out } = response();
    const failing = (async () => {
      throw new TypeError(`connect ECONNREFUSED ${TARGET}`);
    }) as unknown as typeof fetch;

    await proxyGraphql(request('POST', {}, '{}'), res, TARGET, [], failing);

    assert.equal(out.status, 502);
    assert.deepEqual(out.json, { error: 'The GraphQL service could not be reached' });
    assert.ok(!JSON.stringify(out.json).includes('bff.internal'));
  });

  test('a header named in the extra list is forwarded too, and only when named', async () => {
    const { calls, fetchImpl } = fakeFetch(() => new Response('{}'));
    const headers = { 'x-test-payment': 'decline', 'x-fixture': 'B', cookie: 'a=b' };

    await proxyGraphql(request('POST', headers, '{}'), response().res, TARGET, [], fetchImpl);
    await proxyGraphql(
      request('POST', headers, '{}'),
      response().res,
      TARGET,
      ['x-test-payment', 'x-fixture'],
      fetchImpl,
    );

    assert.deepEqual(calls[0]!.init.headers, {});
    assert.deepEqual(calls[1]!.init.headers, { 'x-test-payment': 'decline', 'x-fixture': 'B' });
  });

  test('the extra list is read from a comma-separated setting; anything that is not a plain header name is ignored', () => {
    assert.deepEqual(extraForwardedHeaders(undefined), []);
    assert.deepEqual(extraForwardedHeaders(''), []);
    assert.deepEqual(extraForwardedHeaders(' X-Fixture, x-delay-ms ,,x-place-order'), [
      'x-fixture',
      'x-delay-ms',
      'x-place-order',
    ]);
    assert.deepEqual(extraForwardedHeaders('bad name,evil:header,ok-1,new\nline'), ['ok-1']);
  });

  test('the fixed list has no cookie, host or forwarding header and no test hook', () => {
    for (const bad of ['cookie', 'host', 'x-forwarded-for', 'x-forwarded-host', 'forwarded', 'x-test-payment']) {
      assert.ok(!(FORWARDED_REQUEST_HEADERS as readonly string[]).includes(bad), bad);
    }
    assert.deepEqual(
      forwardedRequestHeaders({ 'x-test-payment': 'decline', cookie: 'a=b', authorization: 'Bearer t' }),
      {},
    );
  });

  test('the bearer header is the session token it is given, replacing any the browser sent, and absent when there is none', async () => {
    const { calls, fetchImpl } = fakeFetch(() => new Response('{}'));
    const headers = { 'content-type': 'application/json', authorization: 'Bearer forged-by-the-browser' };

    await proxyGraphql(request('POST', headers, '{}'), response().res, TARGET, [], fetchImpl, 'session-token');
    await proxyGraphql(request('POST', headers, '{}'), response().res, TARGET, [], fetchImpl);

    assert.equal((calls[0]!.init.headers as Record<string, string>)['authorization'], 'Bearer session-token');
    assert.equal((calls[1]!.init.headers as Record<string, string>)['authorization'], undefined);
  });
});
