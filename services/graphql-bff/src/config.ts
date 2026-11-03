import { limitsFromEnv, type OperationLimits } from './limits.ts';
import { ratePerMinuteFromEnv } from './rate-limit.ts';

export interface Config {
  port: number;
  /** Base URL of catalog-service. Locally a direct call; in the cloud this is the API Management URL (ADR-0013). */
  catalogUrl: string;
  /** Base URL of ordering-service, called the same way. */
  orderingUrl: string;
  /** Downstream timeout in milliseconds, for reads. */
  timeoutMs: number;
  /**
   * Timeout for placing an order. Longer than a read: checkout itself calls the catalog and the payment step. A timeout here does not mean the
   * order failed; the client retries with the same idempotency key and gets the original order if there was one.
   */
  checkoutTimeoutMs: number;
  /**
   * Forward the `X-Test-Payment: decline` header (first-slice contract D-10) so a browser test can see a declined payment. Off unless
   * `ENABLE_TEST_HOOKS=1`, which must never be set outside tests. Ordering-service also ignores the header in Production.
   */
  testHooks: boolean;
  /**
   * Live updates (ADR-0021): how long the stream from ordering-service may be silent before the BFF treats it as dead. Ordering sends a
   * heartbeat every 15 seconds, so the default of 45 seconds is three missed beats.
   */
  streamIdleMs?: number | undefined;
  /** Live updates: the most subscriptions this instance holds open at once. Beyond it a new one is refused with 503 (the screen polls instead). */
  maxStreams?: number | undefined;
  /** A coarse ceiling on requests per minute from one source address (`BFF_RATE_LIMIT_PER_MINUTE`, default 600). In practice the source is the web app's server. */
  rateLimitPerMinute?: number | undefined;
  /** Limits on the size of an operation and whether introspection is refused (`BFF_MAX_QUERY_DEPTH`, `BFF_MAX_ROOT_FIELDS`, `BFF_MAX_FIELDS`, `BFF_DISABLE_INTROSPECTION=1`). */
  operationLimits?: OperationLimits | undefined;
  /** OTLP/HTTP base URL (`OTEL_EXPORTER_OTLP_ENDPOINT`). Unset means traces are not exported. */
  otlpEndpoint?: string | undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const timeoutMs = Number(env.DOWNSTREAM_TIMEOUT_MS ?? 5000);
  return {
    port: Number(env.BFF_PORT ?? 4100),
    catalogUrl: (env.CATALOG_URL ?? 'http://localhost:5200').replace(/\/+$/, ''),
    orderingUrl: (env.ORDERING_URL ?? 'http://localhost:5300').replace(/\/+$/, ''),
    timeoutMs,
    checkoutTimeoutMs: Number(env.CHECKOUT_TIMEOUT_MS ?? Math.max(15000, timeoutMs)),
    testHooks: env.ENABLE_TEST_HOOKS === '1',
    streamIdleMs: Number(env.STREAM_IDLE_MS ?? 45000),
    maxStreams: Number(env.MAX_STREAMS ?? 500),
    rateLimitPerMinute: ratePerMinuteFromEnv(env),
    operationLimits: limitsFromEnv(env),
    otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
  };
}
