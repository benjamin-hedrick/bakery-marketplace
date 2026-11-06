// Sign-in for the app (ADR-0023): authorization code with PKCE in the system browser. The access token lives in memory only; the refresh token
// lives in the Android Keystore (expo-secure-store) and is deleted on logout or when the issuer refuses it. Nothing is logged.
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { displayNameFromToken } from '@bakery/customer-core';
import { useSyncExternalStore } from 'react';
import { CLIENT_ID, ISSUER, REDIRECT_URI, SCOPE } from '../config';
import { newPkce, randomUrlSafe } from './pkce';

const REFRESH_KEY = 'bakery.refreshToken';
const EARLY_MS = 30_000; // renew a little before the access token ends

export type AuthState = 'starting' | 'signedOut' | 'signedIn';

interface Tokens {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

let state: AuthState = 'starting';
let accessToken: string | null = null;
// Who is signed in, for display only ("Signed in as ..."): read from the token's name claim, never used to decide anything (see customer-core identity.ts).
let displayName: string | null = null;
let expiresAt = 0;
type Outcome = 'ok' | 'refused' | 'unreachable';
let refreshing: Promise<Outcome> | null = null;
const listeners = new Set<() => void>();

function setState(next: AuthState) {
  if (state === next) return;
  state = next;
  listeners.forEach((l) => l());
}

export const useAuthState = (): AuthState =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );

/** The issuer's answer: tokens, 'refused' (it said no) or 'unreachable' (no answer, so nothing is learned about the token). */
/** The signed-in customer's name for display, or null when the token carries none or nobody is signed in. */
export const useSignedInName = (): string | null =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => displayName,
    () => displayName,
  );

async function postToken(body: Record<string, string>): Promise<Tokens | 'refused' | 'unreachable'> {
  try {
    const res = await fetch(`${ISSUER}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    });
    if (res.status >= 500) return 'unreachable'; // an outage says nothing about the token: keep it (register 151)
    if (!res.ok) return 'refused';
    const json = (await res.json()) as Tokens;
    return typeof json.access_token === 'string' ? json : 'refused';
  } catch {
    return 'unreachable';
  }
}

async function accept(tokens: Tokens) {
  accessToken = tokens.access_token;
  displayName = displayNameFromToken(tokens.id_token ?? tokens.access_token);
  expiresAt = Date.now() + (tokens.expires_in ?? 300) * 1000;
  if (tokens.refresh_token) await SecureStore.setItemAsync(REFRESH_KEY, tokens.refresh_token);
  setState('signedIn');
}

async function endSession() {
  accessToken = null;
  displayName = null;
  expiresAt = 0;
  await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => undefined);
  setState('signedOut');
}

/**
 * Uses the stored refresh token (the issuer renews it on use, ADR-0019). When the issuer refuses it (or there is none) the session ends and the token
 * is deleted. When the issuer cannot be reached the token is kept, so the customer is not logged out by a network problem.
 */
async function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const stored = await SecureStore.getItemAsync(REFRESH_KEY);
      if (!stored) return 'refused' as const;
      const tokens = await postToken({ grant_type: 'refresh_token', refresh_token: stored, client_id: CLIENT_ID });
      if (typeof tokens === 'string') return tokens;
      await accept(tokens);
      return 'ok' as const;
    } finally {
      refreshing = null;
    }
  })();
  const outcome = await refreshing;
  if (outcome === 'refused') await endSession();
  else if (outcome === 'unreachable' && state === 'starting') setState('signedOut'); // offline at start: the login screen, token kept
  return outcome === 'ok';
}

/** On app start: a stored refresh token signs the customer in again without the login screen. */
export async function restoreSession(): Promise<void> {
  const stored = await SecureStore.getItemAsync(REFRESH_KEY).catch(() => null);
  if (!stored) return setState('signedOut');
  await refresh();
}

/** The access token to send, renewed first when it is about to end. Null when there is no session. */
export async function currentAccessToken(): Promise<string | null> {
  if (accessToken && Date.now() < expiresAt - EARLY_MS) return accessToken;
  return (await refresh()) ? accessToken : null;
}

/** After an UNAUTHENTICATED answer: refresh once. False means the customer must sign in again (the state is now signedOut). */
export const renewAfterRejection = refresh;

/** Opens the issuer's login in the system browser (Custom Tabs), never an embedded web view. */
export async function signIn(): Promise<'ok' | 'cancelled' | 'failed'> {
  const { verifier, challenge } = await newPkce();
  const stateValue = randomUrlSafe(16);
  const url =
    `${ISSUER}/authorize?response_type=code&client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPE)}` +
    `&state=${stateValue}&code_challenge=${challenge}&code_challenge_method=S256`;
  const result = await WebBrowser.openAuthSessionAsync(url, REDIRECT_URI);
  if (result.type !== 'success') return 'cancelled';

  const returned = new URL(result.url);
  const code = returned.searchParams.get('code');
  if (returned.searchParams.get('state') !== stateValue || !code) return 'failed';
  const tokens = await postToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: verifier,
  });
  if (typeof tokens === 'string') return 'failed';
  await accept(tokens);
  return 'ok';
}

export async function signOut(): Promise<void> {
  await endSession();
}
