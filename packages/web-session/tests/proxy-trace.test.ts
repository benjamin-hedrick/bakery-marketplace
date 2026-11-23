import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { proxyGraphql } from '../src/graphql-proxy.ts';
import type { ProxyRequest, ProxyResponse } from '../src/graphql-proxy.ts';
import { proxyTraceparent, startProxySpan } from '../src/trace.ts';

// WI-OBS-001: the web server's span for a call it relays to the BFF.

const TARGET = 'http://bff.internal:4100/graphql';
const COLLECTOR = 'http://collector.internal';
const TRACE = '0af7651916cd43dd8448eb211c80319c';
const CALLER_SPAN = 'b7ad6b7169203331';

function request(headers: Record<string, string>, body = '{"query":"{ secret }"}'): ProxyRequest {
  return {
    method: 'POST',
    headers,
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(body);
    },
  };
}

function response(): { res: ProxyResponse; status: () => number } {
  let code = 0;
  return {
    res: { status: (c) => void (code = c), setHeader: () => {}, send: () => {}, json: () => {} },
    status: () => code,
  };
}

/** A fetch that answers the BFF call with `bffStatus` (or fails) and records every call, the BFF's and the collector's. */
function recorder(bffStatus: number | 'unreachable') {
  const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: (init.headers ?? {}) as Record<string, string>, body: String(init.body ?? '') });
    if (url === TARGET && bffStatus === 'unreachable') throw new Error('down');
    return new Response('{}', { status: url === TARGET ? (bffStatus as number) : 200 });
  }) as unknown as typeof fetch;
  return {
    fetchImpl,
    bff: () => calls.find((c) => c.url === TARGET),
    spans: () =>
      calls
        .filter((c) => c.url === `${COLLECTOR}/v1/traces`)
        .map((c) => JSON.parse(c.body).resourceSpans[0].scopeSpans[0].spans[0]),
    raw: () => calls.filter((c) => c.url === `${COLLECTOR}/v1/traces`).map((c) => c.body),
  };
}

const tracing = { endpoint: COLLECTOR, serviceName: 'web-customer' };

describe('the web server span for a relayed call', () => {
  test("a call with the caller's traceparent keeps the trace id, is a child of the caller's span, and is the BFF's parent", async () => {
    const r = recorder(200);
    await proxyGraphql(
      request({ traceparent: `00-${TRACE}-${CALLER_SPAN}-01` }),
      response().res,
      TARGET,
      [],
      r.fetchImpl,
      undefined,
      undefined,
      tracing,
    );
    const [span] = r.spans();
    assert.equal(span.traceId, TRACE);
    assert.equal(span.parentSpanId, CALLER_SPAN);
    assert.equal(span.kind, 2);
    assert.equal(span.name, 'POST /api/graphql');
    // The BFF is sent this span as its parent, in the same trace.
    assert.equal(r.bff()?.headers['traceparent'], `00-${TRACE}-${span.spanId}-01`);
  });

  test('a call with no traceparent starts a new trace with no parent, and the BFF is sent it', async () => {
    const r = recorder(200);
    await proxyGraphql(request({}), response().res, TARGET, [], r.fetchImpl, undefined, undefined, tracing);
    const [span] = r.spans();
    assert.match(span.traceId, /^[0-9a-f]{32}$/);
    assert.equal(span.parentSpanId, undefined);
    assert.equal(r.bff()?.headers['traceparent'], `00-${span.traceId}-${span.spanId}-01`);
  });

  test('a malformed or all-zero traceparent is not continued', () => {
    for (const bad of [
      'garbage',
      `00-${'0'.repeat(32)}-${CALLER_SPAN}-01`,
      `00-${TRACE}-${'0'.repeat(16)}-01`,
      undefined,
    ]) {
      const span = startProxySpan(bad);
      assert.notEqual(span.traceId, TRACE);
      assert.equal(span.parentSpanId, undefined);
      assert.match(proxyTraceparent(span), /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    }
  });

  test('the span carries the status code, marks a 5xx as failed, and leaves the query, the body and the headers out', async () => {
    const ok = recorder(200);
    await proxyGraphql(
      request({ authorization: 'Bearer secret-token', cookie: 'session=s' }),
      response().res,
      TARGET,
      [],
      ok.fetchImpl,
      'secret-token',
      '203.0.113.9',
      tracing,
    );
    assert.equal(ok.spans()[0].status.code, 0);
    assert.deepEqual(ok.spans()[0].attributes[2], { key: 'http.response.status_code', value: { intValue: '200' } });
    const bad = recorder(503);
    await proxyGraphql(request({}), response().res, TARGET, [], bad.fetchImpl, undefined, undefined, tracing);
    assert.equal(bad.spans()[0].status.code, 2);
    for (const text of [...ok.raw(), ...bad.raw()]) {
      assert.doesNotMatch(text, /secret|token|session=|Bearer|203\.0\.113\.9|"query"/i);
    }
  });

  test('an unreachable BFF is a failed span with status 502, and the answer is still 502', async () => {
    const r = recorder('unreachable');
    const out = response();
    await proxyGraphql(request({}), out.res, TARGET, [], r.fetchImpl, undefined, undefined, tracing);
    assert.equal(out.status(), 502);
    assert.equal(r.spans()[0].status.code, 2);
    assert.deepEqual(r.spans()[0].attributes[2], { key: 'http.response.status_code', value: { intValue: '502' } });
  });

  test('with no endpoint, or no tracing, no span is sent and the caller traceparent is forwarded as it came', async () => {
    for (const t of [
      undefined,
      { endpoint: undefined, serviceName: 'web-customer' },
      { endpoint: '  ', serviceName: 'x' },
    ]) {
      const r = recorder(200);
      const incoming = `00-${TRACE}-${CALLER_SPAN}-01`;
      await proxyGraphql(
        request({ traceparent: incoming }),
        response().res,
        TARGET,
        [],
        r.fetchImpl,
        undefined,
        undefined,
        t,
      );
      assert.equal(r.spans().length, 0);
      assert.equal(r.bff()?.headers['traceparent'], incoming);
    }
  });

  test('a collector that cannot be reached does not fail the call', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      if (url !== TARGET) throw new Error('collector down');
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const out = response();
    await proxyGraphql(request({}), out.res, TARGET, [], fetchImpl, undefined, undefined, tracing);
    assert.equal(out.status(), 200);
    assert.ok(calls.includes(`${COLLECTOR}/v1/traces`));
  });
});
