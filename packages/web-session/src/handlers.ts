import type { IncomingHttpHeaders } from 'node:http';
import type { SessionConfig } from './config.ts';
import { checkStateChangingRequest } from './csrf.ts';
import { extraForwardedHeaders, proxyGraphql, type ProxyRequest, type ProxyResponse } from './graphql-proxy.ts';
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

/** Where a failed login is sent: the app shows the fixed message for the code. */
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
      else if (result.kind === 'ended')
        res.setHeader('Set-Cookie', service.clearSessionCookie()); // carries on anonymously: the BFF will say UNAUTHENTICATED
      else {
        res.status(503);
        res.json({ error: 'Your login could not be renewed just now. Please try again.' });
        return;
      }
    }

    res.setHeader('Cache-Control', 'no-store');
    await proxyGraphql(req, res, target(), extraForwardedHeaders(extraHeaders?.()), fetchImpl, bearer);
  };
}
