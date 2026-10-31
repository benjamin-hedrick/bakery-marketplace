// The browser talks to the GraphQL BFF through the web app's own origin, at /api/graphql (ADR-0013: the BFF is the only API entry point, and
// there is no cross-origin call). The BFF address is read from GRAPHQL_URL on every request, so one built image serves every environment
// (ADR-0020, register item 101). A rewrite in next.config.js could not do this: Next.js stores its destination in the build.
import type { IncomingHttpHeaders } from 'node:http';

// Only these request headers reach the BFF: no cookies and no forwarding chain. A rewrite forwarded every header, so a header the BFF starts
// to read must be added here.
export const FORWARDED_REQUEST_HEADERS = [
  'content-type',
  'accept',
  'authorization',
  'traceparent',
  'tracestate',
  'baggage',
] as const;

/**
 * More header names to forward, from GRAPHQL_EXTRA_FORWARDED_HEADERS (comma-separated). For tests only: the D-10 declined-payment hook
 * (x-test-payment) and the mock BFF's x-fixture, x-delay-ms and x-place-order. Empty in a deployed environment. A name that is not a plain
 * header token is ignored, so the setting cannot be used to smuggle a value into another header.
 */
export function extraForwardedHeaders(setting: string | undefined): string[] {
  return (setting ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => /^[a-z0-9-]+$/.test(name));
}

// Headers of the upstream response that describe its own connection or encoding; the body is re-sent in full, so they would be wrong.
const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-length',
  'content-encoding',
  'upgrade',
]);

export function forwardedRequestHeaders(
  incoming: IncomingHttpHeaders,
  extra: readonly string[] = [],
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const name of [...FORWARDED_REQUEST_HEADERS, ...extra]) {
    const value = incoming[name];
    if (typeof value === 'string') headers[name] = value;
  }
  return headers;
}

/** The slice of a Node request and response that the proxy uses (Next.js's API request and response satisfy it). */
export interface ProxyRequest extends AsyncIterable<unknown> {
  method?: string | undefined;
  headers: IncomingHttpHeaders;
}
export interface ProxyResponse {
  status(code: number): unknown;
  setHeader(name: string, value: string): unknown;
  send(body: Buffer): unknown;
  json(body: unknown): unknown;
}

async function readBody(req: ProxyRequest): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  return new Uint8Array(Buffer.concat(chunks));
}

/**
 * Sends the request to `target` and relays the answer. With no target it answers 502 and calls nothing. If the BFF cannot be reached it answers 502
 * with a fixed message: the address, and the reason the call failed, stay out of what the browser receives.
 */
export async function proxyGraphql(
  req: ProxyRequest,
  res: ProxyResponse,
  target: string | undefined,
  extraHeaders: readonly string[] = [],
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!target) {
    res.status(502);
    res.json({ error: 'The GraphQL service is not configured' });
    return;
  }
  try {
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const upstream = await fetchImpl(target, {
      method: req.method ?? 'POST',
      headers: forwardedRequestHeaders(req.headers, extraHeaders),
      ...(hasBody ? { body: await readBody(req) } : {}),
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status);
    upstream.headers.forEach((value, name) => {
      if (!HOP_BY_HOP_RESPONSE_HEADERS.has(name)) res.setHeader(name, value);
    });
    res.send(body);
  } catch {
    res.status(502);
    res.json({ error: 'The GraphQL service could not be reached' });
  }
}
