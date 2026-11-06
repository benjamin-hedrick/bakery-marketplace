// The browser talks to the GraphQL BFF through the web app's own origin, at /api/graphql (ADR-0013: the BFF is the only API entry point, and
// there is no cross-origin call). The BFF address is read from GRAPHQL_URL on every request, so one built image serves every environment
// (ADR-0020, register item 101). A rewrite in next.config.js could not do this: Next.js stores its destination in the build.
import type { IncomingHttpHeaders, ServerResponse } from 'node:http';

// Only these request headers reach the BFF: no cookies and no forwarding chain. A rewrite forwarded every header, so a header the BFF starts
// to read must be added here. `authorization` is deliberately not here (ADR-0019): the browser holds no token and sends none; the bearer header
// the BFF receives is the one this server builds from the user's session, and a header the browser sends under that name is dropped.
export const FORWARDED_REQUEST_HEADERS = ['content-type', 'accept', 'traceparent', 'tracestate', 'baggage'] as const;

/**
 * More header names to forward, from GRAPHQL_EXTRA_FORWARDED_HEADERS (comma-separated). For tests only: the mock BFF's x-fixture, x-delay-ms and
 * x-place-order. Empty in a deployed environment. A name that is not a plain
 * header token is ignored, so the setting cannot be used to smuggle a value into another header.
 */
export function extraForwardedHeaders(setting: string | undefined): string[] {
  return (setting ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => /^[a-z0-9-]+$/.test(name) && name !== CLIENT_ADDRESS_HEADER);
}

/**
 * Register 137: the header in which this server tells the BFF which client the request is from. It is set here from the address this server counted
 * the browser by, never copied from the browser (it is not in {@link FORWARDED_REQUEST_HEADERS} and cannot be added to the extra names). The BFF
 * believes it only from this server's own address (`BFF_TRUSTED_CLIENT_SOURCES`).
 */
export const CLIENT_ADDRESS_HEADER = 'x-bakery-client-address';

function clientAddressHeader(address: string | undefined): Record<string, string> {
  return address && address !== 'unknown' ? { [CLIENT_ADDRESS_HEADER]: address } : {};
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

/** The slice of a response that a relayed stream needs: the JSON helpers above plus the Node members for writing in pieces. */
export type StreamResponse = ProxyResponse &
  Pick<
    ServerResponse,
    'write' | 'end' | 'once' | 'off' | 'flushHeaders' | 'headersSent' | 'destroyed' | 'writableEnded'
  >;

export interface StreamOptions {
  extraHeaders?: readonly string[];
  fetchImpl?: typeof fetch;
  /** The session's access token, sent as the bearer credential. */
  bearerToken: string;
  /** The address this server counted the browser by (register 137), sent in {@link CLIENT_ADDRESS_HEADER}. */
  clientAddress?: string | undefined;
  /** The largest request body accepted; a subscription request is a few hundred bytes. */
  maxBodyBytes?: number;
  /** How long to wait for the BFF to accept the stream. Once it is open it may live as long as the BFF keeps it. */
  connectTimeoutMs?: number;
  /**
   * The request body, already read by the caller (which reads it before it counts the stream against its limits, register item 126). When absent
   * it is read here, within `maxBodyBytes`.
   */
  body?: Uint8Array<ArrayBuffer>;
  /** Asked now and then while the stream is open; when it answers false the stream is ended (the session is over). See {@link KeepOpen}. */
  keepOpen?: KeepOpen;
}

/**
 * The check that keeps an open stream tied to its session. While it answers, it is asked every `everyMs` (with up to 10% added, so that many
 * streams do not ask together). When it fails (the session store cannot answer) it is asked less often each time, see {@link checkDelayMs}, and after
 * `maxFailures` failures in a row (default 3: about 70 seconds at the default interval) the stream is ended instead of left running unchecked. A
 * stream ended that way is opened again by the screen, which polls meanwhile; one successful check starts the count again.
 */
export interface KeepOpen {
  check: () => Promise<boolean>;
  everyMs: number;
  maxFailures?: number;
}

/** The wait before the next check: `everyMs` while checks work, then twice, four times and (at most) six times that after each failure in a row. */
export function checkDelayMs(everyMs: number, failures: number): number {
  return failures <= 0 ? everyMs : Math.min(everyMs * 2 ** failures, everyMs * 6);
}

/** Runs the checks of a {@link KeepOpen} until `onEnd` is called (the session is over or the checks keep failing). Returns the function that stops them. */
function watchSession(keepOpen: KeepOpen, onEnd: () => void): () => void {
  const maxFailures = keepOpen.maxFailures ?? 3;
  let failures = 0;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    timer = setTimeout(() => void run(), checkDelayMs(keepOpen.everyMs, failures) * (1 + Math.random() * 0.1));
  };
  const run = async () => {
    try {
      if (!(await keepOpen.check())) return onEnd();
      failures = 0;
    } catch {
      failures++;
      if (failures >= maxFailures) return onEnd();
    }
    if (!stopped) schedule();
  };
  schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/**
 * The largest request body either GraphQL route reads (register item 124). The framework's body parser is off on these routes so the proxy can send
 * the bytes on unchanged, which also means nothing else limits them. A query, a checkout or a subscription request is a few hundred bytes; the BFF
 * refuses more than this itself.
 */
export const MAX_REQUEST_BODY_BYTES = 64 * 1024;

class BodyTooLarge extends Error {}

async function readBodyWithin(req: ProxyRequest, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buffer.length;
    if (size > limit) throw new BodyTooLarge();
    chunks.push(buffer);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

/** Reads a request body of at most `limit` bytes: the bytes, or the status to answer with (413 too large, 400 unreadable). */
export async function readRequestBody(
  req: ProxyRequest,
  limit: number = MAX_REQUEST_BODY_BYTES,
): Promise<{ ok: true; body: Uint8Array<ArrayBuffer> } | { ok: false; status: 413 | 400; error: string }> {
  try {
    return { ok: true, body: await readBodyWithin(req, limit) };
  } catch (e) {
    return e instanceof BodyTooLarge
      ? { ok: false, status: 413, error: 'The request is too large' }
      : { ok: false, status: 400, error: 'The request could not be read' };
  }
}

/**
 * Relays a streamed answer from the BFF (a subscription over Server-Sent Events, ADR-0021) to the browser as it arrives. It differs from
 * {@link proxyGraphql} in what it must not do: it never waits for the body to end, never lets the answer be cached, compressed or buffered on
 * the way (`no-store, no-transform` and `X-Accel-Buffering: no`), and never outlives the browser's connection: when the browser goes, the call
 * to the BFF is aborted at once, which in turn frees the stream in ordering-service. The BFF address and the reason for a failure stay out of
 * what the browser receives.
 */
export async function proxyGraphqlStream(
  req: ProxyRequest,
  res: StreamResponse,
  target: string | undefined,
  options: StreamOptions,
): Promise<void> {
  if (!target) {
    res.status(502);
    res.json({ error: 'The GraphQL service is not configured' });
    return;
  }
  const {
    extraHeaders = [],
    fetchImpl = fetch,
    bearerToken,
    maxBodyBytes = MAX_REQUEST_BODY_BYTES,
    connectTimeoutMs = 10_000,
    keepOpen,
  } = options;

  let body = options.body;
  if (!body) {
    const read = await readRequestBody(req, maxBodyBytes);
    if (!read.ok) {
      res.status(read.status);
      res.json({ error: read.error });
      return;
    }
    body = read.body;
  }

  const controller = new AbortController();
  const browserGone = () => controller.abort();
  res.once('close', browserGone);
  const connecting = setTimeout(() => controller.abort(), connectTimeoutMs);
  let stopWatch: (() => void) | undefined;
  try {
    const upstream = await fetchImpl(target, {
      method: 'POST',
      headers: {
        ...forwardedRequestHeaders(req.headers, extraHeaders),
        ...clientAddressHeader(options.clientAddress),
        authorization: `Bearer ${bearerToken}`,
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(connecting);

    res.status(upstream.status);
    upstream.headers.forEach((value, name) => {
      if (!HOP_BY_HOP_RESPONSE_HEADERS.has(name) && name !== 'cache-control') res.setHeader(name, value);
    });
    res.setHeader('cache-control', 'no-store, no-transform');
    res.setHeader('x-accel-buffering', 'no');
    res.flushHeaders();

    if (keepOpen) stopWatch = watchSession(keepOpen, () => controller.abort());

    if (upstream.body) {
      const reader = upstream.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done || res.destroyed || res.writableEnded) break;
        if (!res.write(value))
          await new Promise<void>((resolve) => {
            res.once('drain', resolve);
            res.once('close', resolve);
          });
      }
    }
    if (!res.writableEnded) res.end();
  } catch {
    // Either the browser left or the session ended (aborted on purpose), or the BFF could not be reached or broke the stream.
    if (!res.writableEnded && !res.destroyed) {
      if (res.headersSent) res.end();
      else {
        res.status(502);
        res.json({ error: 'The GraphQL service could not be reached' });
      }
    }
  } finally {
    clearTimeout(connecting);
    stopWatch?.();
    res.off('close', browserGone);
    controller.abort(); // whatever ended it, the call to the BFF ends with it
  }
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
  /** The session's access token, to be sent as the bearer credential. Absent for an anonymous request. */
  bearerToken?: string,
  /** The address this server counted the browser by (register 137); the BFF counts the request against it when it trusts this server. */
  clientAddress?: string,
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
      headers: {
        ...forwardedRequestHeaders(req.headers, extraHeaders),
        ...clientAddressHeader(clientAddress),
        ...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {}),
      },
      ...(hasBody ? { body: await readBodyWithin(req, MAX_REQUEST_BODY_BYTES) } : {}),
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status);
    upstream.headers.forEach((value, name) => {
      if (!HOP_BY_HOP_RESPONSE_HEADERS.has(name)) res.setHeader(name, value);
    });
    res.send(body);
  } catch (e) {
    if (e instanceof BodyTooLarge) {
      res.status(413);
      res.json({ error: 'The request is too large' });
      return;
    }
    res.status(502);
    res.json({ error: 'The GraphQL service could not be reached' });
  }
}
