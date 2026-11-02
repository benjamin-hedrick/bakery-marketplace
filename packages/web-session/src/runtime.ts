import { defaultStorePrefix, sessionConfigFromEnv, type SessionConfig } from './config.ts';
import { createSealer } from './crypto.ts';
import { createAuthHandlers, createGraphqlHandler } from './handlers.ts';
import { createSessionService, type SessionService } from './service.ts';
import { createRedisStore, type SessionStore } from './store.ts';

export interface SessionRuntime {
  config: SessionConfig;
  service: SessionService;
  store: SessionStore;
  auth: ReturnType<typeof createAuthHandlers>;
  graphql: ReturnType<typeof createGraphqlHandler>;
}

export type SessionRuntimeResult = { ok: true; runtime: SessionRuntime } | { ok: false; reason: string };

const KEY = Symbol.for('@bakery/web-session.runtime');

/**
 * The one runtime of this server process, built from the environment on first use: the configuration is validated (a bad one is reported by name,
 * never by value), the store connects to Redis, and the handlers are wired. Kept on `globalThis` because a route bundle may load this module more
 * than once and there must be one Redis connection, not one per route.
 */
export function getSessionRuntime(env: Record<string, string | undefined> = process.env): SessionRuntimeResult {
  const holder = globalThis as unknown as Record<symbol, SessionRuntimeResult | undefined>;
  const existing = holder[KEY];
  if (existing) return existing;

  const parsed = sessionConfigFromEnv(env);
  let result: SessionRuntimeResult;
  if (!parsed.ok) {
    console.error(
      JSON.stringify({ level: 'error', msg: 'the session settings are not usable', reason: parsed.reason }),
    );
    result = { ok: false, reason: parsed.reason };
  } else {
    const { config } = parsed;
    const log = (event: string) => console.warn(JSON.stringify({ level: 'warn', msg: event }));
    const store = createRedisStore(
      createSealer(config.currentKey, config.previousKey),
      config.redisUrl,
      env['SESSION_REDIS_PREFIX'] || defaultStorePrefix(config.clientId),
    );
    const service = createSessionService({ config, store, log });
    result = {
      ok: true,
      runtime: {
        config,
        service,
        store,
        auth: createAuthHandlers({ config, service, log }),
        graphql: createGraphqlHandler({
          config,
          service,
          target: () => process.env['GRAPHQL_URL'],
          extraHeaders: () => process.env['GRAPHQL_EXTRA_FORWARDED_HEADERS'],
          log,
        }),
      },
    };
  }
  holder[KEY] = result;
  return result;
}
