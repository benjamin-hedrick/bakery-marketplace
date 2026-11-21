import type { APIRequestContext, Page } from '@playwright/test';
import { addToOrder, CHAOS, expect, LISTINGS, openListing, placeButton, test, toCheckout, WEB } from './support';

// Chaos-aware tests (WI-CHAOS-006). The same tests run wherever the suite runs. In the dev environment the dev-chaos scenario is on and aims its faults
// at the chaos seed data these tests use (and only at it, so every other test is undisturbed); elsewhere (UAT, a plain local stack) no scenario is on
// and the same tests check the plain path. Each test asks the environment whether a scenario is on (X-Chaos-Scenario, response-only) and then:
//   on:  it fails unless the fault it aims at was injected (X-Chaos-Injected, which the BFF fills with the services' faults too), then checks that the
//        customer was told the truth and nothing was lost or doubled;
//   off: it checks the ordinary outcome.
// A test never switches chaos on or off: the scenario is chosen by the deployment, and the triggers are ordinary reads of named chaos listings.

/** The scenario the environment says is on (dev-chaos in dev), or null. Asked of the web app's GraphQL route, which passes the BFF's indicator on. */
async function scenarioOn(request: APIRequestContext): Promise<string | null> {
  const res = await request.post(`${WEB}/api/graphql`, {
    headers: { 'content-type': 'application/json', origin: WEB },
    data: { query: '{ __typename }' },
  });
  expect(res.status()).toBe(200);
  return res.headers()['x-chaos-scenario'] ?? null;
}

/** The faults named on the web app's GraphQL answers this page receives from now on. */
function watchInjected(page: Page): Set<string> {
  const names = new Set<string>();
  page.on('response', (r) => {
    if (!r.url().startsWith(`${WEB}/api/graphql`)) return;
    for (const n of (r.headers()['x-chaos-injected'] ?? '').split(',')) if (n.trim()) names.add(n.trim());
  });
  return names;
}

/** The link of the newest order on the signed-in customer's history, or null when there is none (the history is paged, so it is not counted). */
async function newestOrder(page: Page): Promise<string | null> {
  const history = await page.context().newPage();
  await history.goto('/orders');
  const rows = history.getByTestId('history-order');
  await expect(rows.first().or(history.getByTestId('history-empty'))).toBeVisible();
  const href = (await rows.count()) > 0 ? await rows.first().getByRole('link').first().getAttribute('href') : null;
  await history.close();
  return href;
}

test('chaos 1. a lost payment answer: the customer is told nothing was charged, and no order exists; without chaos the order is placed', async ({
  page,
  request,
}) => {
  const scenario = await scenarioOn(request);
  const injected = watchInjected(page);
  await addToOrder(page, CHAOS.listings.payment);
  await toCheckout(page, CHAOS.customers.payment);
  await expect(page.getByLabel('Payment method')).toContainText('chaos test');
  const before = await newestOrder(page);

  await placeButton(page).click();

  if (scenario) {
    await expect(page.getByRole('alert').filter({ hasText: 'Nothing has been charged' })).toBeVisible();
    expect([...injected], 'the payment answer was lost (the fault this test aims at)').toContain(
      'ordering/payment:lostResponse',
    );
    await expect(page).toHaveURL(`${WEB}/checkout`);
    expect(await newestOrder(page), 'no order was created').toBe(before);
  } else {
    await expect(page).toHaveURL(/\/orders\/.+/);
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', /CONFIRMED|PLACED/);
    expect(await newestOrder(page)).not.toBe(before);
  }
});

test('chaos 2. a stock check that says no: the order is refused and nothing changes; without chaos the order is placed', async ({
  page,
  request,
}) => {
  const scenario = await scenarioOn(request);
  const injected = watchInjected(page);
  await addToOrder(page, CHAOS.listings.stock);
  await toCheckout(page, CHAOS.customers.stock);
  const before = await newestOrder(page);

  await placeButton(page).click();

  if (scenario) {
    await expect(page.getByTestId('checkout-rejection')).toBeVisible();
    expect([...injected], 'the stock check said no (the fault this test aims at)').toContain('ordering/catalog:reject');
    await expect(page).toHaveURL(`${WEB}/checkout`);
    expect(await newestOrder(page), 'no order was created').toBe(before);
    await openListing(page, CHAOS.listings.stock);
    await expect(page.getByTestId('stock')).toHaveAttribute('data-status', 'IN_STOCK'); // the catalog's stock was never taken
  } else {
    await expect(page).toHaveURL(/\/orders\/.+/);
    expect(await newestOrder(page)).not.toBe(before);
  }
});

test('chaos 3. an outage switched on and off by reading two listings: only the chaos listing goes away, then comes back; without chaos nothing changes', async ({
  page,
  request,
}) => {
  const scenario = await scenarioOn(request);
  await openListing(page, CHAOS.listings.outage);
  const outageUrl = page.url();

  await openListing(page, CHAOS.listings.outageOn); // the trigger: an ordinary read
  const during = await page.goto(outageUrl);
  if (scenario) {
    // The customer is not shown the listing, and is not told it does not exist: the catalog is unavailable, not the listing gone.
    await expect(page.getByRole('heading', { level: 1, name: CHAOS.listings.outage })).toHaveCount(0);
    expect(during?.status(), 'an outage is not a "not found"').not.toBe(404);
  } else {
    await expect(page.getByRole('heading', { level: 1, name: CHAOS.listings.outage })).toBeVisible();
  }
  await openListing(page, LISTINGS.sourdough); // every other listing is untouched meanwhile

  await openListing(page, CHAOS.listings.outageOff); // the other trigger
  await page.goto(outageUrl);
  await expect(page.getByRole('heading', { level: 1, name: CHAOS.listings.outage })).toBeVisible();
});

test("chaos 4. a slow BFF for one caller's own trace: that request waits and still answers, every other request is quick; without chaos all are quick", async ({
  request,
}) => {
  const scenario = await scenarioOn(request);
  const ask = async (headers: Record<string, string>) => {
    const started = Date.now();
    const res = await request.post(`${WEB}/api/graphql`, {
      headers: { 'content-type': 'application/json', origin: WEB, ...headers },
      data: { query: '{ listings(first: 1) { edges { node { id } } } }' },
    });
    expect(res.status()).toBe(200);
    return { ms: Date.now() - started, injected: res.headers()['x-chaos-injected'] ?? '' };
  };

  const aimed = await ask({ traceparent: `00-${CHAOS.slowTraceId}-00f067aa0ba902b7-01` });
  const other = await ask({});

  if (scenario) {
    expect(aimed.injected, 'the BFF door waited (the fault this test aims at)').toContain('bff:latency');
    expect(aimed.ms).toBeGreaterThanOrEqual(1900);
  } else {
    expect(aimed.injected).toBe('');
  }
  expect(other.injected).not.toContain('bff:latency');
});
