import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { toGlobalId } from '../src/global-id.ts';
import { createServer, type Logger } from '../src/server.ts';

// WI-ORD-009: the allergens an order carries. The BFF passes the customer's choice to ordering-service untouched (ordering checks it against the
// registry), maps the stored allergens onto Order and VendorOrder, and logs none of them.

const TOKEN = 'header.payload.signature';
const orderBody = {
  id: 'order-abc',
  customerId: 'customer-1',
  vendorId: 'vendor-shop-001',
  lineItems: [
    {
      listingId: 'listing-sourdough-001',
      modifiers: ['mod-seeds'],
      quantity: 2,
      unitPriceCents: 900,
      priceCents: 1800,
    },
  ],
  totalCents: 1800,
  currency: 'USD',
  status: 'Placed',
  fulfillmentType: 'Pickup',
  pickupWindow: null,
  sequenceNumber: 1,
  createdAt: '2026-11-04T13:00:00+00:00',
  updatedAt: '2026-11-04T13:00:00+00:00',
  allergens: ['dairy', 'tree-nut'],
};
const vendorOrderBody = {
  id: 'order-abc',
  reference: 'ABC1',
  status: 'Placed',
  totalCents: 1800,
  currency: 'USD',
  lineCount: 1,
  itemCount: 2,
  fulfillmentType: 'Pickup',
  pickupWindow: null,
  automatic: false,
  cancelledBy: null,
  cancelReason: null,
  placedAt: '2026-11-04T13:00:00+00:00',
  updatedAt: '2026-11-04T13:00:00+00:00',
  lines: [],
  pickupInstructions: null,
  lastSequence: 1,
  allergens: ['dairy', 'tree-nut'],
};

const seen: { url: string; body: unknown }[] = [];
let checkoutReply: { status: number; body: unknown } = { status: 201, body: orderBody };
let vendorReply: unknown = vendorOrderBody;

const ordering = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  req.on('end', () => {
    const text = Buffer.concat(chunks).toString('utf8');
    seen.push({ url: req.url ?? '', body: text ? JSON.parse(text) : null });
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.url === '/ordering/checkout') return send(checkoutReply.status, checkoutReply.body);
    if (req.url?.startsWith('/ordering/orders/')) return send(200, checkoutReply.body);
    if (req.url?.startsWith('/ordering/vendor/orders/')) return send(200, vendorReply);
    return send(404, { code: 'not_found' });
  });
});

const logs: Record<string, unknown>[] = [];
const log: Logger = { info: (e) => logs.push(e), error: (e) => logs.push(e) };
let bff: http.Server;
let bffUrl: string;

before(async () => {
  await new Promise<void>((r) => ordering.listen(0, '127.0.0.1', r));
  bff = createServer(
    {
      port: 0,
      catalogUrl: 'http://127.0.0.1:1',
      orderingUrl: `http://127.0.0.1:${(ordering.address() as AddressInfo).port}`,
      timeoutMs: 3000,
      checkoutTimeoutMs: 4000,
      testHooks: false,
    },
    { log, exporter: () => {} },
  );
  await new Promise<void>((r) => bff.listen(0, '127.0.0.1', r));
  bffUrl = `http://127.0.0.1:${(bff.address() as AddressInfo).port}/graphql`;
});
after(() => {
  bff.close();
  ordering.close();
});
beforeEach(() => {
  seen.length = 0;
  logs.length = 0;
  checkoutReply = { status: 201, body: orderBody };
  vendorReply = vendorOrderBody;
});

/* eslint-disable @typescript-eslint/no-explicit-any */
type GqlBody = { data?: any; errors?: any[] };
/* eslint-enable @typescript-eslint/no-explicit-any */

async function gql(query: string, variables?: object): Promise<GqlBody> {
  const res = await fetch(bffUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query, variables }),
  });
  return (await res.json()) as GqlBody;
}

const PLACE = `mutation($input: PlaceOrderInput!) { placeOrder(input: $input) {
  __typename
  ... on PlaceOrderSuccess { order { id allergens } }
  ... on PlaceOrderRejected { code message fields { field message } }
} }`;
const input = (over: Record<string, unknown> = {}) => ({
  idempotencyKey: 'checkout-attempt-1234',
  vendorId: 'vendor-shop-001',
  lineItems: [{ listingId: toGlobalId('Listing', 'listing-sourdough-001'), modifierIds: [], quantity: 1 }],
  ...over,
});

describe('placeOrder: allergens', () => {
  test('the customer’s choice goes to ordering as sent, and the stored allergens come back on the order', async () => {
    const body = await gql(PLACE, { input: input({ allergens: ['tree-nut', 'dairy'] }) });

    assert.equal(body.errors, undefined);
    assert.deepEqual((seen[0]!.body as { allergens: string[] }).allergens, ['tree-nut', 'dairy']); // checked by ordering, not here
    assert.equal(body.data.placeOrder.__typename, 'PlaceOrderSuccess');
    assert.deepEqual(body.data.placeOrder.order.allergens, ['dairy', 'tree-nut']); // what ordering stored, sorted
  });

  test('no allergens, null and an empty list all send the body as it was before', async () => {
    for (const allergens of [undefined, null, []]) {
      seen.length = 0;
      await gql(PLACE, { input: input(allergens === undefined ? {} : { allergens }) });
      assert.equal('allergens' in (seen[0]!.body as object), false);
    }
  });

  test('an order from an ordering-service that does not know allergens yet has an empty list', async () => {
    checkoutReply = { status: 201, body: { ...orderBody, allergens: undefined } };

    const body = await gql(PLACE, { input: input() });

    assert.deepEqual(body.data.placeOrder.order.allergens, []);
  });

  test('a refused allergen is a PlaceOrderRejected with the field named and ordering’s own text not shown', async () => {
    checkoutReply = {
      status: 422,
      body: {
        code: 'validation_failed',
        message: 'internal wording',
        errors: { 'allergens[0]': ['That is not an allergen the bakery offers.'] },
      },
    };

    const body = await gql(PLACE, { input: input({ allergens: ['vegan'] }) });

    assert.equal(body.data.placeOrder.__typename, 'PlaceOrderRejected');
    assert.equal(body.data.placeOrder.code, 'VALIDATION_FAILED');
    assert.equal(body.data.placeOrder.message, 'The order could not be placed as entered.');
    assert.equal(body.data.placeOrder.fields[0].field, 'allergens[0]');
  });

  test('no allergen is written to the BFF’s log', async () => {
    await gql(PLACE, { input: input({ allergens: ['tree-nut', 'sesame'] }) });
    await gql(`{ order(id: "${toGlobalId('Order', 'order-abc')}") { allergens } }`);

    assert.ok(logs.length > 0);
    assert.doesNotMatch(JSON.stringify(logs), /tree-nut|sesame|dairy/);
  });
});

describe('reading allergens', () => {
  test('the customer’s order shows them', async () => {
    const body = await gql(`{ order(id: "${toGlobalId('Order', 'order-abc')}") { allergens } }`);

    assert.deepEqual(body.data.order.allergens, ['dairy', 'tree-nut']);
  });

  test('the vendor’s order shows them, and an older order has an empty list', async () => {
    const id = toGlobalId('VendorOrder', 'order-abc');
    assert.deepEqual((await gql(`{ vendorOrder(id: "${id}") { allergens } }`)).data.vendorOrder.allergens, [
      'dairy',
      'tree-nut',
    ]);

    vendorReply = { ...vendorOrderBody, allergens: undefined };
    assert.deepEqual((await gql(`{ vendorOrder(id: "${id}") { allergens } }`)).data.vendorOrder.allergens, []);
  });
});
