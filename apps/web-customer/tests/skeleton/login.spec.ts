import { expect, test } from '@playwright/test';
import type { Request } from '@playwright/test';

// S1-02 against the real mock OIDC issuer (docker compose, port 5100): a real login page, a real signed token, and the real cross-origin
// token exchange (so this also proves the issuer answers the web app's origin). Needs the whole local stack; see README.

const authorizationOfNextGraphQL = async (trigger: () => Promise<void>, page: import('@playwright/test').Page) => {
  const request: Promise<Request> = page.waitForRequest((r) => r.url().includes('/api/graphql'));
  await trigger();
  return (await request).headers()['authorization'];
};

test('a customer logs in through the real issuer, the BFF call carries a signed token for them, and logging out removes it', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in' }).click();

  // The issuer's own page, on another origin.
  await expect(page).toHaveURL(/localhost:5100\/authorize/);
  await page.getByRole('button', { name: 'Login as Alice Customer (Customer)' }).click();

  await expect(page).toHaveURL('http://localhost:3000/');
  await expect(page.getByTestId('user-name')).toHaveText('Alice Customer');

  const header = await authorizationOfNextGraphQL(() => page.getByRole('button', { name: 'Refresh' }).click(), page);
  expect(header).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  const claims = JSON.parse(Buffer.from(header!.split('.')[1]!, 'base64url').toString('utf8'));
  expect(claims.sub).toBe('user-customer-1');
  expect(claims.roles).toBe('Customer');

  const stored = await page.evaluate(() =>
    JSON.stringify([{ ...localStorage }, { ...sessionStorage }, document.cookie]),
  );
  expect(stored).not.toContain(header!.split('.')[2]); // the signature is nowhere in the browser's storage

  const reloaded = page.waitForEvent('load'); // logging out reloads the home page, so nothing fetched while logged in survives
  await page.getByRole('button', { name: 'Log out' }).click();
  await reloaded;
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
  expect(
    await authorizationOfNextGraphQL(() => page.getByRole('button', { name: 'Refresh' }).click(), page),
  ).toBeUndefined();
});

test('reopening a callback URL that was already used does not log in again', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in' }).click();
  const callback = new Promise<string>((resolve) => {
    page.on('framenavigated', (frame) => {
      if (frame.url().startsWith('http://localhost:3000/auth/callback')) resolve(frame.url());
    });
  });
  await page.getByRole('button', { name: 'Login as Alice Customer (Customer)' }).click();
  const callbackUrl = await callback;
  await expect(page.getByTestId('user-name')).toBeVisible();

  // Opening the same callback URL again finds no pending login in this tab, so no second exchange is even attempted.
  await page.goto(callbackUrl);
  await expect(page.getByTestId('login-error')).toBeVisible();
  await expect(page.getByTestId('user-name')).toHaveCount(0);
});
