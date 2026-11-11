import { defaultStorePrefix, MEMORY_STORE, sessionConfigFromEnv, type SessionConfig } from './config.ts';
import { createSealer } from './crypto.ts';
import { createWebRateLimits, rateLimitSettingsFromEnv } from './rate-limit.ts';
import { createAuthHandlers, createGraphqlHandler, createGraphqlStreamHandler } from './handlers.ts';
import { createSessionService, type SessionService } from './service.ts';
import { createMemoryStore, createRedisStore, type SessionStore } from './store.ts';
import type { ApiRequest, ApiResponse } from './handlers.ts';
import type { StreamResponse } from './graphql-proxy.ts';
import { webChaosGateFromEnv } from './chaos-door.ts';

export interface SessionRuntime {
  config: SessionConfig;
  service: SessionService;
  store: SessionStore;
  auth: ReturnType<typeof createAuthHandlers>;
  graphql: ReturnType<typeof createGraphqlHandler>;
  graphqlStream: ReturnType<typeof createGraphqlStreamHandler>;
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
  const limitSettings = rateLimitSettingsFromEnv(env);
  let result: SessionRuntimeResult;
  if (!limitSettings.ok) {
    console.error(
      JSON.stringify({ level: 'error', msg: 'the rate limit settings are not usable', reason: limitSettings.reason }),
    );
    result = { ok: false, reason: limitSettings.reason };
  } else if (!parsed.ok) {
    console.error(
      JSON.stringify({ level: 'error', msg: 'the session settings are not usable', reason: parsed.reason }),
    );
    result = { ok: false, reason: parsed.reason };
  } else {
    const { config } = parsed;
    const log = (event: string) => console.warn(JSON.stringify({ level: 'warn', msg: event }));
    const sealer = createSealer(config.currentKey, config.previousKey);
    if (config.redisUrl === MEMORY_STORE)
      log('sessions are kept in this process only (SESSION_ALLOW_MEMORY_STORE=1): for tests and demos');
    const store =
      config.redisUrl === MEMORY_STORE
        ? createMemoryStore(sealer)
        : createRedisStore(sealer, config.redisUrl, env['SESSION_REDIS_PREFIX'] || defaultStorePrefix(config.clientId));
    const service = createSessionService({ config, store, log });
    const limits = createWebRateLimits(limitSettings.settings);
    const gate = webChaosGateFromEnv(env); // undefined unless CHAOS_ENABLED (ADR-0024)
    result = {
      ok: true,
      runtime: {
        config,
        service,
        store,
        auth: createAuthHandlers({ config, service, log, limits }),
        graphql: createGraphqlHandler({
          config,
          service,
          target: () => process.env['GRAPHQL_URL'],
          extraHeaders: () => process.env['GRAPHQL_EXTRA_FORWARDED_HEADERS'],
          log,
          limits,
          gate,
        }),
        graphqlStream: createGraphqlStreamHandler({
          config,
          service,
          target: () => process.env['GRAPHQL_URL'],
          extraHeaders: () => process.env['GRAPHQL_EXTRA_FORWARDED_HEADERS'],
          log,
          limits,
          gate,
        }),
      },
    };
  }
  holder[KEY] = result;
  return result;
}

type Handler<R extends ApiResponse = ApiResponse> = (req: ApiRequest, res: R) => Promise<void>;

function route<R extends ApiResponse = ApiResponse>(pick: (runtime: SessionRuntime) => Handler<R>): Handler<R> {
  return async (req, res) => {
    const result = getSessionRuntime();
    if (!result.ok) {
      // The reason names a setting, never a value, and has gone to the server log; the browser gets a fixed sentence.
      res.status(503);
      res.json({ error: 'Login is not configured' });
      return;
    }
    await pick(result.runtime)(req, res);
  };
}

/**
 * The six API routes an app mounts (the sixth, the subscription route, only where there is a live screen), each answering 503 "Login is not configured" if the settings are unusable. In a Pages Router app:
 * `export default apiRoutes.login;` in `pages/api/auth/login.ts`, and so on; `pages/api/graphql.ts` also exports `config = { api: { bodyParser: false } }`.
 */
export const apiRoutes = {
  login: route((r) => r.auth.login),
  callback: route((r) => r.auth.callback),
  logout: route((r) => r.auth.logout),
  me: route((r) => r.auth.me),
  graphql: route((r) => r.graphql),
  /** The subscription route: `pages/api/graphql-stream.ts`, with `config = { api: { bodyParser: false, responseLimit: false } }`. */
  graphqlStream: route<ApiResponse & StreamResponse>((r) => r.graphqlStream),
};
