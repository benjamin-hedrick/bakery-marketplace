// Minimal OTLP/HTTP (JSON) span export for the Next.js server (ADR-0016, WI-PORT-005). SERVER ONLY: createServerEnvironment is
// the only caller. It mirrors services/graphql-bff/src/otlp.ts (open item 36: adopt the OpenTelemetry Node SDK in both, or
// accept this). Best effort: it never delays or fails a render. Only ids, timing and the fixed attributes below are sent:
// no query text, no variables, no headers, no cookies.

export interface ClientSpan {
  traceId: string;
  spanId: string;
  startedAtMs: number;
  durationMs: number;
  statusCode: number | undefined;
  failed: boolean;
}

const str = (key: string, value: string) => ({ key, value: { stringValue: value } });

export function exportClientSpan(endpoint: string | undefined, span: ClientSpan): void {
  if (!endpoint?.trim()) return;
  const start = BigInt(Math.round(span.startedAtMs)) * 1_000_000n;
  const end = start + BigInt(Math.round(span.durationMs * 1000)) * 1000n;
  const body = {
    resourceSpans: [
      {
        resource: { attributes: [str('service.name', 'web-customer')] },
        scopeSpans: [
          {
            scope: { name: 'bakery.web-customer' },
            spans: [
              {
                traceId: span.traceId,
                spanId: span.spanId,
                name: 'POST graphql (BFF)',
                kind: 3, // CLIENT; this is the root of the trace, a browser traceparent is never adopted (ADR-0016 item 3)
                startTimeUnixNano: start.toString(),
                endTimeUnixNano: end.toString(),
                attributes: [
                  str('http.request.method', 'POST'),
                  ...(span.statusCode
                    ? [{ key: 'http.response.status_code', value: { intValue: String(span.statusCode) } }]
                    : []),
                ],
                status: span.failed ? { code: 2 } : { code: 0 },
              },
            ],
          },
        ],
      },
    ],
  };
  fetch(`${endpoint.trim().replace(/\/+$/, '')}/v1/traces`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(2000),
  }).catch(() => {});
}
