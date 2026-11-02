import { randomBytes } from 'node:crypto';
import type { SessionConfig } from './config.ts';
import { clearCookie, readCookie, serializeCookie } from './cookie.ts';
import { parseClaims } from './claims.ts';
import { buildAuthorizeUrl, exchangeCode, refreshTokens, TokenError, type FetchLike, type TokenSet } from './oidc.ts';
import { challengeFor } from './pkce.ts';
import { safeReturnTo } from './return-to.ts';
import type { SessionStore } from './store.ts';
import type { SessionRecord, SessionView } from './types.ts';

export type LoginErrorCode =
  'no_pending' | 'state_mismatch' | 'expired' | 'issuer_error' | 'missing_code' | 'exchange_failed' | 'bad_token';

// Fixed text only: nothing the issuer says, and never a token, ends up in a message.
export const LOGIN_MESSAGES: Record<LoginErrorCode, string> = {
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
    super(LOGIN_MESSAGES[code]);
    this.name = 'LoginError';
    this.code = code;
  }
}

export interface LoginStart {
  location: string;
  setCookies: string[];
}

export interface LoginFinish {
  returnTo: string;
  setCookies: string[];
}

export type BearerResult =
  | { kind: 'token'; token: string }
  /** The session is over (the issuer refused the renewal, or there is nothing to renew with). It has been deleted. */
  | { kind: 'ended' }
  /** The token needs renewing and the issuer cannot be reached; try again. */
  | { kind: 'unavailable' };

/** The session as found for a request. */
export interface ResolvedSession {
  id: string;
  record: SessionRecord;
}

export interface Clock {
  now(): number;
}

export interface SessionServiceDeps {
  config: SessionConfig;
  store: SessionStore;
  fetch?: FetchLike;
  clock?: Clock;
  /** Random url-safe string of `bytes` bytes. */
  random?: (bytes: number) => string;
  /** Called with a short reason code on notable events; never with a token, a code or a session id. */
  log?: (event: string) => void;
}

const TOUCH_EVERY_MS = 60_000;
const LOCK_MS = 10_000;
const WAIT_FOR_OTHER_RENEWAL_MS = 3_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createSessionService({
  config,
  store,
  fetch: fetchImpl = fetch,
  clock = { now: Date.now },
  random,
  log = () => {},
}: SessionServiceDeps) {
  const newRandom = random ?? ((bytes: number) => randomBytes(bytes).toString('base64url'));
  const secure = config.cookieSecure;
  const renewing = new Map<string, Promise<BearerResult>>();

  const sessionCookie = (id: string) =>
    serializeCookie(config.sessionCookieName, id, { secure, maxAgeSeconds: config.absoluteSeconds });

  function recordFrom(tokens: TokenSet, previous?: SessionRecord): SessionRecord | null {
    const claims = parseClaims(tokens.accessToken);
    if (claims === null) return null;
    const now = clock.now();
    return {
      subject: claims.subject,
      name: claims.name,
      email: claims.email,
      roles: claims.roles,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? previous?.refreshToken,
      accessExpiresAt: Math.min(claims.expiresAt, now + tokens.expiresInSeconds * 1000),
      createdAt: previous?.createdAt ?? now,
      lastSeenAt: now,
      absoluteExpiresAt: previous?.absoluteExpiresAt ?? now + config.absoluteSeconds * 1000,
    };
  }

  const expired = (record: SessionRecord) =>
    clock.now() >= record.absoluteExpiresAt || clock.now() >= record.lastSeenAt + config.idleSeconds * 1000;

  return {
    /** Starts a login: the verifier and state stay on the server; the browser gets only the id of the pending record. */
    async startLogin(returnTo: string | undefined): Promise<LoginStart> {
      const state = newRandom(16);
      const verifier = newRandom(32);
      const pendingId = newRandom(32);
      await store.putPending(
        pendingId,
        { state, verifier, returnTo: safeReturnTo(returnTo), createdAt: clock.now() },
        config.pendingSeconds,
      );
      return {
        location: buildAuthorizeUrl(config, state, await challengeFor(verifier)),
        setCookies: [
          serializeCookie(config.loginCookieName, pendingId, { secure, maxAgeSeconds: config.pendingSeconds }),
        ],
      };
    },

    /** Finishes a login from the callback's query string and the browser's cookies. Throws LoginError with a fixed message. */
    async finishLogin(query: URLSearchParams, cookieHeader: string | string[] | undefined): Promise<LoginFinish> {
      const pendingId = readCookie(cookieHeader, config.loginCookieName);
      const pending = pendingId ? await store.takePending(pendingId) : null; // taken: a replayed callback finds nothing
      const clearLogin = clearCookie(config.loginCookieName, secure);
      if (pending === null) throw new LoginError('no_pending');
      if (query.get('state') !== pending.state) throw new LoginError('state_mismatch');
      if (clock.now() - pending.createdAt > config.pendingSeconds * 1000) throw new LoginError('expired');
      if (query.get('error') !== null) throw new LoginError('issuer_error');
      const code = query.get('code');
      if (!code) throw new LoginError('missing_code');

      let tokens: TokenSet;
      try {
        tokens = await exchangeCode(config, code, pending.verifier, fetchImpl);
      } catch (e) {
        log(`login exchange failed: ${e instanceof TokenError ? e.reason : 'error'}`);
        throw new LoginError('exchange_failed');
      }
      const record = recordFrom(tokens);
      if (record === null) throw new LoginError('bad_token');

      const id = newRandom(32); // a new id at every login: nothing that existed before the login is carried into the session
      await store.create(id, record);
      return { returnTo: pending.returnTo, setCookies: [sessionCookie(id), clearLogin] };
    },

    /** The session behind a request's cookie, or null. A session past its idle or absolute limit is deleted. */
    async resolve(cookieHeader: string | string[] | undefined): Promise<ResolvedSession | null> {
      const id = readCookie(cookieHeader, config.sessionCookieName);
      if (!id) return null;
      const record = await store.get(id);
      if (record === null) return null;
      if (expired(record)) {
        await store.delete(id);
        return null;
      }
      if (clock.now() - record.lastSeenAt > TOUCH_EVERY_MS) {
        const touched = { ...record, lastSeenAt: clock.now() };
        await store.save(id, touched);
        return { id, record: touched };
      }
      return { id, record };
    },

    view(record: SessionRecord): SessionView {
      return {
        subject: record.subject,
        name: record.name,
        email: record.email,
        roles: record.roles,
        sessionExpiresAt: Math.min(record.absoluteExpiresAt, record.lastSeenAt + config.idleSeconds * 1000),
      };
    },

    /**
     * The access token to send to the BFF for this session, renewed first if it is within the margin of expiring. Renewal happens once per session
     * at a time: concurrent callers in this process share one promise, and other instances wait on a lock in the store and then read the result.
     */
    async bearerFor(resolved: ResolvedSession): Promise<BearerResult> {
      const { id, record } = resolved;
      if (record.accessExpiresAt - clock.now() > config.refreshMarginSeconds * 1000)
        return { kind: 'token', token: record.accessToken };

      const running = renewing.get(id);
      if (running) return running;
      const promise = renew(id).finally(() => renewing.delete(id));
      renewing.set(id, promise);
      return promise;
    },

    /** Ends the session behind the request's cookie (if any) and returns the Set-Cookie that clears it. */
    async logout(cookieHeader: string | string[] | undefined): Promise<string> {
      const id = readCookie(cookieHeader, config.sessionCookieName);
      if (id) await store.delete(id);
      return clearCookie(config.sessionCookieName, secure);
    },

    clearSessionCookie: () => clearCookie(config.sessionCookieName, secure),

    /** Ends every session of one person (a vendor suspended, a lost device). */
    endSessionsOf: (subject: string) => store.deleteBySubject(subject),
  };

  async function renew(id: string): Promise<BearerResult> {
    const release = await store.acquireLock(id, LOCK_MS);
    if (release === null) {
      // Another instance is renewing this session: wait for its result instead of using the refresh token a second time.
      for (let waited = 0; waited < WAIT_FOR_OTHER_RENEWAL_MS; waited += 100) {
        await sleep(100);
        const current = await store.get(id);
        if (current === null) return { kind: 'ended' };
        if (current.accessExpiresAt - clock.now() > config.refreshMarginSeconds * 1000)
          return { kind: 'token', token: current.accessToken };
      }
      return { kind: 'unavailable' };
    }

    try {
      const record = await store.get(id); // read again under the lock: another instance may have just renewed
      if (record === null || expired(record)) {
        await store.delete(id);
        return { kind: 'ended' };
      }
      if (record.accessExpiresAt - clock.now() > config.refreshMarginSeconds * 1000)
        return { kind: 'token', token: record.accessToken };
      if (record.refreshToken === undefined) {
        if (clock.now() < record.accessExpiresAt) return { kind: 'token', token: record.accessToken };
        await store.delete(id);
        return { kind: 'ended' };
      }

      try {
        const tokens = await refreshTokens(config, record.refreshToken, fetchImpl);
        const next = recordFrom(tokens, record);
        if (next === null || next.subject !== record.subject) {
          await store.delete(id); // a renewal must be for the same person; anything else ends the session
          log('renewal returned a token for another subject or an unreadable one');
          return { kind: 'ended' };
        }
        await store.save(id, next);
        return { kind: 'token', token: next.accessToken };
      } catch (e) {
        const reason = e instanceof TokenError ? e.reason : 'unavailable';
        log(`renewal failed: ${reason}`);
        if (reason === 'invalid_grant' || reason === 'rejected') {
          await store.delete(id); // refused or reused: the login is over
          return { kind: 'ended' };
        }
        // The issuer cannot be reached: a token that is still valid keeps working until it is not.
        return clock.now() < record.accessExpiresAt
          ? { kind: 'token', token: record.accessToken }
          : { kind: 'unavailable' };
      }
    } finally {
      await release();
    }
  }
}

export type SessionService = ReturnType<typeof createSessionService>;
