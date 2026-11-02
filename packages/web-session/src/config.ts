// The session settings, read from the server's environment on each start (ADR-0020: one image serves every environment; ADR-0007: secrets come
// from the environment and the app refuses to start without them). Values are named in errors, never printed.

export interface EncryptionKey {
  id: string;
  key: Buffer;
}

export interface SessionConfig {
  /** Where the browser goes to log in (the issuer's address as the browser reaches it). */
  issuerBrowser: string;
  /** Where this server calls the token endpoint (a container network may reach the issuer by another name). */
  issuerServer: string;
  clientId: string;
  /** This app's own origin, from which the redirect address and the CSRF check are derived. */
  appOrigin: string;
  scope: string;
  redirectUri: string;
  sessionCookieName: string;
  loginCookieName: string;
  /** False only for plain HTTP on a loopback address (local development). */
  cookieSecure: boolean;
  idleSeconds: number;
  absoluteSeconds: number;
  /** Renew the access token this long before it expires. */
  refreshMarginSeconds: number;
  /** How long a started login may take to finish. */
  pendingSeconds: number;
  currentKey: EncryptionKey;
  previousKey: EncryptionKey | undefined;
  redisUrl: string;
}

export type SessionConfigResult = { ok: true; config: SessionConfig } | { ok: false; reason: string };

export const CALLBACK_PATH = '/api/auth/callback';

/** The value of SESSION_REDIS_URL that keeps sessions in the process's own memory: tests and demos only, and only when SESSION_ALLOW_MEMORY_STORE=1. */
export const MEMORY_STORE = 'memory';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

function httpAddress(value: string | undefined): URL | undefined {
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  if (url.username || url.password || url.hash || url.search) return undefined;
  return url;
}

const trimSlash = (value: string) => value.replace(/\/+$/, '');

const cookieSafe = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, '-');

/** The default key prefix in the session store: one per client, so two apps sharing a Redis never read each other's sessions. */
export const defaultStorePrefix = (clientId: string) => `web-session:${cookieSafe(clientId)}`;

/** `<id>:<base64url key>` or a bare key (id `k1`). Exactly 32 bytes once decoded, or undefined. */
export function parseEncryptionKey(value: string | undefined): EncryptionKey | undefined {
  if (!value) return undefined;
  const colon = value.indexOf(':');
  const id = colon > 0 ? value.slice(0, colon) : 'k1';
  const encoded = colon > 0 ? value.slice(colon + 1) : value;
  if (!/^[A-Za-z0-9_-]{1,16}$/.test(id) || !/^[A-Za-z0-9_-]+={0,2}$/.test(encoded)) return undefined;
  const key = Buffer.from(encoded, 'base64url');
  return key.length === 32 ? { id, key } : undefined;
}

function seconds(value: string | undefined, fallback: number, min: number): number | undefined {
  if (value === undefined || value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n >= min ? n : undefined;
}

/**
 * The settings from the environment. Required: AUTH_ISSUER, AUTH_CLIENT_ID, APP_ORIGIN, SESSION_ENCRYPTION_KEY, SESSION_REDIS_URL.
 * Plain HTTP is accepted for this app's origin only on a loopback address, where the cookie is the unprefixed, non-Secure form; anywhere else the
 * origin must be HTTPS and the cookie gets the `__Host-` prefix and `Secure`.
 */
export function sessionConfigFromEnv(env: Record<string, string | undefined>): SessionConfigResult {
  const issuerBrowser = httpAddress(env['AUTH_ISSUER']);
  if (!issuerBrowser) return { ok: false, reason: 'AUTH_ISSUER is missing or not an http(s) address' };
  const issuerServer = env['AUTH_ISSUER_INTERNAL'] ? httpAddress(env['AUTH_ISSUER_INTERNAL']) : issuerBrowser;
  if (!issuerServer) return { ok: false, reason: 'AUTH_ISSUER_INTERNAL is not an http(s) address' };
  const clientId = env['AUTH_CLIENT_ID']?.trim();
  if (!clientId) return { ok: false, reason: 'AUTH_CLIENT_ID is not set' };

  const origin = httpAddress(env['APP_ORIGIN']);
  if (!origin || origin.pathname !== '/')
    return { ok: false, reason: 'APP_ORIGIN is missing or not an origin (scheme, host, port)' };
  const secure = origin.protocol === 'https:';
  if (!secure && !LOOPBACK.has(origin.hostname)) {
    return {
      ok: false,
      reason: 'APP_ORIGIN must be https unless it is a loopback address (the session cookie needs Secure)',
    };
  }

  const currentKey = parseEncryptionKey(env['SESSION_ENCRYPTION_KEY']);
  if (!currentKey)
    return {
      ok: false,
      reason: 'SESSION_ENCRYPTION_KEY is missing or not 32 bytes of base64url (optionally "<id>:<key>")',
    };
  const previousSetting = env['SESSION_ENCRYPTION_KEY_PREVIOUS'];
  const previousKey = parseEncryptionKey(previousSetting);
  if (previousSetting && !previousKey)
    return { ok: false, reason: 'SESSION_ENCRYPTION_KEY_PREVIOUS is not 32 bytes of base64url' };
  if (previousKey && previousKey.id === currentKey.id) {
    return {
      ok: false,
      reason: 'SESSION_ENCRYPTION_KEY_PREVIOUS must have a different id from SESSION_ENCRYPTION_KEY',
    };
  }

  const redisUrl = env['SESSION_REDIS_URL']?.trim();
  if (!redisUrl)
    return {
      ok: false,
      reason: 'SESSION_REDIS_URL is not set (use "memory" only for tests, with SESSION_ALLOW_MEMORY_STORE=1)',
    };
  if (redisUrl === MEMORY_STORE && env['SESSION_ALLOW_MEMORY_STORE'] !== '1') {
    return {
      ok: false,
      reason:
        'SESSION_REDIS_URL=memory needs SESSION_ALLOW_MEMORY_STORE=1: sessions would live in one process and be lost on restart',
    };
  }

  const margin = seconds(env['SESSION_REFRESH_MARGIN_SECONDS'], 60, 1);
  if (margin === undefined)
    return { ok: false, reason: 'SESSION_REFRESH_MARGIN_SECONDS is not a positive whole number' };
  const idleMinutes = seconds(env['SESSION_IDLE_MINUTES'], 12 * 60, 1);
  const absoluteHours = seconds(env['SESSION_ABSOLUTE_HOURS'], 7 * 24, 1);
  if (idleMinutes === undefined) return { ok: false, reason: 'SESSION_IDLE_MINUTES is not a positive whole number' };
  if (absoluteHours === undefined)
    return { ok: false, reason: 'SESSION_ABSOLUTE_HOURS is not a positive whole number' };

  const appOrigin = trimSlash(origin.origin);
  return {
    ok: true,
    config: {
      issuerBrowser: trimSlash(issuerBrowser.toString()),
      issuerServer: trimSlash(issuerServer.toString()),
      clientId,
      appOrigin,
      scope: 'openid offline_access',
      redirectUri: `${appOrigin}${CALLBACK_PATH}`,
      // Named for the client: browsers do not separate cookies by port, so two apps on localhost would otherwise overwrite each other's session.
      sessionCookieName: `${secure ? '__Host-' : ''}bakery-session-${cookieSafe(clientId)}`,
      loginCookieName: `${secure ? '__Host-' : ''}bakery-login-${cookieSafe(clientId)}`,
      cookieSecure: secure,
      idleSeconds: idleMinutes * 60,
      absoluteSeconds: absoluteHours * 3600,
      refreshMarginSeconds: margin,
      pendingSeconds: 600,
      currentKey,
      previousKey,
      redisUrl,
    },
  };
}
