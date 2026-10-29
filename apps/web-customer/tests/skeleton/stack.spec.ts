import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { globalId, userToken } from './support';

// S1-07a: the real stack is wired end to end for ordering (compose + seed + catalog + ordering + BFF + the mock issuer), proven without a
// browser. The browser journey on top of it is S1-07b. Needs the whole local stack; see README.

const BFF = process.env.BFF_URL ?? 'http://localhost:4100';
const ORDERING = process.env.ORDERING_URL ?? 'http://localhost:5300';
const CATALOG = process.env.CATALOG_URL ?? 'http://localhost:5200';
const SOURDOUGH = 'listing-sourdough-001';

// Query results differ per test, so the data is deliberately loosely typed (the only `any` in this file).
/* eslint-disable @typescript-eslint/no-explicit-any */
type GqlBody = {
  data?: Record<string, any>;
  errors?: { message: string; extensions?: { code?: string } }[];
};
/* eslint-enable @typescript-eslint/no-explicit-any */

async function gql(request: APIRequestContext, query: string, variables: object = {}, token?: string) {
  const res = await request.post(`${BFF}/graphql`, {
    data: { query, variables },
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  expect(res.status()).toBe(200);
  return (await res.json()) as GqlBody;
}

/** The vendor's own view of a listing's quantity (+1 then -1, as the response shows the count). Only the owner can read it. */
async function quantity(request: APIRequestContext, vendorToken: string, listing: string): Promise<number> {
  const headers = { authorization: `Bearer ${vendorToken}` };
  const up = await request.post(`${CATALOG}/catalog/listings/${listing}/stock/adjust`, { data: { delta: 1 }, headers });
  const body = (await up.json()) as { stock: { availableQuantity: number } };
  await request.post(`${CATALOG}/catalog/listings/${listing}/stock/adjust`, { data: { delta: -1 }, headers });
  return body.stock.availableQuantity - 1;
}

const PLACE = `mutation($input: PlaceOrderInput!) { placeOrder(input: $input) { __typename
  ... on PlaceOrderSuccess { order { id status total { cents } } }
  ... on PlaceOrderRejected { code } } }`;
const plain = (quantity = 1) => ({
  idempotencyKey: `smoke-${randomUUID()}`,
  vendorId: 'vendor-shop-001',
  lineItems: [{ listingId: globalId('Listing', SOURDOUGH), modifierIds: [], quantity }],
  pickupWindow: null,
});

test('ordering-service is up, and the BFF reaches it for pickup times', async ({ request }) => {
  expect((await request.get(`${ORDERING}/health`)).ok()).toBe(true);

  const { data, errors } = await gql(request, `{ pickupWindows(vendorId: "vendor-shop-001") { start end } }`);

  expect(errors).toBeUndefined();
  expect(data!.pickupWindows.length).toBeGreaterThan(0);
  expect(new Date(data!.pickupWindows[0].start).getTime()).toBeLessThan(new Date(data!.pickupWindows[0].end).getTime());
});

test('ordering validates the token itself: no token, a forged one and a vendor token are all refused through the BFF', async ({
  request,
}) => {
  const query = `query($id: ID!) { order(id: $id) { id } }`;
  const id = globalId('Order', 'order-does-not-exist');

  expect((await gql(request, query, { id })).errors![0]!.extensions!.code).toBe('UNAUTHENTICATED'); // stopped at the BFF
  expect((await gql(request, query, { id }, 'forged.token.value')).errors![0]!.extensions!.code).toBe(
    'UNAUTHENTICATED',
  ); // stopped by ordering
  const vendor = await userToken('vendor-shop-001');
  expect((await gql(request, query, { id }, vendor)).errors![0]!.extensions!.code).toBe('FORBIDDEN'); // a real token, the wrong role
});

test('a customer token from the real issuer is accepted by ordering: an unknown order is null, not an error', async ({
  request,
}) => {
  const customer = await userToken('user-customer-1');
  const { data, errors } = await gql(
    request,
    `query($id: ID!) { order(id: $id) { id } }`,
    { id: globalId('Order', 'order-does-not-exist') },
    customer,
  );
  expect(errors).toBeUndefined();
  expect(data!.order).toBeNull();
});

test('ordering reaches the catalog with its own credential: a plain order is placed, confirmed, readable by its customer, and takes one from stock', async ({
  request,
}) => {
  const customer = await userToken('user-customer-1');
  const vendor = await userToken('vendor-shop-001');
  const before = await quantity(request, vendor, SOURDOUGH);

  const placed = await gql(request, PLACE, { input: plain() }, customer);

  expect(placed.errors).toBeUndefined();
  expect(placed.data!.placeOrder.__typename).toBe('PlaceOrderSuccess');
  const order = placed.data!.placeOrder.order;
  expect(order.status).toBe('CONFIRMED'); // no options and no window: confirmed by itself (WI-ORD-008)
  expect(order.total.cents).toBe(800);
  expect(await quantity(request, vendor, SOURDOUGH)).toBe(before - 1); // the reservation really happened, at the catalog

  const read = await gql(
    request,
    `query($id: ID!) { order(id: $id) { status total { cents } } }`,
    { id: order.id },
    customer,
  );
  expect(read.data!.order).toEqual({ status: 'CONFIRMED', total: { cents: 800 } });
});

test('a declined test payment, through the BFF hook, takes nothing from stock', async ({ request }) => {
  const customer = await userToken('user-customer-1');
  const vendor = await userToken('vendor-shop-001');
  const before = await quantity(request, vendor, SOURDOUGH);

  const res = await request.post(`${BFF}/graphql`, {
    data: { query: PLACE, variables: { input: plain() } },
    headers: { authorization: `Bearer ${customer}`, 'x-test-payment': 'decline' },
  });

  expect((await res.json()).data.placeOrder).toEqual({ __typename: 'PlaceOrderRejected', code: 'PAYMENT_DECLINED' });
  expect(await quantity(request, vendor, SOURDOUGH)).toBe(before); // reserved, then released
});
