import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { onlyUnder, recordMetrics, secondsUntil } from './support';

// Chaos scenario session-outage (chaos/scenarios/session-outage.json, WI-CHAOS-004): the web server's session store (layer `session`) fails every call
// between two signals. A login that would return to /chaos/session-outage/on switches the outage on, one that would return to /chaos/session-outage/off
// switches it off: rules in the scenario file, matched on the store's own calls; the app has nothing for them. What must hold: during the outage a login
// lands on the error page saying login is not available, and a page opened by someone already logged in shows the login or says it could not load (never
// blank or stuck); afterwards a session made before the outage is still there and a new login works. Needs the whole local stack:
// node scripts/ci/chaos-smoke.mjs session-outage
onlyUnder('session-outage');
test.describe.configure({ mode: 'serial' });

/** Starts a login whose return page is a rule of the scenario; the store's call that keeps the pending login carries the signal. */
const signal = (request: APIRequestContext, which: 'on' | 'off') =>
  request.get(`/api/auth/login?returnTo=/chaos/session-outage/${which}`, { maxRedirects: 0 });

async function logInAsAlice(page: Page): Promise<void> {
  await page.goto('/orders');
  await page.getByRole('main').getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/localhost:5100\/authorize/);
  await page.getByRole('button', { name: 'Login as Alice Customer (Customer)' }).click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(page.getByTestId('user-name')).toBeVisible();
}

test('during a session-store outage nothing is blank or stuck; afterwards the old session is still there and a new login works', async ({
  page,
  browser,
  request,
}) => {
  // Alice logs in before the outage.
  await logInAsAlice(page);

  // The outage starts; the signalling login is itself refused, which shows the layer is on.
  const on = await signal(request, 'on');
  expect(on.status()).toBe(302);
  expect(on.headers()['location']).toBe('/auth/error?code=unavailable');

  // A second visitor tries to log in: the error page, with the fixed sentence.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto('/api/auth/login?returnTo=/orders');
  await expect(visitor).toHaveURL(/\/auth\/error\?code=unavailable$/);
  await expect(visitor.getByText('Login is not available just now. Please try again in a moment.')).toBeVisible();

  // Alice opens her order history again: the page asks her to log in or says it could not load, within the limit.
  await page.goto('/orders');
  const during = await Promise.race([
    page
      .getByTestId('login-required')
      .waitFor({ timeout: 20_000 })
      .then(() => 'login-required' as const),
    page
      .getByTestId('history-failed')
      .waitFor({ timeout: 20_000 })
      .then(() => 'could-not-load' as const),
  ]).catch(() => 'stuck' as const);
  expect(
    during,
    'the page was neither asking for a login nor saying it could not load (blank page or endless spinner)',
  ).not.toBe('stuck');

  // The outage ends; the signalling login is judged after the signal, so it already goes to the issuer.
  const off = await signal(request, 'off');
  expect(off.status()).toBe(302);
  expect(off.headers()['location']).toMatch(/localhost:5100\/authorize/);

  // Alice's session from before the outage was not lost: her history loads without a new login.
  await page.goto('/orders');
  await expect(page.getByTestId('user-name')).toBeVisible();
  await expect(page.getByTestId('history-order').or(page.getByTestId('history-empty')).first()).toBeVisible();

  // The visitor can log in again.
  const secondsToLogin = await secondsUntil(async () => {
    try {
      await logInAsAlice(visitor);
      return true;
    } catch {
      return false;
    }
  }, 60);
  expect(secondsToLogin, 'a login after the outage never succeeded').not.toBeNull();

  recordMetrics('session-outage', {
    pageDuringOutage: during,
    sessionFromBeforeTheOutageKept: true,
    secondsFromOutageEndToLoggedIn: secondsToLogin,
  });
  await visitor.context().close();
});
