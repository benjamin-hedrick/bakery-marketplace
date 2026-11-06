import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { globalId, userToken } from './support';

// WI-QUE-005 on the real stack: an order the customer places with allergens shows them on the vendor's live queue card, with the registry's
// labels, and one placed without allergens shows nothing extra. The vendor logs in through the real issuer on the queue display (port 3100).
// Another vendor's list never holds the order (that is checked at the API in order-allergens.spec.ts; the mock issuer has one vendor login).
// Needs the whole local stack and the queue display (scripts/ci/skeleton-smoke.mjs starts them).

const BFF = process.env.BFF_URL ?? 'http://localhost:4100';
const QUEUE = process.env.QUEUE_URL ?? 'http://localhost:3100';

const PLACE = `mutation($input: PlaceOrderInput!) { placeOrder(input: $input) { __typename
  ... on PlaceOrderSuccess { order { id } } } }`;

async function place(allergens?: string[]) {
  const token = await userToken('user-customer-1');
  const res = await fetch(`${BFF}/graphql`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      query: PLACE,
      variables: {
        input: {
          idempotencyKey: `queue-allergens-${randomUUID()}`,
          paymentMethodId: 'pm-alice-ok',
          vendorId: 'vendor-shop-001',
          // An option makes the order wait for the vendor, so it stays in the New column.
          lineItems: [
            { listingId: globalId('Listing', 'listing-sourdough-001'), modifierIds: ['mod-seeds'], quantity: 1 },
          ],
          pickupWindow: null,
          ...(allergens ? { allergens } : {}),
        },
      },
    }),
  });
  const body = (await res.json()) as { data: { placeOrder: { __typename: string; order: { id: string } } } };
  expect(body.data.placeOrder.__typename, JSON.stringify(body)).toBe('PlaceOrderSuccess');
  const id = Buffer.from(body.data.placeOrder.order.id, 'base64').toString('utf8').split(':')[1]!;
  return id.slice(-6).toUpperCase(); // the reference
}

test('the vendor’s live queue shows an order’s allergens with the registry’s labels, and an order without them shows nothing extra', async ({
  browser,
}) => {
  const context = await browser.newContext({ baseURL: QUEUE });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in' }).first().click();
  await page.getByRole('button', { name: 'Login as Corner Bakery (owner) (Vendor)' }).click();
  await expect(page.getByTestId('queue-mode')).toHaveText('Live', { timeout: 30_000 });

  const withAllergens = await place(['tree-nut', 'sesame']);
  const without = await place();

  const card = (reference: string) =>
    page.getByTestId('queue-order').filter({ has: page.getByText(reference, { exact: true }) });
  await expect(card(withAllergens)).toBeVisible({ timeout: 30_000 });
  await expect(card(withAllergens).getByTestId('allergens')).toContainText('Allergy: sesame, tree nuts');
  await expect(card(without)).toBeVisible({ timeout: 30_000 });
  await expect(card(without).getByTestId('allergens')).toHaveCount(0);

  await context.close();
});
