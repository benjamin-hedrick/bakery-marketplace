import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { adjustStock, globalId, userToken } from './support';

// WI-QUE-003 step 7 (ADR-0021) on the real stack: the vendor's screen is Live, and a customer's order, and each action the vendor takes on it,
// reaches the screen by push, through ordering's outbox, the Redis event stream, the vendor read model in Cosmos, Redis Pub/Sub, ordering's
// event stream, the BFF's subscription, the queue display's server and the browser. Needs the whole local stack and the queue display on port 3100
// (scripts/ci/skeleton-smoke.mjs starts them). The second test measures the delay.

const BFF = process.env.BFF_URL ?? 'http://localhost:4100';
const ORDERING = process.env.ORDERING_URL ?? 'http://localhost:5300';
const QUEUE = process.env.QUEUE_URL ?? 'http://localhost:3100';
const SOURDOUGH = 'listing-sourdough-001';

const PLACE = `mutation($input: PlaceOrderInput!) { placeOrder(input: $input) { __typename
  ... on PlaceOrderSuccess { order { id status } }
  ... on PlaceOrderRejected { code message shortfalls { listingId available } } } }`;

/** Places an order as the seeded customer (with an option, so it waits for the vendor) and returns its id and the short reference the screen shows. */
async function placeOrder(customerToken: string): Promise<{ id: string; reference: string }> {
  const res = await fetch(`${BFF}/graphql`, {
    method: 'POST',
    headers: { authorization: `Bearer ${customerToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      query: PLACE,
      variables: {
        input: {
          idempotencyKey: `live-${randomUUID()}`,
          paymentMethodId: 'pm-alice-ok',
          vendorId: 'vendor-shop-001',
          lineItems: [{ listingId: globalId('Listing', SOURDOUGH), modifierIds: ['mod-seeds'], quantity: 1 }],
          pickupWindow: null,
        },
      },
    }),
  });
  const body = (await res.json()) as { data: { placeOrder: { __typename: string; order: { id: string } } } };
  expect(body.data.placeOrder.__typename, JSON.stringify(body.data.placeOrder)).toBe('PlaceOrderSuccess');
  const id = Buffer.from(body.data.placeOrder.order.id, 'base64').toString('utf8').split(':')[1]!;
  return { id, reference: id.slice(-6).toUpperCase() };
}

/** A vendor action on ordering's REST API, with the vendor's own token. */
async function act(
  vendorToken: string,
  orderId: string,
  action: 'confirm' | 'start-preparation' | 'ready' | 'complete' | 'decline',
) {
  const res = await fetch(`${ORDERING}/ordering/orders/${orderId}/${action}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${vendorToken}` },
  });
  // "Handed over" is accepted (202): the pickup strategy completes the order moments later (WI-ORD-003).
  expect(res.status, `${action} on ${orderId}`).toBe(action === 'complete' ? 202 : 200);
}

async function vendorScreen(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ baseURL: QUEUE });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in' }).first().click();
  await page.getByRole('button', { name: 'Login as Corner Bakery (owner) (Vendor)' }).click();
  await expect(page.getByTestId('user-name')).toHaveText('Corner Bakery (owner)');
  await page.goto('/?delay=1'); // the screen also shows how long the last pushed change took
  await expect(page.getByTestId('queue-mode')).toHaveText('Live', { timeout: 30_000 });
  return { page, close: () => context.close() };
}

const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
const summary = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    min: sorted[0],
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted.at(-1),
  };
};

test('the vendor screen is Live on the real stack, and an order and each action on it arrive by push, well inside the 60-second check', async ({
  browser,
  request,
}) => {
  const customer = await userToken('user-customer-1');
  const vendor = await userToken('vendor-shop-001');
  // The stack is shared with the other journeys, which use the seeded stock: this test brings the one unit it completes.
  await adjustStock(request, vendor, SOURDOUGH, 1);
  const { page, close } = await vendorScreen(browser);

  const asked = Date.now();
  const { id, reference } = await placeOrder(customer);
  const card = page.locator(`[data-reference="${reference}"]`);
  await expect(card).toBeVisible({ timeout: 8000 }); // a poll could take up to a minute while the screen is live
  const seenAfterMs = Date.now() - asked;
  await expect(page.getByTestId('column-new')).toContainText(reference);
  await expect(card.getByTestId('new-badge')).toBeVisible();
  await expect(page.getByTestId('queue-delay')).toContainText(
    /Last change reached this screen \d+ ms after it happened/,
  );

  // The vendor takes the order through its life, from ordering's own API; each step moves the card on the screen.
  const inColumn = (key: 'preparing' | 'ready') =>
    page.getByTestId(`column-${key}`).locator(`[data-reference="${reference}"]`);
  await act(vendor, id, 'confirm');
  await expect(inColumn('preparing')).toBeVisible({ timeout: 8000 });
  await act(vendor, id, 'start-preparation');
  await expect(inColumn('preparing')).toBeVisible();
  await act(vendor, id, 'ready');
  await expect(inColumn('ready')).toBeVisible({ timeout: 8000 });
  await act(vendor, id, 'complete');
  await expect(card).toHaveCount(0, { timeout: 8000 });

  await expect(page.getByTestId('queue-mode')).toHaveText('Live'); // it stayed on the stream the whole time
  console.log(`[live] order visible ${seenAfterMs} ms after the request was sent`);
  await close();
});

test('measures the delay from a customer placing an order to the vendor seeing it, on the real stack', async ({
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const ORDERS = Number(process.env.LIVE_DELAY_ORDERS ?? 20);
  const customer = await userToken('user-customer-1');
  const vendor = await userToken('vendor-shop-001');
  // One unit per order, brought here and taken back below when the orders are declined.
  const restocked = await adjustStock(request, vendor, SOURDOUGH, ORDERS);
  expect(restocked.stock.availableQuantity, 'the restock took').toBeGreaterThanOrEqual(ORDERS);
  const { page, close } = await vendorScreen(browser);

  // Stamp the moment each card first appears in the page, so the number does not include this test's own polling.
  await page.evaluate(() => {
    const arrivals: Record<string, number> = {};
    (window as unknown as { __arrivals: Record<string, number> }).__arrivals = arrivals;
    new MutationObserver(() => {
      document.querySelectorAll('[data-testid="queue-order"]').forEach((el) => {
        const reference = el.getAttribute('data-reference');
        if (reference && !(reference in arrivals)) arrivals[reference] = Date.now();
      });
    }).observe(document.body, { childList: true, subtree: true });
  });

  const requestToScreen: number[] = [];
  const responseToScreen: number[] = [];
  const eventToScreen: number[] = [];
  const placed: string[] = [];
  for (let i = 0; i < ORDERS; i++) {
    const sent = Date.now();
    const order = await placeOrder(customer);
    const answered = Date.now();
    placed.push(order.id);
    await expect
      .poll(
        () =>
          page.evaluate(
            (r) => (window as unknown as { __arrivals: Record<string, number> }).__arrivals[r],
            order.reference,
          ),
        {
          timeout: 15_000,
        },
      )
      .toBeGreaterThan(0);
    const arrived = await page.evaluate(
      (r) => (window as unknown as { __arrivals: Record<string, number> }).__arrivals[r]!,
      order.reference,
    );
    requestToScreen.push(arrived - sent);
    responseToScreen.push(arrived - answered);
    const shown = await page.getByTestId('queue-delay').textContent();
    eventToScreen.push(Number(/(\d+) ms/.exec(shown ?? '')![1])); // the screen's own figure: the event's time to this screen
    await page.waitForTimeout(150);
  }

  const result = {
    orders: ORDERS,
    requestToScreenMs: summary(requestToScreen),
    responseToScreenMs: summary(responseToScreen),
    eventToScreenMs: summary(eventToScreen),
  };
  console.log(`[live-delay] ${JSON.stringify(result)}`);
  await test
    .info()
    .attach('live-delay.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });

  // The old design waited for the next poll: up to 7 seconds, 3.5 on average. The push must beat the worst case of that, by a margin.
  expect(result.eventToScreenMs.p95).toBeLessThan(3000);
  expect(result.responseToScreenMs.max).toBeLessThan(7000);
  await expect(page.getByTestId('queue-mode')).toHaveText('Live');

  for (const id of placed) await act(vendor, id, 'decline'); // leave the queue as it was found
  await adjustStock(request, vendor, SOURDOUGH, -ORDERS); // and the stock
  await close();
});
