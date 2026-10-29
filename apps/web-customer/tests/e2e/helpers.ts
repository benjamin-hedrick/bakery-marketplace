import { expect } from '@playwright/test';
import type { Page, Request, Route } from '@playwright/test';

// Shared by the browser tests that need a logged-in customer without the real issuer: the issuer is stubbed inside the browser
// (page.route), so the whole Authorization Code + PKCE flow runs for real in the page, and the token is a fake with the right claims.

export const ISSUER = 'http://localhost:5100';
export const APP = 'http://localhost:3000';

const b64url = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');

export function fakeToken(claims: Record<string, unknown> = {}) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const payload = {
    sub: 'user-customer-1',
    name: 'Alice Customer',
    email: 'alice@customer.local',
    roles: 'Customer',
    exp,
    ...claims,
  };
  return `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url(payload)}.${Buffer.from('not-a-real-signature').toString('base64url')}`;
}

export interface Issuer {
  authorizeUrls: URL[];
  tokenBodies: URLSearchParams[];
}

/** Stubs the issuer: /authorize redirects straight back with a code; /token answers with `token`. */
export async function stubIssuer(
  page: Page,
  opts: { token?: string; tokenStatus?: number; callbackQuery?: (state: string) => string } = {},
): Promise<Issuer> {
  const seen: Issuer = { authorizeUrls: [], tokenBodies: [] };
  await page.route(`${ISSUER}/authorize*`, async (route: Route) => {
    const url = new URL(route.request().url());
    seen.authorizeUrls.push(url);
    const query =
      opts.callbackQuery?.(url.searchParams.get('state')!) ?? `code=code-1&state=${url.searchParams.get('state')}`;
    await route.fulfill({ status: 302, headers: { location: `${APP}/auth/callback?${query}` } });
  });
  await page.route(`${ISSUER}/token`, async (route: Route) => {
    seen.tokenBodies.push(new URLSearchParams(route.request().postData() ?? ''));
    const ok = (opts.tokenStatus ?? 200) === 200;
    await route.fulfill({
      status: opts.tokenStatus ?? 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': APP },
      body: JSON.stringify(
        ok
          ? { access_token: opts.token ?? fakeToken(), token_type: 'Bearer', expires_in: 3600 }
          : { error: 'invalid_grant' },
      ),
    });
  });
  return seen;
}

/** The Authorization header of the next GraphQL call the page makes after `trigger`. */
export async function authorizationOfNextGraphQL(
  page: Page,
  trigger: () => Promise<void>,
): Promise<string | undefined> {
  const request: Promise<Request> = page.waitForRequest((r) => r.url().includes('/api/graphql'));
  await trigger();
  return (await request).headers()['authorization'];
}

/** Logs in through the stubbed issuer from whatever page is open, and waits until the header shows the user. */
export async function logIn(page: Page) {
  await page.getByRole('button', { name: 'Log in' }).first().click();
  await expect(page.getByTestId('user-name')).toBeVisible();
}
