// A coarse backstop in front of the BFF's /graphql route (WI-RATE-001, register item 128). The same token bucket as packages/web-session's
// rate-limit.ts, kept small and in step with it by hand (the BFF is a separate package and takes no dependency on the web apps' package).
// The caller is the connection's own address: in practice the web app's server, so this is a ceiling on one web app and anything else that
// reaches the BFF directly, not a per-user limit (the per-login limits are at the web apps). X-Forwarded-For is never read here.

export type RateDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export interface RateLimiter {
  take(key: string): RateDecision;
}

export const DEFAULT_PER_MINUTE = 600;
const MAX_KEYS = 10_000;
const MAX_SETTING = 100_000;

export function createTokenBucketLimiter(perMinute: number, now: () => number = Date.now): RateLimiter {
  if (!Number.isInteger(perMinute) || perMinute < 1) throw new Error('perMinute must be a whole number of at least 1');
  const perMs = perMinute / 60_000;
  const buckets = new Map<string, { tokens: number; at: number }>(); // least recently used first
  return {
    take(key) {
      const t = now();
      const held = buckets.get(key);
      let tokens = held ? Math.min(perMinute, held.tokens + (t - held.at) * perMs) : perMinute;
      buckets.delete(key);
      let decision: RateDecision;
      if (tokens >= 1) {
        tokens -= 1;
        decision = { allowed: true };
      } else {
        decision = { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((1 - tokens) / perMs / 1000)) };
      }
      buckets.set(key, { tokens, at: t });
      if (buckets.size > MAX_KEYS) buckets.delete(buckets.keys().next().value as string);
      return decision;
    },
  };
}

/** The per-minute ceiling from `BFF_RATE_LIMIT_PER_MINUTE`: a whole number from 1 to 100000, or the default. A bad value stops the BFF, by name only. */
export function ratePerMinuteFromEnv(env: NodeJS.ProcessEnv): number {
  const raw = env.BFF_RATE_LIMIT_PER_MINUTE;
  if (raw === undefined || raw === '') return DEFAULT_PER_MINUTE;
  if (!/^\d{1,6}$/.test(raw.trim()) || Number(raw) < 1 || Number(raw) > MAX_SETTING)
    throw new Error(`BFF_RATE_LIMIT_PER_MINUTE must be a whole number from 1 to ${MAX_SETTING}`);
  return Number(raw);
}

/** The connection's own address, with an IPv4 address inside IPv6 shown as IPv4. */
export const connectionAddress = (socket: { remoteAddress?: string | undefined } | null | undefined): string =>
  (socket?.remoteAddress ?? '').replace(/^::ffff:/i, '') || 'unknown';
