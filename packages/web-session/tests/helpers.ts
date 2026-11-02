import { randomBytes } from 'node:crypto';
import { parseEncryptionKey, sessionConfigFromEnv, type SessionConfig } from '../src/config.ts';
import { createSealer } from '../src/crypto.ts';
import type { FetchLike } from '../src/oidc.ts';

export const newKey = (id = 'k1') => parseEncryptionKey(`${id}:${randomBytes(32).toString('base64url')}`)!;
export const newSealer = () => createSealer(newKey());

const b64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** A JWT with the claims the session reads. The signature is not checked by the session (the services check it). */
export function fakeJwt(claims: Record<string, unknown> = {}, expiresAtMs = Date.now() + 3_600_000): string {
  const payload = {
    sub: 'vendor-shop-001',
    name: 'Corner Bakery (owner)',
    email: 'owner@cornerbakery.local',
    roles: 'Vendor',
    exp: Math.floor(expiresAtMs / 1000),
    ...claims,
  };
  return `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url(payload)}.c2lnbmF0dXJl`;
}

export function testConfig(overrides: Record<string, string | undefined> = {}): SessionConfig {
  const result = sessionConfigFromEnv({
    AUTH_ISSUER: 'http://localhost:5100',
    AUTH_CLIENT_ID: 'web-queue-display',
    APP_ORIGIN: 'http://localhost:3100',
    SESSION_ENCRYPTION_KEY: randomBytes(32).toString('base64url'),
    SESSION_REDIS_URL: 'redis://127.0.0.1:6379',
    ...overrides,
  });
  if (!result.ok) throw new Error(result.reason);
  return result.config;
}

export interface Call {
  url: string;
  body: URLSearchParams;
}

/** A fake token endpoint: records every call and answers from a script. */
export function fakeIssuer(answer: (call: Call, n: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const call = { url, body: new URLSearchParams(String(init.body ?? '')) };
    calls.push(call);
    return answer(call, calls.length);
  };
  return { calls, fetchImpl };
}

export const tokenResponse = (tokens: { access?: string; refresh?: string | null; expiresIn?: number } = {}) =>
  Response.json({
    access_token: tokens.access ?? fakeJwt(),
    ...(tokens.refresh === null ? {} : { refresh_token: tokens.refresh ?? 'refresh-1' }),
    token_type: 'Bearer',
    expires_in: tokens.expiresIn ?? 3600,
  });

export const errorResponse = (error: string, status = 400) => Response.json({ error }, { status });

export class ManualClock {
  time = Date.UTC(2026, 10, 2, 9, 0, 0);
  now = () => this.time;
  advance(ms: number) {
    this.time += ms;
  }
}
