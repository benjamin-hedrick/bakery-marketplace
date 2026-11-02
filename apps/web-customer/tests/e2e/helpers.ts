import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// Shared by the browser tests that need a logged-in customer. The login runs for real (ADR-0019): the page sends the browser to
// /api/auth/login, the app's server talks to the fake issuer (packages/web-session/test-support/fake-issuer.mjs) and sets the session cookie.
// The issuer and the mock BFF are steered through their control endpoints.

export const ISSUER = 'http://localhost:5101';
export const APP = 'http://localhost:3000';
export const MOCK = 'http://localhost:4000';

export interface IssuerSeen {
  user: string;
  mode: string;
  accessSeconds: number;
  authorize: Record<string, string>[];
  tokens: { grant: string; clientId: string | null; hasSecret: boolean; hasVerifier: boolean }[];
}

const post = async (url: string, body: unknown) => {
  const res = await fetch(url, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${url} did not take the state`);
};

/** Sets who logs in at the fake issuer, how long a token lives, and how it misbehaves (ok | down | revoked | bad-exchange | denied | forged-state). */
export const setIssuer = (state: {
  user?: 'vendor' | 'customer';
  accessSeconds?: number;
  refreshable?: boolean;
  mode?: string;
}) => post(`${ISSUER}/__state`, state);

export async function issuerSeen(): Promise<IssuerSeen> {
  return (await fetch(`${ISSUER}/__state`)).json();
}

/** What the mock BFF was sent as Authorization, in order (null: none). Reset by the next POST /__control. */
export async function bffAuthorizations(): Promise<(string | null)[]> {
  return ((await (await fetch(`${MOCK}/__seen`)).json()) as { authorizations: (string | null)[] }).authorizations;
}

/** Forgets what the mock BFF has been sent so far. */
export const forgetBffAuthorizations = () => fetch(`${MOCK}/__seen`, { method: 'DELETE' });

/** Starts a test with a fresh issuer: Alice Customer logs in, tokens last an hour, nothing recorded. (Kept under its old name; it no longer stubs anything.) */
export async function stubIssuer(
  _page: Page,
  opts: { user?: 'vendor' | 'customer'; accessSeconds?: number; mode?: string } = {},
): Promise<void> {
  await post(`${ISSUER}/__reset`, {});
  await setIssuer({ user: 'customer', ...opts });
}

/** Logs out, which reloads the home page (so nothing the page learned while logged in survives), and waits for that reload. */
export async function logOut(page: Page) {
  const reloaded = page.waitForEvent('load');
  await page.getByRole('button', { name: 'Log out' }).click();
  await reloaded;
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
}

/** Logs in through the fake issuer from whatever page is open, and waits until the header shows the user. */
export async function logIn(page: Page) {
  await page.getByRole('button', { name: 'Log in' }).first().click();
  await expect(page.getByTestId('user-name')).toBeVisible();
}
