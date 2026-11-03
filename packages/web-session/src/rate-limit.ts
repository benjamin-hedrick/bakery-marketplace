// Rate limits for the web apps' API routes (WI-RATE-001, register item 128). Mapping of a caller to a key, a token bucket per key held in this
// process, and the settings. API Management cannot limit per user (ADR-0008), so the web apps' server and the BFF are where it is done.
// State is in memory: per process, so with several replicas the effective limit is the number times the replicas (a shared limiter can follow).

export type RateDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** A limiter by key. The interface lets a shared (Redis) limiter replace the in-memory one later. */
export interface RateLimiter {
  take(key: string): RateDecision;
}

export interface BucketOptions {
  /** The number of requests a key may make in a minute: the bucket holds this many and refills at this rate. */
  perMinute: number;
  /** The most keys held; beyond it the least recently used key is forgotten (and starts full if it comes back). Default 10000. */
  maxKeys?: number;
  /** Milliseconds, from any fixed point; replaceable so tests control time. */
  now?: () => number;
}

export const DEFAULT_MAX_KEYS = 10_000;

/**
 * A token bucket per key. A key may burst up to `perMinute` requests, then is let through at `perMinute` a minute. Memory is bounded: a flood of
 * different keys cannot grow the table past `maxKeys`.
 */
export function createTokenBucketLimiter({
  perMinute,
  maxKeys = DEFAULT_MAX_KEYS,
  now = Date.now,
}: BucketOptions): RateLimiter {
  if (!Number.isInteger(perMinute) || perMinute < 1) throw new Error('perMinute must be a whole number of at least 1');
  if (!Number.isInteger(maxKeys) || maxKeys < 1) throw new Error('maxKeys must be a whole number of at least 1');
  const perMs = perMinute / 60_000;
  const buckets = new Map<string, { tokens: number; at: number }>(); // insertion order = least recently used first

  return {
    take(key) {
      const t = now();
      const held = buckets.get(key);
      let tokens = held ? Math.min(perMinute, held.tokens + (t - held.at) * perMs) : perMinute;
      buckets.delete(key); // re-inserted below, so the most recently used key is last
      let decision: RateDecision;
      if (tokens >= 1) {
        tokens -= 1;
        decision = { allowed: true };
      } else {
        decision = { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((1 - tokens) / perMs / 1000)) };
      }
      buckets.set(key, { tokens, at: t });
      if (buckets.size > maxKeys) buckets.delete(buckets.keys().next().value as string);
      return decision;
    },
  };
}

export interface AddressSource {
  headers: { [name: string]: string | string[] | undefined };
  socket?: { remoteAddress?: string | undefined } | null | undefined;
}

const normalise = (address: string) => address.trim().replace(/^::ffff:/i, '');

/**
 * The address a request counts against. By default the connection's own address: `X-Forwarded-For` is ignored, because anyone can send it.
 * Behind a known number of proxies (`trustedHops` = n), the proxies each append the address they saw, so the client is the entry n places from
 * the right; whatever a caller put to the left of that is never used. A header that is missing or shorter than n falls back to the connection.
 */
export function clientAddress(req: AddressSource, trustedHops: number): string {
  const connection = normalise(req.socket?.remoteAddress ?? '') || 'unknown';
  if (trustedHops < 1) return connection;
  const raw = req.headers['x-forwarded-for'];
  const header = Array.isArray(raw) ? raw.join(',') : raw;
  if (!header) return connection;
  const entries = header
    .split(',')
    .map(normalise)
    .filter((e) => e !== '');
  const picked = entries.length >= trustedHops ? entries[entries.length - trustedHops] : undefined;
  return picked && picked.length <= 64 ? picked : connection;
}

/** The refusal text: fixed, and the same for every route. */
export const RATE_LIMITED_MESSAGE = 'Too many requests. Please wait a moment and try again.';

export interface RateLimitSettings {
  trustedProxyHops: number;
  loginPerMinute: number;
  graphqlPerMinute: number;
  streamPerMinute: number;
  addressPerMinute: number;
}

export const DEFAULT_RATE_LIMITS: RateLimitSettings = {
  trustedProxyHops: 0,
  loginPerMinute: 10,
  graphqlPerMinute: 120,
  streamPerMinute: 10,
  addressPerMinute: 600,
};

export type RateLimitSettingsResult = { ok: true; settings: RateLimitSettings } | { ok: false; reason: string };

const MAX_SETTING = 100_000;

/** A whole number from `min` to 100000, or undefined if the variable is not set. */
function whole(env: Record<string, string | undefined>, name: string, min: number): number | undefined | 'bad' {
  const raw = env[name];
  if (raw === undefined || raw === '') return undefined;
  if (!/^\d{1,6}$/.test(raw.trim())) return 'bad';
  const n = Number(raw);
  return n >= min && n <= MAX_SETTING ? n : 'bad';
}

/** Reads the settings from the environment. A bad one is reported by name only, never by value. */
export function rateLimitSettingsFromEnv(env: Record<string, string | undefined>): RateLimitSettingsResult {
  const settings = { ...DEFAULT_RATE_LIMITS };
  const fields: [keyof RateLimitSettings, string, number][] = [
    ['trustedProxyHops', 'TRUSTED_PROXY_HOPS', 0],
    ['loginPerMinute', 'RATE_LIMIT_LOGIN_PER_MINUTE', 1],
    ['graphqlPerMinute', 'RATE_LIMIT_GRAPHQL_PER_MINUTE', 1],
    ['streamPerMinute', 'RATE_LIMIT_STREAM_PER_MINUTE', 1],
    ['addressPerMinute', 'RATE_LIMIT_ADDRESS_PER_MINUTE', 1],
  ];
  for (const [field, name, min] of fields) {
    const value = whole(env, name, min);
    if (value === 'bad') return { ok: false, reason: `${name} must be a whole number from ${min} to ${MAX_SETTING}` };
    if (value !== undefined) settings[field] = value;
  }
  return { ok: true, settings };
}

/** The limiters the web routes use, built from the settings. */
export interface WebRateLimits {
  trustedProxyHops: number;
  /** /api/auth/login and /api/auth/callback, by address. */
  login: RateLimiter;
  loginCallback: RateLimiter;
  /** /api/graphql by login, or by address when there is none. */
  graphql: RateLimiter;
  /** Opening a stream, by login. */
  stream: RateLimiter;
  /** Every route that is not login, by address, checked before the session is looked up. */
  address: RateLimiter;
}

export function createWebRateLimits(settings: RateLimitSettings, now?: () => number): WebRateLimits {
  const bucket = (perMinute: number) => createTokenBucketLimiter({ perMinute, ...(now ? { now } : {}) });
  return {
    trustedProxyHops: settings.trustedProxyHops,
    login: bucket(settings.loginPerMinute),
    loginCallback: bucket(settings.loginPerMinute),
    graphql: bucket(settings.graphqlPerMinute),
    stream: bucket(settings.streamPerMinute),
    address: bucket(settings.addressPerMinute),
  };
}
