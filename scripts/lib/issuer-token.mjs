// A real access token from the local mock issuer by the authorization code + PKCE exchange, without a browser: the same two requests a client makes
// (the login page's form post, then the token request). Shared by the scripts that call the BFF or a service as a seeded user (the load test, the latency
// measurement, the Maestro flow-control server, the film). Local only: the mock issuer signs for anyone who asks.
import { createHash, randomBytes } from 'node:crypto';

export const WEB_REDIRECT = 'http://localhost:3000/api/auth/callback';

/**
 * @param {string} issuer       the issuer's address, e.g. http://localhost:5100
 * @param {string} userId       a mock user's id (MockUsers in tools/BakeryMarketplace.Auth)
 * @param {{redirectUri?: string, clientId?: string}} [options]  the redirect address the issuer has registered for this client (the web app's by default)
 */
export async function userToken(issuer, userId, { redirectUri = WEB_REDIRECT, clientId } = {}) {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const submit = await fetch(`${issuer}/authorize/submit`, {
    method: 'POST',
    redirect: 'manual',
    body: new URLSearchParams({
      userId,
      redirect_uri: redirectUri,
      state: randomBytes(8).toString('base64url'),
      code_challenge: challenge,
      code_challenge_method: 'S256',
      ...(clientId ? { client_id: clientId } : {}),
    }),
  });
  const location = submit.headers.get('location');
  if (submit.status !== 302 || !location) throw new Error(`the issuer did not redirect (${submit.status})`);
  const code = new URL(location).searchParams.get('code');
  if (!code) throw new Error('the issuer sent no code');
  const token = await fetch(`${issuer}/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      ...(clientId ? { client_id: clientId } : {}),
    }),
  });
  if (!token.ok) throw new Error(`the token request failed (${token.status})`);
  const json = await token.json();
  if (typeof json.access_token !== 'string') throw new Error('the issuer sent no access token');
  return json.access_token;
}
