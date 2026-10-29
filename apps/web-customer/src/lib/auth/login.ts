import { safeReturnTo } from './return-to.ts';
import type { SessionStore } from './session.ts';

/** Authorization Code with PKCE for a public client (ADR-0006). The page does the whole flow; no server of ours sees the code or the token. */
export interface AuthConfig {
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  /** Where the issuer sends the user back to: this app's callback page. */
  redirectUri: string;
}

export interface LoginDeps {
  /** `sessionStorage`. Holds only the pending login (state, verifier, destination), never a token. */
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  session: SessionStore;
  now: () => number;
  random: (bytes?: number) => string;
  challenge: (verifier: string) => Promise<string>;
  config: AuthConfig;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
}

const PENDING_KEY = 'bakery.auth.pending';
const PENDING_MAX_AGE_MS = 10 * 60_000;

interface Pending {
  state: string;
  verifier: string;
  returnTo: string;
  createdAt: number;
}

export type LoginErrorCode =
  'no_pending' | 'state_mismatch' | 'expired' | 'issuer_error' | 'missing_code' | 'exchange_failed' | 'bad_token';

// Fixed text only: nothing the issuer says, and never a token, ends up in a message.
const MESSAGES: Record<LoginErrorCode, string> = {
  no_pending: 'There is no login in progress. Please start again.',
  state_mismatch: 'The login response did not match the request. Please start again.',
  expired: 'The login took too long. Please start again.',
  issuer_error: 'The login was not completed.',
  missing_code: 'The login response was incomplete. Please start again.',
  exchange_failed: 'We could not complete the login. Please try again.',
  bad_token: 'We could not complete the login. Please try again.',
};

export class LoginError extends Error {
  readonly code: LoginErrorCode;
  constructor(code: LoginErrorCode) {
    super(MESSAGES[code]);
    this.name = 'LoginError';
    this.code = code;
  }
}

/** Starts a login: remembers the verifier and state for this tab, and returns the issuer URL to send the browser to. */
export async function buildAuthorizeUrl(returnTo: string, deps: LoginDeps): Promise<string> {
  const verifier = deps.random(32);
  const state = deps.random(16);
  const pending: Pending = { state, verifier, returnTo: safeReturnTo(returnTo), createdAt: deps.now() };
  deps.storage.setItem(PENDING_KEY, JSON.stringify(pending));

  const url = new URL(deps.config.authorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', deps.config.clientId);
  url.searchParams.set('redirect_uri', deps.config.redirectUri);
  url.searchParams.set('scope', 'openid');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', await deps.challenge(verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

function takePending(deps: LoginDeps): Pending | null {
  const raw = deps.storage.getItem(PENDING_KEY);
  deps.storage.removeItem(PENDING_KEY); // one use only: a replayed callback finds nothing
  if (raw === null) return null;
  try {
    const p = JSON.parse(raw) as Partial<Pending>;
    return typeof p.state === 'string' && typeof p.verifier === 'string' && typeof p.createdAt === 'number'
      ? { state: p.state, verifier: p.verifier, createdAt: p.createdAt, returnTo: safeReturnTo(p.returnTo) }
      : null;
  } catch {
    return null;
  }
}

/** Finishes a login from the callback URL's query: checks the state, exchanges the code, and keeps the token in memory only. */
export async function completeLogin(search: URLSearchParams, deps: LoginDeps): Promise<{ returnTo: string }> {
  const pending = takePending(deps);
  if (pending === null) throw new LoginError('no_pending');
  if (search.get('state') !== pending.state) throw new LoginError('state_mismatch');
  if (deps.now() - pending.createdAt > PENDING_MAX_AGE_MS) throw new LoginError('expired');
  if (search.get('error') !== null) throw new LoginError('issuer_error');
  const code = search.get('code');
  if (!code) throw new LoginError('missing_code');

  let response: Response;
  try {
    response = await deps.fetch(deps.config.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: deps.config.redirectUri,
        code_verifier: pending.verifier,
        client_id: deps.config.clientId,
      }),
    });
  } catch {
    throw new LoginError('exchange_failed');
  }
  if (!response.ok) throw new LoginError('exchange_failed');

  try {
    const body = (await response.json()) as { access_token?: unknown };
    if (typeof body.access_token !== 'string') throw new Error('no token');
    deps.session.set(body.access_token);
  } catch {
    throw new LoginError('bad_token');
  }
  return { returnTo: pending.returnTo };
}
