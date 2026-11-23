// The web server's span for a call it relays to the BFF (ADR-0016, WI-OBS-001). Minimal OTLP/HTTP (JSON), like the BFF's own exporter
// (services/graphql-bff/src/otlp.ts) and the page renderer's (apps/web-customer/src/lib/relay/otlp.ts); open item 36 is the choice between these
// and the OpenTelemetry Node SDK. Best effort: it never delays or fails a request. Only ids, timing, the method, the fixed route and the status code
// are sent: no query text, no variables, no headers, no cookies.

/** What the proxy needs to trace one call: where spans go (unset means none) and the service's name. */
export interface ProxyTracing {
  endpoint: string | undefined;
  serviceName: string;
}

export interface ProxySpan {
  traceId: string;
  spanId: string;
  /** The span id the caller sent, when the call continues a trace that began elsewhere (a test's or a client's `traceparent`). */
  parentSpanId: string | undefined;
  startedAtMs: number;
}

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/;

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Starts the span of a relayed call. A well-formed `traceparent` from the caller keeps its trace id (the BFF already continues it, and a chaos
 * rule may be aimed at it), with this span as its child; anything else starts a new trace. All-zero ids are not valid and start a new trace.
 */
export function startProxySpan(incomingTraceparent: string | undefined, now: () => number = Date.now): ProxySpan {
  const m = TRACEPARENT.exec(incomingTraceparent ?? '');
  const valid = m && !/^0+$/.test(m[1]!) && !/^0+$/.test(m[2]!);
  return {
    traceId: valid ? m[1]! : randomHex(16),
    spanId: randomHex(8),
    parentSpanId: valid ? m[2]! : undefined,
    startedAtMs: now(),
  };
}

/** The `traceparent` the BFF is sent: the same trace, this span as the parent. */
export function proxyTraceparent(span: ProxySpan): string {
  return `00-${span.traceId}-${span.spanId}-01`;
}

const str = (key: string, value: string) => ({ key, value: { stringValue: value } });

export function toProxyOtlpPayload(
  span: ProxySpan,
  serviceName: string,
  method: string,
  statusCode: number | undefined,
  failed: boolean,
  durationMs: number,
) {
  const start = BigInt(Math.round(span.startedAtMs)) * 1_000_000n;
  const end = start + BigInt(Math.round(durationMs * 1000)) * 1000n;
  return {
    resourceSpans: [
      {
        resource: { attributes: [str('service.name', serviceName)] },
        scopeSpans: [
          {
            scope: { name: 'bakery.web-session' },
            spans: [
              {
                traceId: span.traceId,
                spanId: span.spanId,
                ...(span.parentSpanId ? { parentSpanId: span.parentSpanId } : {}),
                name: `${method} /api/graphql`,
                kind: 2, // SERVER: the browser's call into this server; the call on to the BFF is its child in the BFF's own span
                startTimeUnixNano: start.toString(),
                endTimeUnixNano: end.toString(),
                attributes: [
                  str('http.request.method', method),
                  str('http.route', '/api/graphql'),
                  ...(statusCode
                    ? [{ key: 'http.response.status_code', value: { intValue: String(statusCode) } }]
                    : []),
                ],
                status: failed ? { code: 2 } : { code: 0 },
              },
            ],
          },
        ],
      },
    ],
  };
}

/** Sends the finished span. Does nothing without an endpoint; a failed send is ignored. */
export function exportProxySpan(
  tracing: ProxyTracing,
  span: ProxySpan,
  method: string,
  statusCode: number | undefined,
  failed: boolean,
  now: () => number = Date.now,
  send: typeof fetch = fetch,
): void {
  const endpoint = tracing.endpoint?.trim();
  if (!endpoint) return;
  const body = toProxyOtlpPayload(span, tracing.serviceName, method, statusCode, failed, now() - span.startedAtMs);
  send(`${endpoint.replace(/\/+$/, '')}/v1/traces`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(2000),
  }).catch(() => {});
}
