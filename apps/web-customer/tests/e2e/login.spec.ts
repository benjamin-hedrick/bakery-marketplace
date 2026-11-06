import { expect, test } from '@playwright/test';
import type { ConsoleMessage, Page } from '@playwright/test';
import {
  APP,
  bffAuthorizations,
  forgetBffAuthorizations,
  issuerSeen,
  logIn,
  logOut,
  setIssuer,
  stubIssuer,
} from './helpers';

// S1-02 with the server-side session of ADR-0019. The login is real: the page goes to /api/auth/login, the app's server talks to the fake issuer
// and sets an HttpOnly cookie. The skeleton suite does the same against the real mock issuer.

const refresh = (page: Page) => page.getByRole('button', { name: 'Refresh' }).click();

test('logging in sends a PKCE request from the server, exchanges the code with the verifier and no secret, and shows who is logged in', async ({
  page,
}) => {
  await stubIssuer(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByTestId('user-name')).toHaveText('Alice Customer');
  await expect(page).toHaveURL(`${APP}/`);

  const seen = await issuerSeen();
  const authorize = seen.authorize[0]!;
  expect(authorize['response_type']).toBe('code');
  expect(authorize['client_id']).toBe('web-customer');
  expect(authorize['redirect_uri']).toBe(`${APP}/api/auth/callback`);
  expect(authorize['code_challenge_method']).toBe('S256');
  expect(authorize['scope']).toBe('openid offline_access');
  expect(authorize['state']).toMatch(/^[A-Za-z0-9_-]{16,}$/);
  expect(seen.tokens).toHaveLength(1); // the exchange was done by the server, once
  expect(seen.tokens[0]).toMatchObject({
    grant: 'authorization_code',
    clientId: 'web-customer',
    hasSecret: false,
    hasVerifier: true,
  });
});

test('the browser holds no token: only an HttpOnly cookie with an opaque id, and a reload keeps the login', async ({
  page,
  context,
}) => {
  await stubIssuer(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByTestId('user-name')).toBeVisible();

  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name === 'bakery-session-web-customer');
  expect(session).toBeTruthy();
  expect(session!.httpOnly).toBe(true);
  expect(session!.sameSite).toBe('Lax');
  expect(session!.path).toBe('/');
  expect(session!.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(cookies.some((c) => c.name.includes('login'))).toBe(false); // the pending-login cookie was cleared
  const seenByScripts = await page.evaluate(() =>
    JSON.stringify([document.cookie, { ...localStorage }, { ...sessionStorage }, document.documentElement.outerHTML]),
  );
  expect(seenByScripts).not.toContain(session!.value);
  expect(seenByScripts).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/); // no JWT anywhere the page can see
  expect(seenByScripts).not.toMatch(/refresh_token/i);

  await page.reload();

  await expect(page.getByTestId('user-name')).toHaveText('Alice Customer');
  expect((await issuerSeen()).tokens.filter((t) => t.grant === 'authorization_code')).toHaveLength(1); // no second login
});

test('login returns to the page it was started from', async ({ page }) => {
  await stubIssuer(page);
  await page.goto('/');
  await page.getByTestId('listing').first().getByRole('link').first().click();
  await expect(page).toHaveURL(/\/listings\//);
  const detailPath = new URL(page.url()).pathname;

  await page.getByRole('button', { name: 'Log in' }).click();

  await expect(page).toHaveURL(`${APP}${detailPath}`);
  await expect(page.getByTestId('user-name')).toBeVisible();
});

test('a login link cannot be used to send the user to another site afterwards', async ({ page }) => {
  for (const returnTo of ['https://evil.example/steal', '//evil.example/steal', '/\\evil.example', '/auth/callback']) {
    await stubIssuer(page);
    await page.context().clearCookies();

    await page.goto(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);

    await expect(page).toHaveURL(`${APP}/`); // the home page of this app, never the address in the link
    await expect(page.getByTestId('user-name')).toBeVisible();
  }
});

test('the bearer token is built on the server while logged in, and is absent before and after', async ({ page }) => {
  await stubIssuer(page);
  await page.goto('/');
  await forgetBffAuthorizations();
  await refresh(page);
  await expect.poll(async () => (await bffAuthorizations()).length).toBeGreaterThan(0);
  expect((await bffAuthorizations()).every((a) => a === null)).toBe(true); // anonymous: no header

  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByTestId('user-name')).toBeVisible();
  await forgetBffAuthorizations();
  await refresh(page);
  await expect.poll(async () => (await bffAuthorizations()).length).toBeGreaterThan(0);
  expect((await bffAuthorizations()).every((a) => /^Bearer eyJ/.test(a ?? ''))).toBe(true);

  await logOut(page);
  await forgetBffAuthorizations();
  await refresh(page);
  await expect.poll(async () => (await bffAuthorizations()).length).toBeGreaterThan(0);
  expect((await bffAuthorizations()).every((a) => a === null)).toBe(true);
});

test('logging out ends the session on the server: the old cookie opens nothing', async ({ page, context }) => {
  await stubIssuer(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByTestId('user-name')).toBeVisible();
  const before = (await context.cookies()).find((c) => c.name === 'bakery-session-web-customer')!;

  await logOut(page);

  const replay = await page.request.get('/api/auth/me', { headers: { cookie: `${before.name}=${before.value}` } });
  expect(await replay.json()).toEqual({ authenticated: false });
});

test('when the BFF says the login is no longer accepted, the page offers to log in', async ({ page }) => {
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

test('an access token about to expire is renewed on the server, and a refused renewal ends the session', async ({
  page,
}) => {
  await stubIssuer(page, { accessSeconds: 30 }); // inside the 60 second margin: every call renews
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByTestId('user-name')).toBeVisible();

  await refresh(page);
  await expect
    .poll(async () => (await issuerSeen()).tokens.filter((t) => t.grant === 'refresh_token').length)
    .toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId('user-name')).toBeVisible(); // the user did not notice

  await setIssuer({ mode: 'revoked' });
  await refresh(page);
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
});

test.describe('a login that cannot be completed leaves the user logged out, with a message and no session', () => {
  test('a callback with nothing pending (a bookmarked or replayed callback URL)', async ({ page }) => {
    await stubIssuer(page);
    await page.goto('/api/auth/callback?code=code-1&state=anything');
    await expect(page).toHaveURL(/\/auth\/error\?code=no_pending$/);
    await expect(page.getByTestId('login-error')).toContainText('no login in progress');
    await expect((await issuerSeen()).tokens).toHaveLength(0);
  });

  test('a callback whose state is not the one we sent', async ({ page }) => {
    await stubIssuer(page, { mode: 'forged-state' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/auth\/error\?code=state_mismatch$/);
    await expect(page.getByTestId('login-error')).toContainText('did not match');
    expect((await issuerSeen()).tokens).toHaveLength(0); // the code was never exchanged
    await page.goto('/');
    await expect(page.getByTestId('user-name')).toHaveCount(0);
  });

  test('the issuer reporting an error', async ({ page }) => {
    await stubIssuer(page, { mode: 'denied' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/auth\/error\?code=issuer_error$/);
    await expect(page.getByTestId('login-error')).toContainText('not completed');
    expect((await issuerSeen()).tokens).toHaveLength(0);
  });

  test('a refused code exchange', async ({ page }) => {
    await stubIssuer(page, { mode: 'bad-exchange' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/auth\/error\?code=exchange_failed$/);
    await expect(page.getByTestId('login-error')).toContainText('could not complete');
    await expect(page.getByTestId('login-error')).not.toContainText('invalid_grant');
    await page.goto('/');
    await expect(page.getByTestId('user-name')).toHaveCount(0);
  });
});

test('a forged cross-origin post to the GraphQL route, and a browser Authorization header, never reach the BFF as the user', async ({
  page,
}) => {
  await stubIssuer(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByTestId('user-name')).toBeVisible();
  // The page's own calls after login (profile, listings) must have finished, or one lands after the reset below and
  // is counted as a forged request. This was a race that failed on the slower pipeline agent.
  await page.waitForLoadState('networkidle');
  await forgetBffAuthorizations();
  const body = JSON.stringify({ query: '{ __typename }' });

  const wrongOrigin = await page.request.post('/api/graphql', {
    headers: { origin: 'http://evil.example', 'content-type': 'application/json' },
    data: body,
  });
  const noOrigin = await page.request.post('/api/graphql', {
    headers: { 'content-type': 'application/json' },
    data: body,
  });
  const formPost = await page.request.post('/api/graphql', {
    headers: { origin: APP, 'content-type': 'application/x-www-form-urlencoded' },
    data: 'a=b',
  });
  expect([wrongOrigin.status(), noOrigin.status(), formPost.status()]).toEqual([403, 403, 403]);
  expect(await bffAuthorizations()).toEqual([]); // none of them reached the BFF

  await page.request.post('/api/graphql', {
    headers: { origin: APP, 'content-type': 'application/json', authorization: 'Bearer forged-by-the-browser' },
    data: body,
  });
  const seen = await bffAuthorizations();
  expect(seen).toHaveLength(1);
  expect(seen[0]).toMatch(/^Bearer eyJ/);
  expect(seen[0]).not.toContain('forged');
});

test('logging in and out produces no console warnings or errors', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await stubIssuer(page);
  await page.goto('/');
  await logIn(page);
  await logOut(page);
  expect(problems, problems.join('\n')).toEqual([]);
});
