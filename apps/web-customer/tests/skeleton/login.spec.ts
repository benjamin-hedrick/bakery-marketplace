import { expect, test } from '@playwright/test';
import type { Request } from '@playwright/test';

// S1-02 against the real mock OIDC issuer (docker compose, port 5100) with the server-side session of ADR-0019: a real login page, a real signed token
// that only the web app's server holds, the code exchange done by that server, and a session kept in the cache Redis. Needs the whole local stack
// (the cache Redis is the compose profile with-redis); see README.

const authorizationOfNextGraphQL = async (trigger: () => Promise<void>, page: import('@playwright/test').Page) => {
  const request: Promise<Request> = page.waitForRequest((r) => r.url().includes('/api/graphql'));
  await trigger();
  return (await request).headers()['authorization'];
};

test('a customer logs in through the real issuer, holds only an opaque cookie, and logging out ends the session on the server', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in' }).click();

  // The issuer's own page, on another origin.
  await expect(page).toHaveURL(/localhost:5100\/authorize/);
  await page.getByRole('button', { name: 'Login as Alice Customer (Customer)' }).click();

  await expect(page).toHaveURL('http://localhost:3000/');
  await expect(page.getByTestId('user-name')).toHaveText('Alice Customer');

  // The browser sends no token (the server attaches the signed one), and holds only an HttpOnly cookie with an opaque id.
  expect(
    await authorizationOfNextGraphQL(() => page.getByRole('button', { name: 'Refresh' }).click(), page),
  ).toBeUndefined();
  const cookie = (await context.cookies()).find((c) => c.name === 'bakery-session-web-customer')!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const seenByScripts = await page.evaluate(() =>
    JSON.stringify([document.cookie, { ...localStorage }, { ...sessionStorage }, document.documentElement.outerHTML]),
  );
  expect(seenByScripts).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);

  // A reload keeps the login: the session is on the server.
  await page.reload();
  await expect(page.getByTestId('user-name')).toHaveText('Alice Customer');

  const reloaded = page.waitForEvent('load'); // logging out reloads the home page, so nothing fetched while logged in survives
  await page.getByRole('button', { name: 'Log out' }).click();
  await reloaded;
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
  const replay = await page.request.get('/api/auth/me', { headers: { cookie: `${cookie.name}=${cookie.value}` } });
  expect(await replay.json()).toEqual({ authenticated: false }); // the old cookie opens nothing
});

test('a callback with no login in progress is refused and nothing is exchanged', async ({ page }) => {
  // A bookmarked or replayed callback: the pending login was spent (or never existed), so the server sends the user to the error page.
  const response = await page.request.get('/api/auth/callback?code=used-before&state=whatever', { maxRedirects: 0 });

  expect(response.status()).toBe(302);
  expect(response.headers()['location']).toBe('/auth/error?code=no_pending');
  expect(response.headers()['set-cookie']).toBeUndefined();
});
