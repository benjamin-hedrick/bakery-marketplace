import type { SessionConfig } from './config.ts';

// The server's side of the login (ADR-0019): the authorize address, the code exchange and the refresh, against the issuer's token endpoint
// (`<issuer>/token`, the mock issuer's layout). A public client with PKCE (the lead's decision), so no secret is sent. Nothing a token endpoint
// says is copied into an error: the fixed reason codes below are all a caller gets.

export interface TokenSet {
  accessToken: string;
  refreshToken: string | undefined;
  /** Seconds the access token lives, as the issuer said. */
  expiresInSeconds: number;
}

/** `invalid_grant`: the issuer will not accept this code or refresh token (used, expired, revoked). `unavailable`: no answer or a server error. */
export type TokenFailure = 'invalid_grant' | 'rejected' | 'unavailable';

export class TokenError extends Error {
  readonly reason: TokenFailure;
  constructor(reason: TokenFailure) {
    super(`The token endpoint did not give a token (${reason}).`);
    this.name = 'TokenError';
    this.reason = reason;
  }
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export function buildAuthorizeUrl(config: SessionConfig, state: string, challenge: string): string {
  const url = new URL(`${config.issuerBrowser}/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('scope', config.scope);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

async function requestTokens(
  config: SessionConfig,
  body: Record<string, string>,
  fetchImpl: FetchLike,
): Promise<TokenSet> {
  let response: Response;
  try {
    response = await fetchImpl(`${config.issuerServer}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ ...body, client_id: config.clientId }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new TokenError('unavailable');
  }

  if (response.status >= 500) throw new TokenError('unavailable');
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new TokenError(response.ok ? 'unavailable' : 'rejected');
  }
  const fields = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>;
  if (!response.ok) throw new TokenError(fields['error'] === 'invalid_grant' ? 'invalid_grant' : 'rejected');

  const accessToken = fields['access_token'];
  const expiresIn = fields['expires_in'];
  const refreshToken = fields['refresh_token'];
  if (
    typeof accessToken !== 'string' ||
    typeof expiresIn !== 'number' ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  ) {
    throw new TokenError('unavailable');
  }
  return {
    accessToken,
    refreshToken: typeof refreshToken === 'string' ? refreshToken : undefined,
    expiresInSeconds: expiresIn,
  };
}

export function exchangeCode(
  config: SessionConfig,
  code: string,
  verifier: string,
  fetchImpl: FetchLike = fetch,
): Promise<TokenSet> {
  return requestTokens(
    config,
    { grant_type: 'authorization_code', code, redirect_uri: config.redirectUri, code_verifier: verifier },
    fetchImpl,
  );
}

export function refreshTokens(
  config: SessionConfig,
  refreshToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<TokenSet> {
  return requestTokens(config, { grant_type: 'refresh_token', refresh_token: refreshToken }, fetchImpl);
}
