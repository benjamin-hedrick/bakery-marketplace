import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildSchema,
  execute,
  getOperationAST,
  parse,
  subscribe,
  validate,
  GraphQLError,
  type ExecutionResult,
} from 'graphql';
import { createHandler as createSseHandler } from 'graphql-sse/lib/use/http';
import type { Config } from './config.ts';
import { createCatalogClient, type CatalogClient } from './catalog-client.ts';
import { createOrderingClient, type OrderingClient } from './ordering-client.ts';
import { ClientError, DownstreamError, internalError } from './errors.ts';
import { rootValue, subscriptionRoot, type Context } from './resolvers.ts';
import { createOtlpExporter, type SpanExporter } from './otlp.ts';
import { connectionAddress, createTokenBucketLimiter, DEFAULT_PER_MINUTE } from './rate-limit.ts';
import { startTrace, toTraceparent } from './trace.ts';

const schema = buildSchema(readFileSync(fileURLToPath(new URL('../schema/schema.graphql', import.meta.url)), 'utf8'));
const MAX_BODY_BYTES = 64 * 1024;
const EVENT_STREAM = 'text/event-stream';

/** Per request: aborted when the caller's connection closes. The library hands onSubscribe the Node request, which is the key. */
const gone = new WeakMap<http.IncomingMessage, AbortSignal>();

/**
 * Requests whose subscription has been established (ordering accepted the stream). Their response starts with a comment line, so a screen can tell
 * an established subscription from a refusal, which also arrives as HTTP 200 with the error as its first event, without waiting for the first
 * change or the first ping (up to 12 seconds).
 */
const established = new WeakSet<http.IncomingMessage>();

// The field resolvers of both transports: a property of the source, called with (args, context) when it is a function.
const fieldResolver = (src: unknown, _args: unknown, context: unknown, info: { fieldName: string }) => {
  const v = (src as Record<string, unknown>)[info.fieldName];
  return typeof v === 'function' ? (v as (a: unknown, c: unknown) => unknown).call(src, _args, context) : v;
};
const typeResolver = (value: unknown) => (value as { __typename?: string }).__typename;

export interface Logger {
  info(entry: Record<string, unknown>): void;
  error(entry: Record<string, unknown>): void;
}
export const jsonLogger: Logger = {
  info: (e) => console.log(JSON.stringify({ level: 'info', ...e })),
  error: (e) => console.error(JSON.stringify({ level: 'error', ...e })),
};

export function createServer(
  config: Config,
  deps: { catalog?: CatalogClient; ordering?: OrderingClient; log?: Logger; exporter?: SpanExporter } = {},
): http.Server {
  const catalog = deps.catalog ?? createCatalogClient(config.catalogUrl, config.timeoutMs);
  const ordering =
    deps.ordering ??
    createOrderingClient(
      config.orderingUrl,
      config.timeoutMs,
      undefined,
      config.checkoutTimeoutMs,
      config.streamIdleMs,
    );
  const log = deps.log ?? jsonLogger;
  const exportSpan = deps.exporter ?? createOtlpExporter(config.otlpEndpoint);
  const maxStreams = config.maxStreams ?? 500;
  const limiter = createTokenBucketLimiter(config.rateLimitPerMinute ?? DEFAULT_PER_MINUTE);
  let openStreams = 0;
  // A place among the streams this instance holds is taken when a subscription is about to be established (its body has been read and it is a
  // valid subscription), not when the request arrives: the library reads the body first, so counting at arrival would let anyone who sends a body
  // slowly hold places and push real screens into polling.
  const places = new WeakMap<http.IncomingMessage, { held: boolean }>();

  // Live updates (ADR-0021, WI-QUE-003): the graphql-sse handler, in its "distinct connections" mode only. It is reached solely by a POST to
  // /graphql that asks for an event stream. Its single-connection mode (a PUT that registers a stream token) is switched off by
  // `authenticate` never returning a token, and the GET form is unreachable because the router below only passes POSTs.
  const sse = createSseHandler({
    schema,
    authenticate: () => undefined,
    onSubscribe: async (req, params) => {
      const raw = req.raw as http.IncomingMessage;
      const ctx = {
        ...contextOf(raw, config, { catalog, ordering }, startTrace(headerValue(raw.headers.traceparent))),
        signal: gone.get(raw),
      };
      let document;
      try {
        document = parse(params.query as string);
      } catch (e) {
        return rejection(new GraphQLError(e instanceof Error ? e.message : 'Syntax error'));
      }
      const invalid = validate(schema, document);
      if (invalid.length) return rejection(...invalid);
      // Only subscriptions are served here: queries and mutations have their own JSON route, with its own error mapping and logging.
      if (getOperationAST(document, params.operationName)?.operation !== 'subscription') {
        return rejection(new GraphQLError('Only subscription operations are served over an event stream.'));
      }
      const place = places.get(raw);
      if (place) {
        if (openStreams >= maxStreams) return busy();
        openStreams++;
        place.held = true;
      }
      const result = await subscribe({
        schema,
        document,
        rootValue: subscriptionRoot,
        contextValue: ctx,
        variableValues: params.variables,
        operationName: params.operationName,
        fieldResolver,
        subscribeFieldResolver: fieldResolver,
        typeResolver,
      });
      // The library tells a ready result from execution arguments by its "data" key, which an errors-only result lacks.
      if (!isAsyncIterable(result)) return { data: null, ...safeResult(result, ctx, log) };
      established.add(raw);
      return safeStream(result, ctx, log);
    },
  });

  return http.createServer(async (req, res) => {
    const trace = startTrace(headerValue(req.headers.traceparent));
    const started = performance.now();
    const startedAtMs = Date.now();
    const send = (code: number, body: unknown) => {
      res.writeHead(code, {
        'content-type': 'application/json',
        // Authenticated/personalised responses default to no-store (ADR-0014); no public-cache policy exists for this slice yet.
        'cache-control': 'private, no-store',
        // Response-only alias of the trace id (ADR-0016). An inbound X-Correlation-Id is never read.
        'x-correlation-id': trace.traceId,
        traceparent: toTraceparent(trace),
      });
      res.end(JSON.stringify(body));
    };

    if (req.url === '/healthz') return send(200, { ok: true });
    if (req.url !== '/graphql' || req.method !== 'POST') return send(404, { errors: [{ message: 'Not found' }] });

    // The coarse backstop (register item 128): checked before the body is read or anything is called.
    const turn = limiter.take(connectionAddress(req.socket));
    if (!turn.allowed) {
      log.info({ msg: 'graphql request refused: rate limit', traceId: trace.traceId });
      res.setHeader('retry-after', String(turn.retryAfterSeconds));
      return send(429, {
        errors: [
          {
            message: 'Too many requests. Please wait a moment and try again.',
            extensions: { code: 'RATE_LIMITED' },
          },
        ],
      });
    }

    if (headerValue(req.headers.accept) === EVENT_STREAM) {
      // The library reads the whole request body before anything else, so the size is bounded here: a length is required and must be small.
      const length = Number(headerValue(req.headers['content-length']));
      if (!Number.isInteger(length) || length < 0) return send(411, { errors: [{ message: 'Length required' }] });
      if (length > MAX_BODY_BYTES) return send(413, { errors: [{ message: 'Request too large' }] });
      const place = { held: false };
      places.set(req, place);
      const callerGone = new AbortController();
      gone.set(req, callerGone.signal);
      const opened = performance.now();
      const openedAtMs = Date.now();
      res.once('close', () => {
        callerGone.abort();
        if (place.held) openStreams--;
        log.info({
          msg: 'graphql subscription closed',
          traceId: trace.traceId,
          spanId: trace.spanId,
          durationMs: Math.round(performance.now() - opened),
        });
        exportSpan({
          trace,
          operationName: undefined,
          statusCode: 200,
          failed: false,
          startedAtMs: openedAtMs,
          durationMs: performance.now() - opened,
        });
      });
      // Headers the library does not set. Its own cache-control is no-cache; an authenticated stream is private, no-store (ADR-0014).
      res.setHeader('x-correlation-id', trace.traceId);
      res.setHeader('traceparent', toTraceparent(trace));
      res.setHeader('x-accel-buffering', 'no');
      const writeHead = res.writeHead.bind(res) as (...a: unknown[]) => http.ServerResponse;
      res.writeHead = ((status: number, ...rest: unknown[]) => {
        const headers = rest.find((a) => typeof a === 'object' && a !== null) as Record<string, string> | undefined;
        if (headers) headers['cache-control'] = 'private, no-store';
        const out = writeHead(status, ...rest);
        if (status === 200 && established.has(req)) res.write(': ready\n\n');
        return out;
      }) as typeof res.writeHead;
      try {
        await sse(req, res);
      } catch (e) {
        log.error({
          msg: 'graphql subscription failed',
          traceId: trace.traceId,
          error: { name: e instanceof Error ? e.name : 'error' },
        });
        if (!res.headersSent) send(500, { errors: [internalError(trace.traceId)] });
        else res.destroy();
      }
      return;
    }

    let source: string;
    let variables: Record<string, unknown> | undefined;
    let operationName: string | undefined;
    try {
      const body = JSON.parse(await readBody(req)) as {
        query?: unknown;
        variables?: Record<string, unknown>;
        operationName?: string;
      };
      if (typeof body.query !== 'string') throw new Error('query missing');
      source = body.query;
      variables = body.variables;
      operationName = body.operationName;
    } catch {
      return send(400, { errors: [{ message: 'Invalid request body', extensions: { code: 'BAD_REQUEST' } }] });
    }

    const result = await run(
      source,
      variables,
      operationName,
      contextOf(req, config, { catalog, ordering }, trace),
      log,
    );
    log.info({
      msg: 'graphql request',
      traceId: trace.traceId,
      spanId: trace.spanId,
      continuedTrace: trace.continued,
      operation: operationName ?? null,
      ok: !result.errors,
      durationMs: Math.round(performance.now() - started),
    });
    send(200, result);
    exportSpan({
      trace,
      operationName,
      statusCode: 200,
      failed: !!result.errors,
      startedAtMs,
      durationMs: performance.now() - started,
    });
  });
}

async function run(
  source: string,
  variables: Record<string, unknown> | undefined,
  operationName: string | undefined,
  ctx: Context,
  log: Logger,
): Promise<ExecutionResult> {
  let document;
  try {
    document = parse(source);
  } catch (e) {
    return { errors: [new GraphQLError(e instanceof Error ? e.message : 'Syntax error')] };
  }
  const invalid = validate(schema, document);
  if (invalid.length) return { errors: invalid };

  const result = await execute({
    schema,
    document,
    rootValue,
    contextValue: ctx,
    variableValues: variables,
    operationName,
    fieldResolver,
    typeResolver,
  });

  return safeResult(result, ctx, log);
}

/** The request's context: the caller's bearer credential (only that shape), the test hook when enabled, and the trace. */
function contextOf(
  req: http.IncomingMessage,
  config: Config,
  clients: { catalog: CatalogClient; ordering: OrderingClient },
  trace: Context['trace'],
): Context {
  const authorization = bearerOnly(headerValue(req.headers.authorization));
  // The D-10 hook: only when test hooks are on, and only the one value the hook defines.
  const testPayment =
    config.testHooks && headerValue(req.headers['x-test-payment'])?.toLowerCase() === 'decline' ? 'decline' : undefined;
  return { ...clients, trace, authorization, testPayment };
}

/** The instance holds as many streams as it will: 503 and a time to try again, in the library's response form. The screen polls meanwhile. */
function busy(): [string, { status: number; statusText: string; headers: Record<string, string> }] {
  return [
    JSON.stringify({
      errors: [{ message: 'Live updates are busy. Please poll instead.', extensions: { code: 'STREAM_LIMIT' } }],
    }),
    {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'content-type': 'application/json; charset=utf-8', 'retry-after': '30' },
    },
  ];
}

/** A refusal of a subscription request before it starts, in the library's response form: a 400 with the errors. */
function rejection(
  ...errors: GraphQLError[]
): [string, { status: number; statusText: string; headers: Record<string, string> }] {
  return [
    JSON.stringify({ errors: errors.map((e) => e.toJSON()) }),
    { status: 400, statusText: 'Bad Request', headers: { 'content-type': 'application/json; charset=utf-8' } },
  ];
}

function isAsyncIterable<T>(v: unknown): v is AsyncIterable<T> {
  return typeof v === 'object' && v !== null && Symbol.asyncIterator in v;
}

/** Each event of a subscription, with the same safe error mapping as a query. Closing the result closes the source. */
async function* safeStream(
  source: AsyncIterable<ExecutionResult>,
  ctx: Context,
  log: Logger,
): AsyncGenerator<ExecutionResult> {
  try {
    for await (const result of source) yield safeResult(result, ctx, log);
  } catch (e) {
    if (ctx.signal?.aborted) return; // the caller left: the abort closed the connection to ordering, which is not a failure
    // The stream from ordering broke after it had started (cut, silent, or sent something unreadable): end it with the safe error, not a
    // dropped connection. The detail is logged here and never sent.
    log.error({
      msg: 'subscription failed',
      traceId: ctx.trace.traceId,
      error:
        e instanceof DownstreamError
          ? { name: e.name, message: e.message, status: e.status }
          : { name: e instanceof Error ? e.name : 'error' },
    });
    yield { data: null, errors: [internalError(ctx.trace.traceId)] };
  }
}

function safeResult(result: ExecutionResult, ctx: Context, log: Logger): ExecutionResult {
  if (!result.errors) return result;
  // Errors raised by a resolver are logged in full here and replaced by the safe shape; the client never sees the detail.
  const mapped = result.errors.map((err) => {
    const cause = err.originalError;
    if (!cause || cause instanceof ClientError) return err; // validation errors and the few errors meant for the client
    log.error({
      msg: 'resolver failed',
      traceId: ctx.trace.traceId,
      path: err.path,
      error:
        cause instanceof DownstreamError
          ? { name: cause.name, message: cause.message, status: cause.status }
          : { name: cause.name },
    });
    return internalError(ctx.trace.traceId);
  });
  return { ...result, errors: mapped };
}

function headerValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * The caller's credential, only when it is a bearer token (one word after "Bearer"). Anything else is treated as no credential. The value is
 * passed on unchanged and is never logged or put in a trace: the BFF does not validate it, the service it is sent to does (ADR-0006).
 */
function bearerOnly(v: string | undefined): string | undefined {
  return v !== undefined && /^Bearer [^\s]+$/i.test(v) ? v : undefined;
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error('body too large');
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}
