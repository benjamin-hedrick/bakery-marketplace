export interface Config {
  port: number;
  /** Base URL of catalog-service. Locally a direct call; in the cloud this is the API Management URL (ADR-0013). */
  catalogUrl: string;
  /** Base URL of ordering-service, called the same way. */
  orderingUrl: string;
  /** Downstream timeout in milliseconds. */
  timeoutMs: number;
  /** OTLP/HTTP base URL (`OTEL_EXPORTER_OTLP_ENDPOINT`). Unset means traces are not exported. */
  otlpEndpoint?: string | undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.BFF_PORT ?? 4100),
    catalogUrl: (env.CATALOG_URL ?? 'http://localhost:5200').replace(/\/+$/, ''),
    orderingUrl: (env.ORDERING_URL ?? 'http://localhost:5300').replace(/\/+$/, ''),
    timeoutMs: Number(env.DOWNSTREAM_TIMEOUT_MS ?? 5000),
    otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
  };
}
