import type { IncomingHttpHeaders } from 'node:http';
import type { SessionConfig } from './config.ts';
import { checkStateChangingRequest } from './csrf.ts';
import {
  extraForwardedHeaders,
  proxyGraphql,
  proxyGraphqlStream,
  readRequestBody,
  type ProxyRequest,
  type ProxyResponse,
  type StreamResponse,
} from './graphql-proxy.ts';
import { LoginError, type SessionService } from './service.ts';

// Request handlers for the web app's API routes (Next.js Pages Router shape, written against the few members they use so the package does not
// depend on Next). Each app mounts them at /api/auth/login, /api/auth/callback, /api/auth/logout, /api/auth/me and /api/graphql (ADR-0019).

export interface ApiRequest extends ProxyRequest {
  url?: string | undefined;
  headers: IncomingHttpHeaders;
  query?: Record<string, string | string[] | undefined>;
}

export interface ApiResponse extends ProxyResponse {
  setHeader(name: string, value: string | string[]): unknown;
  end(): unknown;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function redirect(res: ApiResponse, location: string): void {
  res.status(302);
  res.setHeader('Location', location);
  res.end();
}

function methodNotAllowed(res: ApiResponse, allow: string): void {
  res.setHeader('Allow', allow);
  res.status(405);
  res.json({ error: 'Method not allowed' });
}

/** A response header the GraphQL proxy sets when it has just ended the caller's session, so the page can show the login again. */
export const SESSION_ENDED_HEADER = 'x-session-ended';

/** Where a failed login is sent: the app shows the fixed sentence for the code. */
export const LOGIN_ERROR_PATH = '/auth/error';

export interface AuthHandlerDeps {
  config: SessionConfig;
  service: SessionService;
  log?: (event: string) => void;
}

export function createAuthHandlers({ config, service, log = () => {} }: AuthHandlerDeps) {
  return {
    /** GET /api/auth/login?returnTo=/path: sends the browser to the issuer. */
    async login(req: ApiRequest, res: ApiResponse): Promise<void> {
      if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
      const start = await service.startLogin(first(req.query?.returnTo));
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Set-Cookie', start.setCookies);
      redirect(res, start.location);
    },

    /** GET /api/auth/callback: the issuer sends the browser back here. The code is exchanged on the server; the page never sees it again. */
    async callback(req: ApiRequest, res: ApiResponse): Promise<void> {
      if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
      const query = new URL(req.url ?? '/', 'http://localhost').searchParams;
      try {
        const done = await service.finishLogin(query, req.headers.cookie);
        res.setHeader('Set-Cookie', done.setCookies);
        redirect(res, done.returnTo);
      } catch (e) {
        const code = e instanceof LoginError ? e.code : 'exchange_failed';
        if (!(e instanceof LoginError)) log('login callback failed unexpectedly');
        redirect(res, `${LOGIN_ERROR_PATH}?code=${code}`);
      }
    },

    /** POST /api/auth/logout: ends the session on the server and clears the cookie. */
    async logout(req: ApiRequest, res: ApiResponse): Promise<void> {
      if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
      const check = checkStateChangingRequest(req.method, req.headers, config.appOrigin);
      if (!check.ok) {
        log(`logout refused: ${check.reason}`);
        res.status(403);
        res.json({ error: 'Forbidden' });
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Set-Cookie', await service.logout(req.headers.cookie));
      res.status(204);
      res.end();
    },

    /** GET /api/auth/me: who is logged in, for display. Never a token. */
    async me(req: ApiRequest, res: ApiResponse): Promise<void> {
      if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
      res.setHeader('Cache-Control', 'no-store');
      const resolved = await service.resolve(req.headers.cookie);
      res.status(200);
      res.json(resolved ? { authenticated: true, user: service.view(resolved.record) } : { authenticated: false });
    },
  };
}

export interface GraphqlHandlerDeps {
  config: SessionConfig;
  service: SessionService;
  /** The BFF address, read on every request (the same image serves every environment). */
  target: () => string | undefined;
  /** Test-only extra headers to forward (GRAPHQL_EXTRA_FORWARDED_HEADERS). */
  extraHeaders?: () => string | undefined;
  fetchImpl?: typeof fetch;
  log?: (event: string) => void;
}

/**
 * POST /api/graphql: the browser's only way to the BFF. Anything that is not a safe request must pass the CSRF checks; the session's access token
 * (renewed first if it is about to expire) becomes the bearer header; an anonymous request goes on without one, for the public pages.
 */
export function createGraphqlHandler({
  config,
  service,
  target,
  extraHeaders,
  fetchImpl,
  log = () => {},
}: GraphqlHandlerDeps) {
  return async function graphql(req: ApiRequest, res: ApiResponse): Promise<void> {
    const check = checkStateChangingRequest(req.method, req.headers, config.appOrigin);
    if (!check.ok) {
      log(`graphql request refused: ${check.reason}`);
      res.status(403);
      res.json({ error: 'Forbidden' });
      return;
    }

    let bearer: string | undefined;
    const resolved = await service.resolve(req.headers.cookie);
    if (resolved) {
      const result = await service.bearerFor(resolved);
      if (result.kind === 'token') bearer = result.token;
      else if (result.kind === 'ended') {
        // The session is over (renewal refused, or nothing to renew with). The request carries on anonymously, which a public query survives, so the
        // page would not learn of it from the answer: this header tells it, and it shows the login again.
        res.setHeader('Set-Cookie', service.clearSessionCookie());
        res.setHeader(SESSION_ENDED_HEADER, '1');
      } else {
        res.status(503);
        res.json({ error: 'Your login could not be renewed just now. Please try again.' });
        return;
      }
    }

    res.setHeader('Cache-Control', 'no-store');
    await proxyGraphql(req, res, target(), extraForwardedHeaders(extraHeaders?.()), fetchImpl, bearer);
  };
}

export interface GraphqlStreamHandlerDeps extends GraphqlHandlerDeps {
  /** How often an open stream asks whether its session is still live. Default 10 seconds. */
  sessionCheckMs?: number;
  /** The most streams this server process relays at once; beyond it a new one is refused with 503 and the screen polls. Default 500. */
  maxOpen?: number;
  /** The most streams one login (session) may have open at once; a further one is refused with 429. Ordering allows a vendor five. Default 5. */
  maxPerSession?: number;
  /** How many session checks in a row may fail before the stream is ended (see {@link KeepOpen}). Default 3. */
  maxFailedChecks?: number;
}

/**
 * POST /api/graphql-stream: the browser's way to a subscription (ADR-0021). It checks what the JSON route checks (CSRF, the session, renewal of an
 * access token that is about to expire, and the bearer header built on the server) and then relays the BFF's event stream as it arrives. A stream
 * ends when the BFF ends it (the token expired, the maximum age), when the browser leaves, or when the session ends (logout, idle or absolute
 * limit); the client then asks again and gets a renewed token. It needs a session: an anonymous caller is refused here instead of being sent on.
 */
export function createGraphqlStreamHandler({
  config,
  service,
  target,
  extraHeaders,
  fetchImpl,
  log = () => {},
  sessionCheckMs = 10_000,
  maxOpen = 500,
  maxPerSession = 5,
  maxFailedChecks = 3,
}: GraphqlStreamHandlerDeps) {
  let open = 0;
  const perSession = new Map<string, number>();
  return async function graphqlStream(req: ApiRequest, res: ApiResponse & StreamResponse): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
    const check = checkStateChangingRequest(req.method, req.headers, config.appOrigin);
    if (!check.ok) {
      log(`graphql stream refused: ${check.reason}`);
      res.status(403);
      res.json({ error: 'Forbidden' });
      return;
    }
    if (first(req.headers.accept) !== 'text/event-stream') {
      res.status(406);
      res.json({ error: 'This route serves event streams only' });
      return;
    }

    const resolved = await service.resolve(req.headers.cookie);
    if (!resolved) {
      res.status(401);
      res.json({ error: 'Please log in to continue.' });
      return;
    }
    const bearer = await service.bearerFor(resolved);
    if (bearer.kind === 'ended') {
      res.setHeader('Set-Cookie', service.clearSessionCookie());
      res.setHeader(SESSION_ENDED_HEADER, '1');
      res.status(401);
      res.json({ error: 'Please log in to continue.' });
      return;
    }
    if (bearer.kind !== 'token') {
      res.status(503);
      res.json({ error: 'Your login could not be renewed just now. Please try again.' });
      return;
    }
    // The body is read before the stream is counted (register item 126): a body sent slowly holds a connection, which the server's own timeouts
    // deal with, but not one of the places that other screens need.
    const read = await readRequestBody(req);
    if (!read.ok) {
      res.status(read.status);
      res.json({ error: read.error });
      return;
    }
    if (open >= maxOpen) {
      res.setHeader('Retry-After', '30');
      res.status(503);
      res.json({ error: 'Live updates are busy. Please poll instead.' });
      return;
    }
    if ((perSession.get(resolved.id) ?? 0) >= maxPerSession) {
      log('graphql stream refused: per-session limit');
      res.setHeader('Retry-After', '30');
      res.status(429);
      res.json({ error: 'This login has too many live screens open. Please poll instead.' });
      return;
    }

    open++;
    perSession.set(resolved.id, (perSession.get(resolved.id) ?? 0) + 1);
    try {
      await proxyGraphqlStream(req, res, target(), {
        extraHeaders: extraForwardedHeaders(extraHeaders?.()),
        ...(fetchImpl ? { fetchImpl } : {}),
        bearerToken: bearer.token,
        body: read.body,
        keepOpen: { check: () => service.isActive(resolved.id), everyMs: sessionCheckMs, maxFailures: maxFailedChecks },
      });
    } finally {
      open--;
      const left = (perSession.get(resolved.id) ?? 1) - 1;
      if (left <= 0) perSession.delete(resolved.id);
      else perSession.set(resolved.id, left);
    }
  };
}
