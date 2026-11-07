import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { globalId, quantity, userToken } from './support';

// Cancelling an order, on the real stack: the customer cancels from the order page, the vendor cancels an order it had accepted from the queue
// display, and the real services decide who may cancel what and from which status. A cancel gives the held stock back.
// Needs the whole local stack and the queue display on port 3100 (scripts/ci/skeleton-smoke.mjs starts them).

const BFF = process.env.BFF_URL ?? 'http://localhost:4100';
const QUEUE = process.env.QUEUE_URL ?? 'http://localhost:3100';
const SOURDOUGH = 'listing-sourdough-001';

const PLACE = `mutation($input: PlaceOrderInput!) { placeOrder(input: $input) { __typename
  ... on PlaceOrderSuccess { order { id status } }
  ... on PlaceOrderRejected { code message } } }`;
const STATUS = `query($id: ID!) { order(id: $id) { status } }`;
const CANCEL = `mutation($input: CancelOrderInput!) { cancelOrder(input: $input) { __typename
  ... on CancelOrderDone { status } ... on CancelOrderRejected { code currentStatus } } }`;
const ACT = `mutation($input: VendorOrderActionInput!) { vendorOrderAction(input: $input) { __typename
  ... on VendorOrderActionDone { status } ... on VendorOrderActionRejected { code currentStatus } } }`;

async function gql(token: string, query: string, variables: object) {
  const res = await fetch(`${BFF}/graphql`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  return (await res.json()) as { data?: Record<string, any>; errors?: { extensions?: { code?: string } }[] }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Places an order as the seeded customer with an option (so it waits for the vendor). */
async function placeOrder(customerToken: string) {
  const body = await gql(customerToken, PLACE, {
    input: {
      idempotencyKey: `cancel-${randomUUID()}`,
      paymentMethodId: 'pm-alice-ok',
      vendorId: 'vendor-shop-001',
      lineItems: [{ listingId: globalId('Listing', SOURDOUGH), modifierIds: ['mod-seeds'], quantity: 1 }],
      pickupWindow: null,
    },
  });
  expect(body.data!.placeOrder.__typename, JSON.stringify(body)).toBe('PlaceOrderSuccess');
  const orderGid: string = body.data!.placeOrder.order.id;
  const id = Buffer.from(orderGid, 'base64').toString('utf8').split(':')[1]!;
  return { orderGid, id, vendorGid: globalId('VendorOrder', id), reference: id.slice(-6).toUpperCase() };
}

const statusFor = async (token: string, orderGid: string) =>
  (await gql(token, STATUS, { id: orderGid })).data!.order.status as string;
const act = async (vendorToken: string, vendorGid: string, action: string) =>
  (await gql(vendorToken, ACT, { input: { orderId: vendorGid, action } })).data!.vendorOrderAction;
const cancel = async (token: string, orderGid: string) =>
  (await gql(token, CANCEL, { input: { orderId: orderGid } })).data!.cancelOrder;

async function vendorScreen(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ baseURL: QUEUE });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in' }).first().click();
  await page.getByRole('button', { name: 'Login as Corner Bakery (owner) (Vendor)' }).click();
  await expect(page.getByTestId('user-name')).toHaveText('Corner Bakery (owner)');
  await expect(page.getByTestId('queue-mode')).toHaveText('Live', { timeout: 30_000 });
  return { page, close: () => context.close() };
}

test('a customer cancels a new order: it is cancelled, the stock comes back, and only that customer can do it, once', async ({
  request,
}) => {
  const customer = await userToken('user-customer-1');
  const other = await userToken('user-customer-nomethods');
  const vendor = await userToken('vendor-shop-001');
  const before = await quantity(request, vendor, SOURDOUGH);
  const { orderGid } = await placeOrder(customer);
  expect(await quantity(request, vendor, SOURDOUGH)).toBe(before - 1); // the order holds one

  expect((await cancel(other, orderGid)).code).toBe('NOT_FOUND'); // another customer's cancel looks like a missing order
  expect(await statusFor(customer, orderGid)).toBe('PLACED'); // and changed nothing

  expect(await cancel(customer, orderGid)).toEqual({ __typename: 'CancelOrderDone', status: 'CANCELLED' });
  expect(await statusFor(customer, orderGid)).toBe('CANCELLED');
  expect(await quantity(request, vendor, SOURDOUGH)).toBe(before); // the held stock is back

  expect(await cancel(customer, orderGid)).toMatchObject({
    __typename: 'CancelOrderRejected',
    code: 'NOT_ALLOWED_NOW',
    currentStatus: 'CANCELLED',
  });
  expect(await quantity(request, vendor, SOURDOUGH)).toBe(before); // a second cancel gave nothing back twice
});

test('a customer cannot cancel once the bakery has started on the order', async ({ request }) => {
  const customer = await userToken('user-customer-1');
  const vendor = await userToken('vendor-shop-001');
  const { orderGid, vendorGid } = await placeOrder(customer);
  expect((await act(vendor, vendorGid, 'CONFIRM')).status).toBe('CONFIRMED');
  expect((await act(vendor, vendorGid, 'START_PREPARATION')).status).toBe('IN_PREPARATION');

  expect(await cancel(customer, orderGid)).toMatchObject({
    __typename: 'CancelOrderRejected',
    code: 'NOT_ALLOWED_NOW',
    currentStatus: 'IN_PREPARATION',
  });
  expect(await statusFor(customer, orderGid)).toBe('IN_PREPARATION');

  const before = await quantity(request, vendor, SOURDOUGH); // the vendor can still cancel it (and the stock goes back)
  expect((await act(vendor, vendorGid, 'CANCEL')).status).toBe('CANCELLED');
  expect(await quantity(request, vendor, SOURDOUGH)).toBe(before + 1);
});

test('the vendor cancels an order it had accepted, from the queue display; the customer sees it cancelled and the stock comes back', async ({
  browser,
  request,
}) => {
  const customer = await userToken('user-customer-1');
  const vendor = await userToken('vendor-shop-001');
  const before = await quantity(request, vendor, SOURDOUGH);
  const { orderGid, reference } = await placeOrder(customer);
  const screen = await vendorScreen(browser);
  try {
    const { page } = screen;
    await page.getByRole('button', { name: `Accept order ${reference}` }).click();
    await expect(page.getByRole('button', { name: `Start preparing order ${reference}` })).toBeVisible();

    await page.getByRole('button', { name: `Cancel order ${reference}` }).click();
    expect(await statusFor(customer, orderGid)).toBe('CONFIRMED'); // the first click only asked
    await page.getByRole('button', { name: `Confirm: Cancel order ${reference}` }).click();

    await expect(page.getByTestId('queue-order').filter({ hasText: reference })).toHaveCount(0); // it leaves the live queue
    await expect.poll(() => statusFor(customer, orderGid)).toBe('CANCELLED');
    expect(await quantity(request, vendor, SOURDOUGH)).toBe(before);
  } finally {
    await screen.close();
  }
});

test('in the browser the customer cancels a waiting order from its page and the page then says it is cancelled', async ({
  page,
  request,
}) => {
  const customer = await userToken('user-customer-1');
  const vendor = await userToken('vendor-shop-001');
  const before = await quantity(request, vendor, SOURDOUGH);
  const { orderGid } = await placeOrder(customer);

  await page.goto(`/orders/${encodeURIComponent(orderGid)}`);
  await page.getByTestId('login-required').getByRole('button', { name: 'Log in' }).click();
  await page.getByRole('button', { name: 'Login as Alice Customer (Customer)' }).click();
  await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'PLACED');

  await page.getByTestId('cancel-order').click();
  await page.getByTestId('cancel-confirm').click();

  await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'CANCELLED');
  await expect(page.getByTestId('cancel-note')).toHaveAttribute('data-outcome', 'cancelled');
  expect(await quantity(request, vendor, SOURDOUGH)).toBe(before);
});
