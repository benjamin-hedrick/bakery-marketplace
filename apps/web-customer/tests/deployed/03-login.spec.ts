import type { Request } from '@playwright/test';
import { CUSTOMERS, SESSION_COOKIE, WEB, expect, logInAs, test } from './support';

// Test 4 of the deployed suite (register 218): the login on the web app's server (ADR-0019) over https, with the session in the sessions Redis and
// encrypted with the key from Key Vault. Never run over https before: the cookie must be the __Host- form, Secure and HttpOnly.

test('4. a customer logs in on the deployed issuer, holds only a __Host- Secure HttpOnly opaque cookie, and logging out ends the session', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in' }).click();
  await logInAs(page, CUSTOMERS.alice);
  await expect(page).toHaveURL(`${WEB}/`);
  await expect(page.getByTestId('user-name')).toHaveText(CUSTOMERS.alice);

  // The browser sends no token (the server attaches it) and holds only an opaque id.
  const graphql: Promise<Request> = page.waitForRequest((r) => r.url().includes('/api/graphql'));
  await page.getByRole('button', { name: 'Refresh' }).click();
  expect((await graphql).headers()['authorization']).toBeUndefined();
  const cookie = (await context.cookies()).find((c) => c.name === SESSION_COOKIE);
  expect(cookie, `the ${SESSION_COOKIE} cookie`).toBeDefined();
  expect(cookie!.httpOnly).toBe(true);
  expect(cookie!.secure).toBe(true);
  expect(cookie!.path).toBe('/');
  expect(cookie!.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const seenByScripts = await page.evaluate(() =>
    JSON.stringify([document.cookie, { ...localStorage }, { ...sessionStorage }, document.documentElement.outerHTML]),
  );
  expect(seenByScripts).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/); // no token anywhere a script can read

  await page.reload(); // the session is on the server
  await expect(page.getByTestId('user-name')).toHaveText(CUSTOMERS.alice);

  const reloaded = page.waitForEvent('load');
  await page.getByRole('button', { name: 'Log out' }).click();
  await reloaded;
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
  const replay = await page.request.get('/api/auth/me', { headers: { cookie: `${cookie!.name}=${cookie!.value}` } });
  expect(await replay.json()).toEqual({ authenticated: false }); // the old cookie opens nothing
});

test('4b. a callback with no login in progress is refused and nothing is exchanged', async ({ page }) => {
  const response = await page.request.get('/api/auth/callback?code=used-before&state=whatever', { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  expect(response.headers()['location']).toBe('/auth/error?code=no_pending');
  expect(response.headers()['set-cookie']).toBeUndefined();
});
