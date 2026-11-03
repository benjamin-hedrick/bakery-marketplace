import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { adjustStock, globalId, userToken } from './support';

// WI-QUE-004 on the real stack: the vendor works an order from the queue display's buttons, and the customer's own view of the order shows each
// step. The vendor logs in through the real issuer; the click goes browser -> the queue display's server (session to bearer token) -> the BFF's
// vendorOrderAction -> ordering's action endpoint. Also: another vendor's order and a customer's token are refused by the real services.
// Needs the whole local stack and the queue display on port 3100 (scripts/ci/skeleton-smoke.mjs starts them).

const BFF = process.env.BFF_URL ?? 'http://localhost:4100';
const QUEUE = process.env.QUEUE_URL ?? 'http://localhost:3100';
const SOURDOUGH = 'listing-sourdough-001';

const PLACE = `mutation($input: PlaceOrderInput!) { placeOrder(input: $input) { __typename
  ... on PlaceOrderSuccess { order { id status } }
  ... on PlaceOrderRejected { code message } } }`;
const STATUS = `query($id: ID!) { order(id: $id) { status } }`;
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

/** Places an order as the seeded customer with an option (so it waits for the vendor). Returns the Order global id, the service id and the reference. */
async function placeOrder(customerToken: string) {
  const body = await gql(customerToken, PLACE, {
    input: {
      idempotencyKey: `actions-${randomUUID()}`,
      vendorId: 'vendor-shop-001',
      lineItems: [{ listingId: globalId('Listing', SOURDOUGH), modifierIds: ['mod-seeds'], quantity: 1 }],
      pickupWindow: null,
    },
  });
  expect(body.data!.placeOrder.__typename, JSON.stringify(body)).toBe('PlaceOrderSuccess');
  const orderGid: string = body.data!.placeOrder.order.id;
  const id = Buffer.from(orderGid, 'base64').toString('utf8').split(':')[1]!;
  return { orderGid, id, reference: id.slice(-6).toUpperCase() };
}

const statusFor = async (customerToken: string, orderGid: string) =>
  (await gql(customerToken, STATUS, { id: orderGid })).data!.order.status as string;

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

const inColumn = (page: Page, column: 'new' | 'preparing' | 'ready') =>
  page.getByTestId(`column-${column}`).getByTestId('reference').allTextContents();

test('the vendor accepts, starts, readies and hands over an order from the buttons, and the customer sees each step; a decline cancels', async ({
  browser,
  request,
}) => {
  const customer = await userToken('user-customer-1');
  const vendor = await userToken('vendor-shop-001');
  await adjustStock(request, vendor, SOURDOUGH, 2); // the stack is shared: this test brings the two units it uses
  const { page, close } = await vendorScreen(browser);

  const first = await placeOrder(customer);
  expect(await statusFor(customer, first.orderGid)).toBe('PLACED');
  await expect.poll(() => inColumn(page, 'new')).toContain(first.reference);

  await page.getByRole('button', { name: `Accept order ${first.reference}` }).click();
  await expect.poll(() => inColumn(page, 'preparing')).toContain(first.reference);
  expect(await statusFor(customer, first.orderGid)).toBe('CONFIRMED');

  await page.getByRole('button', { name: `Start preparing order ${first.reference}` }).click();
  await expect(page.getByRole('button', { name: `Mark ready order ${first.reference}` })).toBeVisible();
  expect(await statusFor(customer, first.orderGid)).toBe('IN_PREPARATION');

  await page.getByRole('button', { name: `Mark ready order ${first.reference}` }).click();
  await expect.poll(() => inColumn(page, 'ready')).toContain(first.reference);
  expect(await statusFor(customer, first.orderGid)).toBe('READY_FOR_FULFILLMENT');

  await page.getByRole('button', { name: `Handed over order ${first.reference}` }).click();
  await expect.poll(() => inColumn(page, 'ready')).not.toContain(first.reference);
  expect(await statusFor(customer, first.orderGid)).toBe('COMPLETED');

  const second = await placeOrder(customer);
  await expect.poll(() => inColumn(page, 'new')).toContain(second.reference);
  await page.getByRole('button', { name: `Decline order ${second.reference}` }).click();
  await page.getByRole('button', { name: `Confirm: Decline order ${second.reference}` }).click();
  await expect.poll(() => inColumn(page, 'new')).not.toContain(second.reference);
  expect(await statusFor(customer, second.orderGid)).toBe('CANCELLED');

  await close();
});

test('the real services refuse the wrong caller: another vendor gets not found, a customer is forbidden, a repeated action is not allowed now', async ({
  request,
}) => {
  const customer = await userToken('user-customer-1');
  const shop = await userToken('vendor-shop-001');
  const other = await userToken('vendor-indep-001');
  await adjustStock(request, shop, SOURDOUGH, 1);
  const placed = await placeOrder(customer);
  const vendorOrderGid = globalId('VendorOrder', placed.id);
  // The vendor's view of the order is event-fed; wait until it has the order before acting on it.
  await expect
    .poll(
      async () =>
        (await gql(shop, `query($id: ID!) { vendorOrder(id: $id) { status } }`, { id: vendorOrderGid })).data!
          .vendorOrder,
      {
        timeout: 15_000,
      },
    )
    .not.toBeNull();

  const foreign = await gql(other, ACT, { input: { orderId: vendorOrderGid, action: 'CONFIRM' } });
  expect(foreign.data!.vendorOrderAction).toMatchObject({ __typename: 'VendorOrderActionRejected', code: 'NOT_FOUND' });
  expect(await statusFor(customer, placed.orderGid)).toBe('PLACED'); // the foreign vendor changed nothing

  const asCustomer = await gql(customer, ACT, { input: { orderId: vendorOrderGid, action: 'CONFIRM' } });
  expect(asCustomer.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
  expect(await statusFor(customer, placed.orderGid)).toBe('PLACED');

  const first = await gql(shop, ACT, { input: { orderId: vendorOrderGid, action: 'CONFIRM' } });
  expect(first.data!.vendorOrderAction).toMatchObject({ __typename: 'VendorOrderActionDone', status: 'CONFIRMED' });
  const again = await gql(shop, ACT, { input: { orderId: vendorOrderGid, action: 'CONFIRM' } });
  expect(again.data!.vendorOrderAction).toMatchObject({
    __typename: 'VendorOrderActionRejected',
    code: 'NOT_ALLOWED_NOW',
    currentStatus: 'CONFIRMED',
  });

  const none = await fetch(`${BFF}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: ACT, variables: { input: { orderId: vendorOrderGid, action: 'COMPLETE' } } }),
  });
  expect(((await none.json()) as { errors: { extensions: { code: string } }[] }).errors[0]!.extensions.code).toBe(
    'UNAUTHENTICATED',
  );
  expect(await statusFor(customer, placed.orderGid)).toBe('CONFIRMED');
});
