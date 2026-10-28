import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createOtlpExporter, toOtlpPayload, type SpanRecord } from '../src/otlp.ts';

const span: SpanRecord = {
  trace: {
    traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
    spanId: 'b7ad6b7169203331',
    parentSpanId: '00f067aa0ba902b7',
    flags: '01',
    continued: true,
  },
  operationName: 'Browse',
  statusCode: 200,
  failed: false,
  startedAtMs: 1_790_000_000_000,
  durationMs: 12.5,
};

describe('OTLP span export (ADR-0016)', () => {
  test('payload carries ids, parent, kind, timing and a sanitized operation name only', () => {
    const body = toOtlpPayload(span, 'graphql-bff');
    const s = body.resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
    assert.equal(s.traceId, span.trace.traceId);
    assert.equal(s.spanId, span.trace.spanId);
    assert.equal(s.parentSpanId, span.trace.parentSpanId);
    assert.equal(s.kind, 2);
    assert.equal(BigInt(s.endTimeUnixNano) - BigInt(s.startTimeUnixNano), 12_500_000n);
    assert.deepEqual(s.attributes.map((a) => a.key).sort(), [
      'graphql.operation.name',
      'http.request.method',
      'http.response.status_code',
      'url.path',
    ]);
    assert.equal(body.resourceSpans[0]!.resource.attributes[0]!.value.stringValue, 'graphql-bff');
  });

  test('a hostile or oversized operation name is dropped, and failure sets error status', () => {
    for (const bad of ['a b', 'x'.repeat(65), 'drop;table', '<script>', '1abc', '']) {
      const s = toOtlpPayload({ ...span, operationName: bad, failed: true }, 'graphql-bff').resourceSpans[0]!
        .scopeSpans[0]!.spans[0]!;
      assert.equal(
        s.attributes.some((a) => a.key === 'graphql.operation.name'),
        false,
        bad,
      );
      assert.deepEqual(s.status, { code: 2 });
    }
  });

  test('posts JSON to <endpoint>/v1/traces; no endpoint exports nothing; a dead collector is harmless', async () => {
    const calls: { url: string; body: string }[] = [];
    const fake = ((url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body) });
      return Promise.resolve(new Response(null, { status: 200 }));
    }) as unknown as typeof fetch;
    createOtlpExporter('http://localhost:4318/', 'graphql-bff', fake)(span);
    assert.equal(calls[0]!.url, 'http://localhost:4318/v1/traces');
    assert.ok(JSON.parse(calls[0]!.body).resourceSpans);

    createOtlpExporter(undefined, 'graphql-bff', fake)(span);
    createOtlpExporter('  ', 'graphql-bff', fake)(span);
    assert.equal(calls.length, 1);

    const dead = (() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch;
    createOtlpExporter('http://127.0.0.1:1', 'graphql-bff', dead)(span);
    await new Promise((r) => setTimeout(r, 10));
  });
});
