import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSchema, execute, parse, validate, GraphQLError, type ExecutionResult } from 'graphql';
import type { Config } from './config.ts';
import { createCatalogClient, type CatalogClient } from './catalog-client.ts';
import { createOrderingClient, type OrderingClient } from './ordering-client.ts';
import { ClientError, DownstreamError, internalError } from './errors.ts';
import { rootValue, type Context } from './resolvers.ts';
import { createOtlpExporter, type SpanExporter } from './otlp.ts';
import { startTrace, toTraceparent } from './trace.ts';

const schema = buildSchema(readFileSync(fileURLToPath(new URL('../schema/schema.graphql', import.meta.url)), 'utf8'));
const MAX_BODY_BYTES = 64 * 1024;

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
    deps.ordering ?? createOrderingClient(config.orderingUrl, config.timeoutMs, undefined, config.checkoutTimeoutMs);
  const log = deps.log ?? jsonLogger;
  const exportSpan = deps.exporter ?? createOtlpExporter(config.otlpEndpoint);

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

    const authorization = bearerOnly(headerValue(req.headers.authorization));
    // The D-10 hook: only when test hooks are on, and only the one value the hook defines.
    const testPayment =
      config.testHooks && headerValue(req.headers['x-test-payment'])?.toLowerCase() === 'decline'
        ? 'decline'
        : undefined;
    const result = await run(
      source,
      variables,
      operationName,
      { catalog, ordering, trace, authorization, testPayment },
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
    fieldResolver: (src, args, context, info) => {
      const v = (src as Record<string, unknown>)[info.fieldName];
      return typeof v === 'function' ? (v as (a: unknown, c: unknown) => unknown).call(src, args, context) : v;
    },
    typeResolver: (value) => (value as { __typename?: string }).__typename,
  });

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
