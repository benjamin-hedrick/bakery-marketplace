import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { toGlobalId } from '../src/global-id.ts';
import { createServer, type Logger } from '../src/server.ts';

// S1-01b: Mutation.placeOrder. The fake ordering-service speaks the real REST shapes and error codes of CheckoutEndpoints.

const TOKEN = 'header.payload.signature';
const KEY = 'checkout-attempt-1234';
const orderBody = {
  id: 'order-abc',
  customerId: 'customer-1',
  vendorId: 'vendor-shop-001',
  paymentMethodId: 'pm-ok',
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
  pickupWindow: { start: '2026-11-02T14:00:00+00:00', end: '2026-11-02T14:15:00+00:00' },
  sequenceNumber: 1,
  createdAt: '2026-11-02T13:00:00+00:00',
  updatedAt: '2026-11-02T13:00:00+00:00',
};

interface Seen {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: unknown;
}
const seen: Seen[] = [];
let reply: { status: number; body: unknown } | 'hang' = { status: 201, body: orderBody };

const ordering = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  req.on('end', () => {
    const text = Buffer.concat(chunks).toString('utf8');
    seen.push({
      method: req.method ?? '',
      url: req.url ?? '',
      headers: req.headers,
      body: text ? JSON.parse(text) : null,
    });
    if (reply === 'hang') return;
    res.writeHead(reply.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(reply.body));
  });
});

const logs: Record<string, unknown>[] = [];
const log: Logger = { info: (e) => logs.push(e), error: (e) => logs.push(e) };
let bff: http.Server;
let bffUrl: string;

before(async () => {
  await new Promise<void>((r) => ordering.listen(0, '127.0.0.1', r));
  const orderingUrl = `http://127.0.0.1:${(ordering.address() as AddressInfo).port}`;
  const config = {
    port: 0,
    catalogUrl: 'http://127.0.0.1:1',
    orderingUrl,
    timeoutMs: 300,
    checkoutTimeoutMs: 400,
  };
  bff = createServer(config, { log, exporter: () => {} });
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
  reply = { status: 201, body: orderBody };
});

/* eslint-disable @typescript-eslint/no-explicit-any */
type GqlBody = { data?: any; errors: any[] }; // `errors` is absent on success; tests assert that explicitly
/* eslint-enable @typescript-eslint/no-explicit-any */

async function gql(query: string, variables?: object, headers: Record<string, string> = {}, url = bffUrl) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ query, variables }),
  });
  return { res, body: (await res.json()) as GqlBody };
}
const auth = { authorization: `Bearer ${TOKEN}` };
const sourdoughGid = toGlobalId('Listing', 'listing-sourdough-001');

const PLACE = `mutation($input: PlaceOrderInput!) { placeOrder(input: $input) {
  __typename
  ... on PlaceOrderSuccess { order { id status vendorId total { cents currency } pickupWindow { start end }
    lineItems { listingId modifierIds quantity price { cents currency } } } }
  ... on PlaceOrderRejected { code message fields { field message } shortfalls { listingId available } }
} }`;

const input = (over: Record<string, unknown> = {}) => ({
  idempotencyKey: KEY,
  vendorId: 'vendor-shop-001',
  paymentMethodId: 'pm-ok',
  lineItems: [{ listingId: sourdoughGid, modifierIds: ['mod-seeds'], quantity: 2 }],
  pickupWindow: { start: '2026-11-02T14:00:00+00:00', end: '2026-11-02T14:15:00+00:00' },
  ...over,
});
const place = (over?: Record<string, unknown>, headers: Record<string, string> = auth) =>
  gql(PLACE, { input: input(over) }, headers);

describe('placeOrder: the request ordering receives', () => {
  test("sends the contract body with service ids, the caller's token, the idempotency key and a traceparent", async () => {
    const parent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
    await place(undefined, { ...auth, traceparent: parent });
    const call = seen[0]!;
    assert.equal(call.method, 'POST');
    assert.equal(call.url, '/ordering/checkout');
    assert.deepEqual(call.body, {
      vendorId: 'vendor-shop-001',
      paymentMethodId: 'pm-ok',
      lineItems: [{ listingId: 'listing-sourdough-001', modifierIds: ['mod-seeds'], quantity: 2 }],
      pickupWindow: { start: '2026-11-02T14:00:00+00:00', end: '2026-11-02T14:15:00+00:00' },
    });
    assert.equal(call.headers.authorization, `Bearer ${TOKEN}`);
    assert.equal(call.headers['idempotency-key'], KEY);
    assert.match(String(call.headers.traceparent), /^00-0af7651916cd43dd8448eb211c80319c-[0-9a-f]{16}-01$/);
    assert.match(String(call.headers['content-type']), /application\/json/);
  });

  test('the pickup window is optional and is sent as no window', async () => {
    await place({ pickupWindow: null });
    assert.equal((seen[0]!.body as { pickupWindow: unknown }).pickupWindow, null);
    seen.length = 0;
    const omitted = { ...input() } as Record<string, unknown>;
    delete omitted.pickupWindow;
    await gql(PLACE, { input: omitted }, auth);
    assert.equal((seen[0]!.body as { pickupWindow: unknown }).pickupWindow, null);
  });

  test('the client never supplies a price, total, customer or status: the input type has no such fields', async () => {
    const { body } = await gql(
      PLACE,
      { input: input({ totalCents: 1, customerId: 'someone', status: 'Completed' }) },
      auth,
    );
    assert.ok(body.errors?.length > 0); // rejected by schema validation before anything is sent
    assert.equal(seen.length, 0);
  });

  test('neither the token nor the idempotency key is written to the log', async () => {
    await place();
    reply = { status: 500, body: { code: 'boom' } };
    await place();
    assert.doesNotMatch(JSON.stringify(logs), new RegExp(`${TOKEN}|${KEY}`));
  });
});

describe('placeOrder: success', () => {
  test('201 maps to PlaceOrderSuccess with the order, a global order id and global listing ids', async () => {
    const { body } = await place();
    assert.equal(body.errors, undefined);
    assert.deepEqual(body.data.placeOrder, {
      __typename: 'PlaceOrderSuccess',
      order: {
        id: toGlobalId('Order', 'order-abc'),
        status: 'PLACED',
        vendorId: 'vendor-shop-001',
        total: { cents: 1800, currency: 'USD' },
        pickupWindow: { start: '2026-11-02T14:00:00+00:00', end: '2026-11-02T14:15:00+00:00' },
        lineItems: [
          { listingId: sourdoughGid, modifierIds: ['mod-seeds'], quantity: 2, price: { cents: 1800, currency: 'USD' } },
        ],
      },
    });
  });

  test('200 (the same checkout repeated) is the same success, so a retry shows the confirmation once', async () => {
    reply = { status: 200, body: orderBody };
    const { body } = await place();
    assert.equal(body.data.placeOrder.__typename, 'PlaceOrderSuccess');
    assert.equal(body.data.placeOrder.order.id, toGlobalId('Order', 'order-abc'));
  });

  test('an auto-confirmed order comes back Confirmed', async () => {
    reply = { status: 201, body: { ...orderBody, status: 'Confirmed', pickupWindow: null } };
    const { body } = await place({ pickupWindow: null });
    assert.equal(body.data.placeOrder.order.status, 'CONFIRMED');
    assert.equal(body.data.placeOrder.order.pickupWindow, null);
  });
});

describe('placeOrder: expected failures are typed payloads with fixed client-safe text', () => {
  const cases: [number, string, string][] = [
    [422, 'invalid_quantity', 'INVALID_QUANTITY'],
    [422, 'invalid_modifier', 'INVALID_MODIFIER'],
    [422, 'validation_failed', 'VALIDATION_FAILED'],
    [422, 'idempotency_key_reuse', 'VALIDATION_FAILED'],
    [409, 'listing_unavailable', 'LISTING_UNAVAILABLE'],
    [409, 'insufficient_stock', 'INSUFFICIENT_STOCK'],
    [409, 'pickup_window_unavailable', 'PICKUP_WINDOW_UNAVAILABLE'],
    [409, 'conflict', 'CONFLICT'],
    [402, 'payment_declined', 'PAYMENT_DECLINED'],
  ];
  for (const [status, code, expected] of cases) {
    test(`${status} ${code} is ${expected}`, async () => {
      reply = {
        status,
        body: { code, message: 'SECRET detail from ordering at http://cosmos.internal', errors: null, lines: null },
      };
      const { body } = await place();
      assert.equal(body.errors, undefined);
      assert.equal(body.data.placeOrder.__typename, 'PlaceOrderRejected');
      assert.equal(body.data.placeOrder.code, expected);
      assert.ok(body.data.placeOrder.message.length > 0);
      assert.doesNotMatch(JSON.stringify(body), /SECRET|cosmos\.internal/); // the text is the BFF's, not downstream's
    });
  }

  test('per-field problems are passed on, shortened and capped', async () => {
    const errors: Record<string, string[]> = {
      'lineItems[0].quantity': ['Quantity must be between 1 and 20.'],
      big: ['x'.repeat(500)],
    };
    for (let i = 0; i < 40; i++) errors[`f${i}`] = ['bad'];
    reply = { status: 422, body: { code: 'invalid_quantity', message: 'm', errors, lines: null } };
    const { body } = await place();
    const fields = body.data.placeOrder.fields as { field: string; message: string }[];
    assert.deepEqual(fields[0], { field: 'lineItems[0].quantity', message: 'Quantity must be between 1 and 20.' });
    assert.ok(fields.length <= 20);
    assert.ok(fields.every((f) => f.message.length <= 200 && f.field.length <= 100));
  });

  test('missing fields are an empty list, not null', async () => {
    reply = { status: 402, body: { code: 'payment_declined', message: 'm', errors: null, lines: null } };
    const { body } = await place();
    assert.deepEqual(body.data.placeOrder.fields, []);
    assert.deepEqual(body.data.placeOrder.shortfalls, []);
  });

  test('insufficient stock names each short item with a global listing id and the quantity available', async () => {
    reply = {
      status: 409,
      body: {
        code: 'insufficient_stock',
        message: 'm',
        errors: null,
        lines: [{ listingId: 'listing-sourdough-001', reason: 'insufficient_stock', available: 1 }],
      },
    };
    const { body } = await place();
    assert.deepEqual(body.data.placeOrder.shortfalls, [{ listingId: sourdoughGid, available: 1 }]);
  });
});

describe("placeOrder: authentication and failures that are not the customer's to fix", () => {
  test('without a token it is UNAUTHENTICATED and ordering is not called', async () => {
    const { body } = await place(undefined, {});
    assert.equal(body.errors[0].extensions.code, 'UNAUTHENTICATED');
    assert.equal(seen.length, 0);
  });

  test('a credential that is not a bearer token is treated as none', async () => {
    const { body } = await place(undefined, { authorization: 'Basic dXNlcjpwYXNz' });
    assert.equal(body.errors[0].extensions.code, 'UNAUTHENTICATED');
    assert.equal(seen.length, 0);
  });

  test('ordering answering 401 is UNAUTHENTICATED and 403 is FORBIDDEN', async () => {
    reply = { status: 401, body: {} };
    assert.equal((await place()).body.errors[0].extensions.code, 'UNAUTHENTICATED');
    reply = { status: 403, body: {} };
    assert.equal((await place()).body.errors[0].extensions.code, 'FORBIDDEN');
  });

  test('a service outage (503), a server error (500) and an unknown error code are INTERNAL with a reference and no detail', async () => {
    for (const r of [
      { status: 503, body: { code: 'downstream_unavailable', message: 'secret detail' } },
      { status: 500, body: { code: 'boom', message: 'secret detail at http://cosmos.internal' } },
      { status: 409, body: { code: 'a_code_nobody_mapped', message: 'secret detail' } },
      { status: 418, body: { code: 'teapot', message: 'secret detail' } },
    ]) {
      reply = r;
      const { body } = await place();
      assert.equal(body.errors[0].extensions.code, 'INTERNAL', String(r.status));
      assert.match(body.errors[0].extensions.reference, /^[0-9a-f]{32}$/);
      assert.doesNotMatch(JSON.stringify(body), /secret|cosmos\.internal/);
    }
  });

  test('a body that is not JSON is INTERNAL', async () => {
    reply = { status: 201, body: 'not an order' };
    const { body } = await place();
    assert.equal(body.errors[0].extensions.code, 'INTERNAL');
  });

  test('a hung checkout times out into INTERNAL (the idempotency key makes the retry safe)', async () => {
    reply = 'hang';
    const { body } = await place();
    assert.equal(body.errors[0].extensions.code, 'INTERNAL');
  });
});

describe('placeOrder: ids', () => {
  test('a listing id that is not a Listing global id is VALIDATION_FAILED without calling ordering', async () => {
    for (const listingId of [
      'listing-sourdough-001',
      'not-base64!',
      toGlobalId('Order', 'order-abc'),
      toGlobalId('Listing', ''),
    ]) {
      const { body } = await gql(
        PLACE,
        { input: input({ lineItems: [{ listingId, modifierIds: [], quantity: 1 }] }) },
        auth,
      );
      assert.equal(body.data.placeOrder.code, 'VALIDATION_FAILED', listingId);
      assert.equal(body.data.placeOrder.fields[0].field, 'lineItems[0].listingId');
    }
    assert.equal(seen.length, 0);
  });

  test('a bad id on a later line names that line', async () => {
    const { body } = await gql(
      PLACE,
      {
        input: input({
          lineItems: [
            { listingId: sourdoughGid, modifierIds: [], quantity: 1 },
            { listingId: 'x', modifierIds: [], quantity: 1 },
          ],
        }),
      },
      auth,
    );
    assert.equal(body.data.placeOrder.fields[0].field, 'lineItems[1].listingId');
  });
});

describe('placeOrder: the payment method (WI-ORD-010)', () => {
  test('sends the chosen method id to ordering, and only the id', async () => {
    await place({ paymentMethodId: 'pm-alice-ok' });
    assert.equal((seen[0]!.body as { paymentMethodId: string }).paymentMethodId, 'pm-alice-ok');
    assert.deepEqual(Object.keys(seen[0]!.body as object).sort(), [
      'lineItems',
      'paymentMethodId',
      'pickupWindow',
      'vendorId',
    ]);
  });

  test('the method is required: an operation without it is refused by the schema and nothing is sent', async () => {
    const without = { ...input() } as Record<string, unknown>;
    delete without.paymentMethodId;
    const { body } = await gql(PLACE, { input: without }, auth);
    assert.ok(body.errors?.length > 0);
    assert.equal(seen.length, 0);
  });

  test('a declined payment (402 from ordering) comes back as PAYMENT_DECLINED, and so does a refused method id as VALIDATION_FAILED on its field', async () => {
    reply = { status: 402, body: { code: 'payment_declined', message: 'The payment was declined.' } };
    const declined = await place({ paymentMethodId: 'pm-alice-refused' });
    assert.equal(declined.body.data.placeOrder.code, 'PAYMENT_DECLINED');

    reply = {
      status: 422,
      body: {
        code: 'validation_failed',
        message: 'x',
        errors: { paymentMethodId: ['Choose one of your saved payment methods.'] },
      },
    };
    const refused = await place({ paymentMethodId: 'pm-nope' });
    assert.equal(refused.body.data.placeOrder.code, 'VALIDATION_FAILED');
    assert.deepEqual(
      refused.body.data.placeOrder.fields.map((f: { field: string }) => f.field),
      ['paymentMethodId'],
    );
  });
});

describe('paymentMethods', () => {
  const QUERY = '{ paymentMethods { id description } }';

  test("lists the caller's methods from ordering with the caller's token, mapping only id and description", async () => {
    reply = {
      status: 200,
      body: [
        { id: 'pm-alice-ok', description: 'Test card (accepted)', token: 'pm_secret_1' },
        { id: 'pm-alice-refused', description: 'Test card (refused)' },
      ],
    };
    const { body } = await gql(QUERY, undefined, auth);
    assert.equal(seen[0]!.url, '/ordering/payment-methods');
    assert.equal(seen[0]!.headers.authorization, `Bearer ${TOKEN}`);
    assert.deepEqual(body.data.paymentMethods, [
      { id: 'pm-alice-ok', description: 'Test card (accepted)' },
      { id: 'pm-alice-refused', description: 'Test card (refused)' },
    ]);
    assert.ok(!JSON.stringify(body).includes('pm_secret_1')); // even if a service sent one, the schema has no field for it
  });

  test('a customer with none gets an empty list', async () => {
    reply = { status: 200, body: [] };
    const { body } = await gql(QUERY, undefined, auth);
    assert.deepEqual(body.data.paymentMethods, []);
  });

  test('needs a token (UNAUTHENTICATED) and the token is refused by ordering as FORBIDDEN for another role', async () => {
    const anonymous = await gql(QUERY);
    assert.equal(anonymous.body.errors[0].extensions.code, 'UNAUTHENTICATED');
    assert.equal(seen.length, 0);

    reply = { status: 403, body: {} };
    const vendor = await gql(QUERY, undefined, auth);
    assert.equal(vendor.body.errors[0].extensions.code, 'FORBIDDEN');
  });

  test('the schema has no field that could carry a token, number, brand or expiry', async () => {
    const { body } = await gql('{ __type(name: "PaymentMethod") { fields { name } } }');
    assert.deepEqual(body.data.__type.fields.map((f: { name: string }) => f.name).sort(), ['description', 'id']);
  });
});
