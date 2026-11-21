import type { BrowserContext, Page } from '@playwright/test';
import {
  CUSTOMERS,
  type Correlated,
  LISTINGS,
  addToOrder,
  expect,
  placeButton,
  saveCorrelation,
  saveEvidence,
  test,
  toCheckout,
  watchCorrelation,
} from './support';

// Test 11 of the deployed suite (register 218): five seeded customers order the last units of one listing at the same moment. The Yuzu Lemonade is
// seeded for this test only (stock 2, one per order, no options or allergens; tools/BakeryMarketplace.Seed). The catalog's reservation must never sell
// more than it has: at most two orders may succeed, every other one must be refused for stock, and the listing is sold out afterwards. Each customer
// is in their own browser context (their own session), all prepared first, then every "Place" is pressed together. The time from the press to each
// outcome is recorded. Read the numbers by their limits: one replica per app, from a single machine (register 218, 5).

const SEEDED_STOCK = 2;
const who = [CUSTOMERS.alice, CUSTOMERS.nora, CUSTOMERS.sam, CUSTOMERS.dana, CUSTOMERS.max];

interface Outcome {
  customer: string;
  outcome: 'confirmed' | 'refused-stock' | 'other';
  code: string | null;
  ms: number;
}

test('11. five customers order the last units at once: never more than the stock succeed, the rest are refused for stock', async ({
  browser,
  page,
}, testInfo) => {
  test.setTimeout(600_000);
  await page.goto('/');
  const stock = page.getByTestId('listing').filter({ hasText: LISTINGS.lemonade }).getByTestId('stock');
  const status = (await stock.innerText()).trim();
  test.skip(
    status === 'Sold out',
    'the lemonade was sold by an earlier run against this environment; the test needs a freshly seeded environment',
  );

  // The web app allows 10 logins a minute from one address, and this test logs in five customers: let the earlier tests' logins age out first.
  await page.waitForTimeout(65_000);

  const seen: Correlated[] = [];
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  try {
    for (const customer of who) {
      const context = await browser.newContext();
      watchCorrelation(context, `${testInfo.title} [${customer}]`, seen);
      const p = await context.newPage();
      await addToOrder(p, LISTINGS.lemonade);
      await toCheckout(p, customer);
      contexts.push(context);
      pages.push(p);
    }

    const pressed = Date.now();
    const outcomes: Outcome[] = await Promise.all(
      pages.map(async (p, i) => {
        await placeButton(p).click();
        const confirmed = p.getByTestId('order-status');
        const refused = p.getByTestId('checkout-rejection');
        await expect(confirmed.or(refused)).toBeVisible({ timeout: 120_000 });
        const ms = Date.now() - pressed;
        if (await confirmed.isVisible()) {
          await expect(confirmed).toHaveAttribute('data-status', 'CONFIRMED');
          return { customer: who[i]!, outcome: 'confirmed', code: null, ms };
        }
        const code = await refused.getAttribute('data-code');
        return { customer: who[i]!, outcome: code === 'INSUFFICIENT_STOCK' ? 'refused-stock' : 'other', code, ms };
      }),
    );
    saveEvidence('concurrency-orders.json', {
      listing: LISTINGS.lemonade,
      statusBefore: status,
      seededStock: SEEDED_STOCK,
      outcomes,
    });
    await testInfo.attach('outcomes.json', {
      body: JSON.stringify(outcomes, null, 2),
      contentType: 'application/json',
    });

    const confirmed = outcomes.filter((o) => o.outcome === 'confirmed').length;
    expect(
      outcomes.filter((o) => o.outcome === 'other'),
      'every refusal is for stock',
    ).toEqual([]);
    expect(confirmed, 'never more than the seeded stock').toBeLessThanOrEqual(SEEDED_STOCK);
    expect(confirmed, 'what was left was sold').toBeGreaterThanOrEqual(1);
    expect(confirmed + outcomes.filter((o) => o.outcome === 'refused-stock').length).toBe(who.length);

    await page.goto('/');
    await expect(stock).toHaveText('Sold out');
  } finally {
    await saveCorrelation(seen, (name, body) =>
      testInfo.attach(`all-customers-${name}`, { body, contentType: 'application/json' }),
    );
    for (const context of contexts) await context.close();
  }
});
