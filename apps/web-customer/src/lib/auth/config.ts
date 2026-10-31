import type { AuthConfig } from './login.ts';

// Where to log in. These are public values (a public client has no secret, ADR-0006), but they differ per environment, and a NEXT_PUBLIC_ value
// would be fixed into the browser bundle at build time. So the server reads them from its environment on each request (GET /api/config) and
// the browser asks for them before it logs in: one image serves every environment (ADR-0020, register item 101).

export interface AuthSettings {
  /** The issuer's address. The authorize and token addresses are `<issuer>/authorize` and `<issuer>/token` (the mock issuer's layout). */
  issuer: string;
  clientId: string;
}

export type AuthSettingsResult = { ok: true; settings: AuthSettings } | { ok: false; reason: string };

const LOCAL_MOCK_ISSUER = 'http://localhost:5100';
const LOCAL_CLIENT_ID = 'web-customer';

/** An http(s) address with no credentials or fragment, trailing slashes removed; otherwise undefined. */
export function cleanIssuer(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  if (url.username || url.password || url.hash) return undefined;
  return value.trim().replace(/\/+$/, '');
}

/**
 * The login settings from the server's environment (`AUTH_ISSUER`, `AUTH_CLIENT_ID`). In production both are required and there is no default,
 * so a missing setting shows up as "login is not configured" and not as a login that sends people to a local address. Outside production
 * (`next dev`) the local mock issuer is the default.
 */
export function authSettingsFromEnv(env: Record<string, string | undefined>): AuthSettingsResult {
  const production = env['NODE_ENV'] === 'production';
  const issuerSetting = env['AUTH_ISSUER']?.trim();
  const clientIdSetting = env['AUTH_CLIENT_ID']?.trim();
  if (production && (!issuerSetting || !clientIdSetting)) {
    return { ok: false, reason: 'AUTH_ISSUER and AUTH_CLIENT_ID are not set' };
  }
  const issuer = cleanIssuer(issuerSetting || LOCAL_MOCK_ISSUER);
  if (!issuer) return { ok: false, reason: 'AUTH_ISSUER is not an http(s) address' };
  return { ok: true, settings: { issuer, clientId: clientIdSetting || LOCAL_CLIENT_ID } };
}

/** Checks what /api/config returned, so a wrong answer cannot send the browser to a non-http address. */
export function parseAuthSettings(body: unknown): AuthSettings | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { issuer, clientId } = body as Record<string, unknown>;
  const clean = cleanIssuer(issuer);
  if (!clean || typeof clientId !== 'string' || clientId.length === 0) return undefined;
  return { issuer: clean, clientId };
}

/** `origin` is this app's own origin, from the browser. */
export function toAuthConfig(settings: AuthSettings, origin: string): AuthConfig {
  return {
    authorizeUrl: `${settings.issuer}/authorize`,
    tokenUrl: `${settings.issuer}/token`,
    clientId: settings.clientId,
    redirectUri: `${origin}/auth/callback`,
  };
}

let cached: Promise<AuthSettings> | undefined;

/** Asks this app's server where to log in. Asked once per page load; a failed answer is not kept, so the next attempt asks again. */
export function fetchAuthSettings(fetchImpl: typeof fetch = fetch, endpoint = '/api/config'): Promise<AuthSettings> {
  cached ??= (async () => {
    const response = await fetchImpl(endpoint, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error('Login is not configured');
    const settings = parseAuthSettings(await response.json());
    if (!settings) throw new Error('Login is not configured');
    return settings;
  })();
  const pending = cached;
  pending.catch(() => {
    if (cached === pending) cached = undefined;
  });
  return pending;
}

/** For tests: forget the answer kept for this page. */
export function resetAuthSettingsCache(): void {
  cached = undefined;
}
