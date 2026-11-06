import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { globalId, userToken } from './support';

// N-03 and N-04 on the real stack: a customer's order travels through the outbox, the Redis event stream, ordering's own subscriber, the vendor read
// model in Cosmos, the BFF and the vendor's session on the queue display, and appears on the vendor's screen. Needs the whole local stack and the
// queue display on port 3100 (scripts/ci/skeleton-smoke.mjs starts it); see README.

const BFF = process.env.BFF_URL ?? 'http://localhost:4100';
const QUEUE = process.env.QUEUE_URL ?? 'http://localhost:3100';
const SOURDOUGH = 'listing-sourdough-001';

const PLACE = `mutation($input: PlaceOrderInput!) { placeOrder(input: $input) { __typename
  ... on PlaceOrderSuccess { order { id status } }
  ... on PlaceOrderRejected { code } } }`;

test('an order the customer places shows up on the vendor queue screen, carried by the events and the vendor read model', async ({
  request,
  browser,
}) => {
  const customer = await userToken('user-customer-1');
  // An option means the order waits for the vendor to decide (WI-ORD-008), so it is a "new" order on the screen.
  const res = await request.post(`${BFF}/graphql`, {
    headers: { authorization: `Bearer ${customer}` },
    data: {
      query: PLACE,
      variables: {
        input: {
          idempotencyKey: `queue-${randomUUID()}`,
          paymentMethodId: 'pm-alice-ok',
          vendorId: 'vendor-shop-001',
          lineItems: [{ listingId: globalId('Listing', SOURDOUGH), modifierIds: ['mod-seeds'], quantity: 2 }],
          pickupWindow: null,
        },
      },
    },
  });
  const placed = (await res.json()) as {
    data: { placeOrder: { __typename: string; order: { id: string; status: string } } };
  };
  expect(placed.data.placeOrder.__typename).toBe('PlaceOrderSuccess');
  expect(placed.data.placeOrder.order.status).toBe('PLACED');
  const orderId = Buffer.from(placed.data.placeOrder.order.id, 'base64').toString('utf8').split(':')[1]!;
  const reference = orderId.slice(-6).toUpperCase(); // the short reference the vendor and the screen use (OrderReference)

  const context = await browser.newContext({ baseURL: QUEUE });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in' }).first().click();
  await expect(page).toHaveURL(/localhost:5100\/authorize/);
  await page.getByRole('button', { name: 'Login as Corner Bakery (owner) (Vendor)' }).click();
  await expect(page).toHaveURL(`${QUEUE}/`);
  await expect(page.getByTestId('user-name')).toHaveText('Corner Bakery (owner)');

  // The projection runs behind the order by a moment, and the screen asks every 7 seconds: allow for both.
  const card = page.locator(`[data-reference="${reference}"]`);
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('column-new')).toContainText(reference);
  await expect(card).toContainText('2 × Country Sourdough'); // the name comes from ordering's cache of the catalog's names
  await expect(card).toContainText('Add seeds');
  await expect(card).not.toContainText('user-customer-1'); // the vendor sees the order, not who placed it

  // A reload keeps the vendor logged in, and the screen still shows the order (the session is on the server).
  await page.reload();
  await expect(page.getByTestId('user-name')).toBeVisible();
  await expect(page.locator(`[data-reference="${reference}"]`)).toBeVisible({ timeout: 30_000 });
  await context.close();
});

test('another customer-role login cannot see a vendor queue', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: QUEUE });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in' }).first().click();
  await page.getByRole('button', { name: 'Login as Alice Customer (Customer)' }).click();
  await expect(page.getByTestId('user-name')).toHaveText('Alice Customer');

  await expect(page.getByTestId('queue-forbidden')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('queue-order')).toHaveCount(0);
  await context.close();
});
