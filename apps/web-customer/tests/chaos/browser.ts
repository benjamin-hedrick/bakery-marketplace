import { expect, type Page } from '@playwright/test';

// Browser helpers for the chaos specs of the two doors (bff-door, web-door). What a customer must be able to count on when a door in front of the data
// misbehaves: the page never stays blank or stuck on a spinner, it says plainly that it could not load and offers a way to try again, and trying again works.

/**
 * Reloads the history page `times` times after it has loaded once. Each reload ends in the orders, or in the failure notice from which Try again reaches the
 * orders; a reload that ends in neither is a blank page or an endless spinner and fails the test. Returns how many reloads needed Try again.
 */
export async function reloadHistoryRepeatedly(
  page: Page,
  times: number,
  maxRetries = 25,
): Promise<{ orders: number; failedThenRecovered: number }> {
  const outcomes = { orders: 0, failedThenRecovered: 0 };
  const rows = page.getByTestId('history-order');
  const failed = page.getByTestId('history-failed');
  for (let i = 0; i < times; i++) {
    await page.reload();
    const first = await Promise.race([
      rows
        .first()
        .waitFor({ timeout: 20_000 })
        .then(() => 'orders' as const),
      failed.waitFor({ timeout: 20_000 }).then(() => 'failed' as const),
    ]).catch(() => 'stuck' as const);
    expect(first, 'blank page or endless spinner after a reload').not.toBe('stuck');
    if (first === 'orders') {
      outcomes.orders++;
      continue;
    }
    for (let retry = 0; retry < maxRetries && !(await rows.first().isVisible()); retry++) {
      await failed.getByRole('button', { name: 'Try again' }).click();
      await Promise.race([rows.first().waitFor({ timeout: 20_000 }), failed.waitFor({ timeout: 20_000 })]);
    }
    await expect(rows.first()).toBeVisible();
    outcomes.failedThenRecovered++;
  }
  return outcomes;
}

export interface HistoryRun {
  /** How many times the page showed its "could not load" notice before the orders appeared. */
  failuresShown: number;
  /** Answers of the GraphQL route the page saw that carried an X-Chaos-Injected header: proof the faults reached the browser's own calls. */
  chaosAnswersSeen: number;
  /** Answers that were not JSON (a bad gateway page): the page must have survived them. */
  nonJsonAnswersSeen: number;
}

/**
 * Logs in as Alice and opens her order history (loaded in the browser through the web server's GraphQL route), through whatever faults the door injects.
 * Fails when the page ends up in neither state (orders, or the failure notice with its Try again button) within `stuckAfterSeconds`, or when pressing
 * Try again `maxRetries` times never brings the orders.
 */
export async function openHistoryThroughFaults(
  page: Page,
  maxRetries = 15,
  stuckAfterSeconds = 20,
): Promise<HistoryRun> {
  const run: HistoryRun = { failuresShown: 0, chaosAnswersSeen: 0, nonJsonAnswersSeen: 0 };
  page.on('response', (res) => {
    if (!res.url().endsWith('/api/graphql')) return;
    if (res.headers()['x-chaos-injected']) run.chaosAnswersSeen++;
    if (!(res.headers()['content-type'] ?? '').includes('json')) run.nonJsonAnswersSeen++;
  });

  await page.goto('/orders');
  // A visitor with no session is asked to log in (the page renders that notice on the client, so wait for it), then the mock issuer's page.
  await page.getByRole('main').getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/localhost:5100\/authorize/);
  await page.getByRole('button', { name: 'Login as Alice Customer (Customer)' }).click();
  await expect(page).toHaveURL(/\/orders$/);

  const rows = page.getByTestId('history-order');
  const failed = page.getByTestId('history-failed');
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Either state ends the wait. Neither within the limit is a stuck spinner or a blank page, which is the defect this spec exists to catch.
    const state = await Promise.race([
      rows
        .first()
        .waitFor({ timeout: stuckAfterSeconds * 1000 })
        .then(() => 'orders' as const),
      failed.waitFor({ timeout: stuckAfterSeconds * 1000 }).then(() => 'failed' as const),
    ]).catch(() => 'stuck' as const);
    expect(
      state,
      'the page was neither showing orders nor offering to try again (blank page or endless spinner)',
    ).not.toBe('stuck');
    if (state === 'orders') return run;
    run.failuresShown++;
    await expect(failed.getByRole('button', { name: 'Try again' })).toBeVisible();
    await failed.getByRole('button', { name: 'Try again' }).click();
  }
  throw new Error(
    `the order history never loaded after ${maxRetries} presses of Try again (${run.failuresShown} failures shown)`,
  );
}
