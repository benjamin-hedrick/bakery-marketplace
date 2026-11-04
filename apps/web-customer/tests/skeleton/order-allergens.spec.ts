import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { globalId, userToken } from './support';

// WI-ORD-009 on the real stack: an order placed with allergens, read back by its customer and by the vendor who has it, through the GraphQL BFF,
// ordering-service, the order events and the vendor read model. A refused allergen, another vendor, and the tokens that must not read it.
// Needs the whole local stack (docs/operations/local-dev.md); node scripts/ci/skeleton-smoke.mjs starts it.

const BFF = process.env.BFF_URL ?? 'http://localhost:4100';
const SOURDOUGH = 'listing-sourdough-001';

const PLACE = `mutation($input: PlaceOrderInput!) { placeOrder(input: $input) { __typename
  ... on PlaceOrderSuccess { order { id allergens } }
  ... on PlaceOrderRejected { code fields { field } } } }`;
const CUSTOMER_READ = `query($id: ID!) { order(id: $id) { allergens } }`;
const VENDOR_READ = `query($id: ID!) { vendorOrder(id: $id) { allergens } }`;

async function gql(token: string | null, query: string, variables: object) {
  const res = await fetch(`${BFF}/graphql`, {
    method: 'POST',
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  return (await res.json()) as { data?: Record<string, any>; errors?: { extensions?: { code?: string } }[] }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const input = (allergens?: string[]) => ({
  idempotencyKey: `allergens-${randomUUID()}`,
  vendorId: 'vendor-shop-001',
  lineItems: [{ listingId: globalId('Listing', SOURDOUGH), modifierIds: [], quantity: 1 }],
  pickupWindow: null,
  ...(allergens ? { allergens } : {}),
});

/** Waits for the vendor read model, which is fed by the order events a moment after checkout. */
async function vendorAllergens(token: string, id: string): Promise<string[] | null> {
  for (let i = 0; i < 40; i++) {
    const body = await gql(token, VENDOR_READ, { id });
    if (body.data?.vendorOrder) return body.data.vendorOrder.allergens;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

test('an order placed with allergens shows them to its customer and to the vendor who has it, and not to anyone else', async () => {
  const customer = await userToken('user-customer-1');
  const vendor = await userToken('vendor-shop-001');

  const placed = await gql(customer, PLACE, { input: input(['tree-nut', 'sesame', 'tree-nut']) });
  expect(placed.data!.placeOrder.__typename, JSON.stringify(placed)).toBe('PlaceOrderSuccess');
  const orderGid: string = placed.data!.placeOrder.order.id;
  expect(placed.data!.placeOrder.order.allergens).toEqual(['sesame', 'tree-nut']); // sorted, distinct

  expect((await gql(customer, CUSTOMER_READ, { id: orderGid })).data!.order.allergens).toEqual(['sesame', 'tree-nut']);

  const vendorGid = globalId('VendorOrder', Buffer.from(orderGid, 'base64').toString('utf8').split(':')[1]!);
  expect(await vendorAllergens(vendor, vendorGid)).toEqual(['sesame', 'tree-nut']);

  // Another vendor has no such order; a customer token is refused the vendor view; no token gets nothing.
  const otherVendor = await userToken('vendor-indep-001');
  expect((await gql(otherVendor, VENDOR_READ, { id: vendorGid })).data?.vendorOrder ?? null).toBeNull();
  const asCustomer = await gql(customer, VENDOR_READ, { id: vendorGid });
  expect(asCustomer.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
  const anonymous = await gql(null, VENDOR_READ, { id: vendorGid });
  expect(anonymous.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
});

test('an order with no allergens has an empty list', async () => {
  const customer = await userToken('user-customer-1');

  const placed = await gql(customer, PLACE, { input: input() });

  expect(placed.data!.placeOrder.__typename, JSON.stringify(placed)).toBe('PlaceOrderSuccess');
  expect(placed.data!.placeOrder.order.allergens).toEqual([]);
});

test('an allergen the registry does not offer is refused by name and no order is placed', async () => {
  const customer = await userToken('user-customer-1');

  const placed = await gql(customer, PLACE, { input: input(['tree-nut', 'vegan']) });

  expect(placed.data!.placeOrder.__typename).toBe('PlaceOrderRejected');
  expect(placed.data!.placeOrder.code).toBe('VALIDATION_FAILED');
  expect(placed.data!.placeOrder.fields.map((f: { field: string }) => f.field)).toContain('allergens[1]');
});
