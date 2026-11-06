// A coarse backstop in front of the BFF's /graphql route (WI-RATE-001, register item 128). The same token bucket as packages/web-session's
// rate-limit.ts, kept small and in step with it by hand (the BFF is a separate package and takes no dependency on the web apps' package).
// The caller is the connection's own address: in practice the web app's server, so this is a ceiling on one web app and anything else that
// reaches the BFF directly, not a per-user limit (the per-login limits are at the web apps). X-Forwarded-For is never read here.

import { BlockList, isIP } from 'node:net';

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

// Register 137: counting per client. The web app's server is the one caller that knows who the browser is, so it says so in this header (the
// address it counted the browser by). The BFF believes the header only when the connection comes from a source named in
// BFF_TRUSTED_CLIENT_SOURCES; from anyone else the header is ignored, so a caller cannot choose its own bucket or pose as another one.
export const CLIENT_ADDRESS_HEADER = 'x-bakery-client-address';

/** Whether an address is one of the trusted sources: a list of single IPv4 or IPv6 addresses and IPv4 ranges (`10.0.0.0/8`). */
export type TrustedSources = (address: string) => boolean;

export const NO_TRUSTED_SOURCES: TrustedSources = () => false;

/**
 * Reads `BFF_TRUSTED_CLIENT_SOURCES` (comma-separated addresses or IPv4 ranges). Unset or empty trusts nobody (the header is never read). An entry
 * that is not an address or range stops the start, naming the variable only.
 */
export function trustedSourcesFromEnv(env: NodeJS.ProcessEnv): TrustedSources {
  const raw = env.BFF_TRUSTED_CLIENT_SOURCES;
  if (raw === undefined || raw.trim() === '') return NO_TRUSTED_SOURCES;
  const list = new BlockList();
  for (const entry of raw.split(',').map((e) => e.trim())) {
    const [address, prefix, ...rest] = entry.split('/');
    const family = isIP(address ?? '');
    const bits = prefix === undefined ? undefined : Number(prefix);
    const rangeOk = bits === undefined || (family === 4 && /^\d{1,2}$/.test(prefix ?? '') && (bits as number) <= 32);
    if (!address || family === 0 || rest.length > 0 || !rangeOk)
      throw new Error(
        'BFF_TRUSTED_CLIENT_SOURCES must be a comma-separated list of IP addresses or IPv4 ranges (a.b.c.d/n)',
      );
    const type = family === 4 ? 'ipv4' : 'ipv6';
    if (bits === undefined) list.addAddress(address, type);
    else list.addSubnet(address, bits, type);
  }
  return (address) => {
    const family = isIP(address);
    return family !== 0 && list.check(address, family === 4 ? 'ipv4' : 'ipv6');
  };
}

/**
 * Who a request counts against: the client named in the header when the connection is from a trusted source and the header holds one address
 * (nothing else: no list, no text), otherwise the connection's own address. A trusted source that sends no header is counted by its own address.
 */
export function rateKey(
  socket: { remoteAddress?: string | undefined } | null | undefined,
  header: string | string[] | undefined,
  trusted: TrustedSources,
): string {
  const connection = connectionAddress(socket);
  if (typeof header !== 'string' || !trusted(connection)) return connection;
  const client = header.trim().replace(/^::ffff:/i, '');
  return isIP(client) !== 0 ? `client:${client}` : connection;
}
