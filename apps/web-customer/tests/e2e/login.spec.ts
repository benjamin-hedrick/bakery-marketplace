import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { ConsoleMessage, Page, Request, Route } from '@playwright/test';

// S1-02: login in the browser. The issuer is stubbed inside the browser (page.route), so the whole Authorization Code + PKCE flow is checked
// deterministically here; the skeleton suite does the same against the real mock issuer.

const ISSUER = 'http://localhost:5100';
const APP = 'http://localhost:3000';

const b64url = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
function fakeToken(claims: Record<string, unknown> = {}) {
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
const challengeOf = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

interface Issuer {
  authorizeUrls: URL[];
  tokenBodies: URLSearchParams[];
}

/** Stubs the issuer: /authorize redirects straight back with a code; /token answers with `token`. */
async function stubIssuer(
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
async function authorizationOfNextGraphQL(page: Page, trigger: () => Promise<void>): Promise<string | undefined> {
  const request: Promise<Request> = page.waitForRequest((r) => r.url().includes('/api/graphql'));
  await trigger();
  return (await request).headers()['authorization'];
}

const refresh = (page: Page) => () => page.getByRole('button', { name: 'Refresh' }).click();

test('the header offers Log in in the server HTML, before any JavaScript runs', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
  await expect(page.getByTestId('user-name')).toHaveCount(0);
  await context.close();
});

test('logging in sends a PKCE request, exchanges the code with the verifier, and shows who is logged in', async ({
  page,
}) => {
  const issuer = await stubIssuer(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByTestId('user-name')).toHaveText('Alice Customer');
  await expect(page).toHaveURL(`${APP}/`);

  const authorize = issuer.authorizeUrls[0]!;
  expect(authorize.searchParams.get('response_type')).toBe('code');
  expect(authorize.searchParams.get('client_id')).toBe('web-customer');
  expect(authorize.searchParams.get('redirect_uri')).toBe(`${APP}/auth/callback`);
  expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
  expect(authorize.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{16,}$/);

  const exchange = issuer.tokenBodies[0]!;
  expect(exchange.get('grant_type')).toBe('authorization_code');
  expect(exchange.get('code')).toBe('code-1');
  expect(exchange.get('redirect_uri')).toBe(`${APP}/auth/callback`);
  const verifier = exchange.get('code_verifier')!;
  expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
  expect(authorize.searchParams.get('code_challenge')).toBe(challengeOf(verifier)); // the exchange proves it is the app that started the login
  expect(authorize.toString()).not.toContain(verifier); // and the verifier never travelled in the URL
});

test('the token is held in memory only: not in any storage or cookie, and a reload ends the login', async ({
  page,
  context,
}) => {
  const token = fakeToken();
  await stubIssuer(page, { token });
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByTestId('user-name')).toBeVisible();

  const stored = await page.evaluate(() =>
    JSON.stringify([{ ...localStorage }, { ...sessionStorage }, document.cookie]),
  );
  expect(stored).not.toContain(token.split('.')[2]);
  expect(stored).not.toContain('access_token');
  expect(JSON.stringify(await context.cookies())).not.toContain(token.split('.')[2]);
  expect(await page.evaluate(() => sessionStorage.getItem('bakery.auth.pending'))).toBeNull(); // the pending login was spent

  await page.reload(); // open item 24: no refresh token, so a reload is a logout
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
});

test('login returns to the page it was started from, and an unsafe destination falls back to the home page', async ({
  page,
}) => {
  await stubIssuer(page);
  await page.goto('/');
  await page.getByTestId('listing').first().getByRole('link').first().click();
  await expect(page).toHaveURL(/\/listings\//);
  const detailPath = new URL(page.url()).pathname;

  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByTestId('user-name')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(detailPath);
});

test('the token is sent to the BFF while logged in, and not before or after', async ({ page }) => {
  const token = fakeToken();
  await stubIssuer(page, { token });
  await page.goto('/');
  expect(await authorizationOfNextGraphQL(page, refresh(page))).toBeUndefined();

  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByTestId('user-name')).toBeVisible();
  expect(await authorizationOfNextGraphQL(page, refresh(page))).toBe(`Bearer ${token}`);

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
  expect(await authorizationOfNextGraphQL(page, refresh(page))).toBeUndefined();
});

test('when the BFF says the login is no longer accepted, the session ends and the page offers to log in', async ({
  page,
}) => {
  await stubIssuer(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByTestId('user-name')).toBeVisible();

  await page.route('**/api/graphql', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: null,
        errors: [{ message: 'Please log in to continue.', extensions: { code: 'UNAUTHENTICATED' } }],
      }),
    }),
  );
  await page.getByRole('button', { name: 'Refresh' }).click();

  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
  await expect(page.getByTestId('user-name')).toHaveCount(0);
});

test.describe('a login that cannot be completed leaves the user logged out, with a message and no token request', () => {
  test('a callback with nothing pending (a bookmarked or replayed callback URL)', async ({ page }) => {
    const issuer = await stubIssuer(page);
    await page.goto('/auth/callback?code=code-1&state=anything');
    await expect(page.getByTestId('login-error')).toContainText('no login in progress');
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
    expect(issuer.tokenBodies).toHaveLength(0);
  });

  test('a callback whose state is not the one we sent', async ({ page }) => {
    const issuer = await stubIssuer(page, { callbackQuery: () => 'code=code-1&state=forged' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByTestId('login-error')).toContainText('did not match');
    expect(issuer.tokenBodies).toHaveLength(0);
    await expect(page.getByTestId('user-name')).toHaveCount(0);
  });

  test('the issuer reporting an error', async ({ page }) => {
    const issuer = await stubIssuer(page, { callbackQuery: (state) => `error=access_denied&state=${state}` });
    await page.goto('/');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByTestId('login-error')).toContainText('not completed');
    expect(issuer.tokenBodies).toHaveLength(0);
  });

  test('a refused code exchange, and a token that is already expired', async ({ page }) => {
    await stubIssuer(page, { tokenStatus: 400 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByTestId('login-error')).toContainText('could not complete');
    await page.unroute(`${ISSUER}/token`);
    await stubIssuer(page, { token: fakeToken({ exp: 1 }) });
    await page.goto('/');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByTestId('login-error')).toContainText('could not complete');
    await expect(page.getByTestId('user-name')).toHaveCount(0);
  });

  test('a login link cannot be used to send the user to another site afterwards', async ({ page }) => {
    await stubIssuer(page);
    await page.goto('/');
    await page.evaluate(() => {
      // What a crafted link could try to leave behind for the callback: a pending login whose destination is another site.
      const pending = {
        state: 's-1',
        verifier: 'v'.repeat(43),
        returnTo: '//evil.example/steal',
        createdAt: Date.now(),
      };
      sessionStorage.setItem('bakery.auth.pending', JSON.stringify(pending));
    });
    await page.goto('/auth/callback?code=code-1&state=s-1');
    await expect(page).toHaveURL(`${APP}/`); // the home page of this app, not evil.example
    await expect(page.getByTestId('user-name')).toBeVisible();
  });
});

test('logging in and out produces no console warnings or errors', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await stubIssuer(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByTestId('user-name')).toBeVisible();
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
  expect(problems, problems.join('\n')).toEqual([]);
});
