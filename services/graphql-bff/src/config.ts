export interface Config {
  port: number;
  /** Base URL of catalog-service. Locally a direct call; in the cloud this is the API Management URL (ADR-0013). */
  catalogUrl: string;
  /** Downstream timeout in milliseconds. */
  timeoutMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.BFF_PORT ?? 4100),
    catalogUrl: (env.CATALOG_URL ?? 'http://localhost:5200').replace(/\/+$/, ''),
    timeoutMs: Number(env.DOWNSTREAM_TIMEOUT_MS ?? 5000),
  };
}
