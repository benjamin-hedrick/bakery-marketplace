import type { AuthConfig } from './login.ts';

/**
 * Where to log in. The defaults are the local mock issuer (docker compose, port 5100); a deployed environment sets the NEXT_PUBLIC_ values
 * at build time (they are public by definition: a public client has no secret, ADR-0006). `origin` is this app's own origin, from the browser.
 */
export function authConfig(origin: string): AuthConfig {
  const issuer = (process.env.NEXT_PUBLIC_AUTH_ISSUER ?? 'http://localhost:5100').replace(/\/+$/, '');
  return {
    authorizeUrl: `${issuer}/authorize`,
    tokenUrl: `${issuer}/token`,
    clientId: process.env.NEXT_PUBLIC_AUTH_CLIENT_ID ?? 'web-customer',
    redirectUri: `${origin}/auth/callback`,
  };
}
