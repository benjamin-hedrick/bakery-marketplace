// Minimal OTLP/HTTP (JSON) trace exporter (ADR-0016, WI-PORT-005). The BFF already owns its W3C trace context (trace.ts),
// so it exports its one server span per request directly instead of pulling in the Node SDK and its ESM loader hooks.
// Export is best effort: it never delays a response and its failures are swallowed. Nothing but the fields below is sent:
// no query text, no variables, no headers, no tokens.
import type { TraceContext } from './trace.ts';

export interface SpanRecord {
  trace: TraceContext;
  /** Operation name as sent by the client; reduced to a short identifier before export. */
  operationName: string | undefined;
  statusCode: number;
  failed: boolean;
  startedAtMs: number;
  durationMs: number;
}

export type SpanExporter = (span: SpanRecord) => void;

export const noExport: SpanExporter = () => {};

const safeName = (s: string | undefined) => (s && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(s) ? s : undefined);
const str = (key: string, value: string) => ({ key, value: { stringValue: value } });
const int = (key: string, value: number) => ({ key, value: { intValue: String(value) } });

export function toOtlpPayload(span: SpanRecord, serviceName: string) {
  const start = BigInt(Math.round(span.startedAtMs)) * 1_000_000n;
  const end = start + BigInt(Math.round(span.durationMs * 1000)) * 1000n;
  const operation = safeName(span.operationName);
  return {
    resourceSpans: [
      {
        resource: { attributes: [str('service.name', serviceName)] },
        scopeSpans: [
          {
            scope: { name: 'bakery.graphql-bff' },
            spans: [
              {
                traceId: span.trace.traceId,
                spanId: span.trace.spanId,
                ...(span.trace.parentSpanId ? { parentSpanId: span.trace.parentSpanId } : {}),
                name: 'POST /graphql',
                kind: 2, // SERVER
                startTimeUnixNano: start.toString(),
                endTimeUnixNano: end.toString(),
                attributes: [
                  str('http.request.method', 'POST'),
                  str('url.path', '/graphql'),
                  int('http.response.status_code', span.statusCode),
                  ...(operation ? [str('graphql.operation.name', operation)] : []),
                ],
                status: span.failed ? { code: 2 } : { code: 0 },
              },
            ],
          },
        ],
      },
    ],
  };
}

/** Exports to `${endpoint}/v1/traces`; with no endpoint configured, exports nothing. */
export function createOtlpExporter(
  endpoint: string | undefined,
  serviceName = 'graphql-bff',
  fetchImpl: typeof fetch = fetch,
): SpanExporter {
  if (!endpoint?.trim()) return noExport;
  const url = `${endpoint.trim().replace(/\/+$/, '')}/v1/traces`;
  return (span) => {
    fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(toOtlpPayload(span, serviceName)),
      signal: AbortSignal.timeout(2000),
    }).catch(() => {});
  };
}
