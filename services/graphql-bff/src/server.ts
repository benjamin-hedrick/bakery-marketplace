import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSchema, execute, parse, validate, GraphQLError, type ExecutionResult } from 'graphql';
import type { Config } from './config.ts';
import { createCatalogClient, type CatalogClient } from './catalog-client.ts';
import { DownstreamError, internalError } from './errors.ts';
import { rootValue, type Context } from './resolvers.ts';
import { startTrace, toTraceparent } from './trace.ts';

const schema = buildSchema(readFileSync(fileURLToPath(new URL('../schema/schema.graphql', import.meta.url)), 'utf8'));
const MAX_BODY_BYTES = 64 * 1024;

export interface Logger { info(entry: Record<string, unknown>): void; error(entry: Record<string, unknown>): void }
export const jsonLogger: Logger = {
  info: (e) => console.log(JSON.stringify({ level: 'info', ...e })),
  error: (e) => console.error(JSON.stringify({ level: 'error', ...e })),
};

export function createServer(config: Config, deps: { catalog?: CatalogClient; log?: Logger } = {}): http.Server {
  const catalog = deps.catalog ?? createCatalogClient(config.catalogUrl, config.timeoutMs);
  const log = deps.log ?? jsonLogger;

  return http.createServer(async (req, res) => {
    const trace = startTrace(headerValue(req.headers.traceparent));
    const started = performance.now();
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
      const body = JSON.parse(await readBody(req)) as { query?: unknown; variables?: Record<string, unknown>; operationName?: string };
      if (typeof body.query !== 'string') throw new Error('query missing');
      source = body.query;
      variables = body.variables;
      operationName = body.operationName;
    } catch {
      return send(400, { errors: [{ message: 'Invalid request body', extensions: { code: 'BAD_REQUEST' } }] });
    }

    const result = await run(source, variables, operationName, { catalog, trace }, log);
    log.info({
      msg: 'graphql request', traceId: trace.traceId, spanId: trace.spanId, continuedTrace: trace.continued,
      operation: operationName ?? null, ok: !result.errors, durationMs: Math.round(performance.now() - started),
    });
    send(200, result);
  });
}

async function run(
  source: string, variables: Record<string, unknown> | undefined, operationName: string | undefined, ctx: Context, log: Logger,
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
    schema, document, rootValue, contextValue: ctx, variableValues: variables, operationName,
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
    if (!cause) return err;
    log.error({
      msg: 'resolver failed', traceId: ctx.trace.traceId, path: err.path,
      error: cause instanceof DownstreamError ? { name: cause.name, message: cause.message, status: cause.status } : { name: cause.name },
    });
    return internalError(ctx.trace.traceId);
  });
  return { ...result, errors: mapped };
}

function headerValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
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
