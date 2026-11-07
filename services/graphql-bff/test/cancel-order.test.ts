import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { toGlobalId } from '../src/global-id.ts';
import { createServer, type Logger } from '../src/server.ts';

// A customer cancels their own order. The BFF maps the mutation to ordering's cancel path and forwards the token; ordering decides everything else
// (role, whose order it is, whether the status allows a cancel by a customer). These tests check the mapping, the forwarding, and that nothing of
// ordering's text or detail reaches the client.

const TOKEN = 'header.payload.signature';
const ORDER_ID = 'order-0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d';
const gid = toGlobalId('Order', ORDER_ID);

interface Seen {
  method: string;
  url: string;
  authorization: string | undefined;
  traceparent: string | undefined;
}
const seen: Seen[] = [];
let mode: 'ok' | 'conflict' | 'conflict-unknown' | 'missing' | 'unauthorized' | 'forbidden' | 'error' = 'ok';

const reply = (res: http.ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const catalog = http.createServer((_req, res) => reply(res, 404, {}));
const ordering = http.createServer((req, res) => {
  seen.push({
    method: req.method ?? '',
    url: req.url ?? '',
    authorization: req.headers.authorization,
    traceparent: req.headers.traceparent as string | undefined,
  });
  if (mode === 'unauthorized') return reply(res, 401, {});
  if (mode === 'forbidden') return reply(res, 403, {});
  if (mode === 'error') return reply(res, 500, { message: 'secret detail at http://cosmos.internal' });
  if (mode === 'missing') return reply(res, 404, { code: 'not_found', message: 'Order not found.' });
  if (mode === 'conflict')
    return reply(res, 409, { code: 'invalid_transition', message: 'internal wording', currentStatus: 'InPreparation' });
  if (mode === 'conflict-unknown') return reply(res, 409, { code: 'invalid_transition', currentStatus: 'Mystery' });
  return reply(res, 200, { id: ORDER_ID, status: 'Cancelled' });
});

const logs: Record<string, unknown>[] = [];
const log: Logger = { info: (e) => logs.push(e), error: (e) => logs.push(e) };
let bff: http.Server;
let bffUrl: string;

before(async () => {
  await new Promise<void>((r) => catalog.listen(0, '127.0.0.1', r));
  await new Promise<void>((r) => ordering.listen(0, '127.0.0.1', r));
  const port = (s: http.Server) => (s.address() as AddressInfo).port;
  bff = createServer(
    {
      port: 0,
      catalogUrl: `http://127.0.0.1:${port(catalog)}`,
      orderingUrl: `http://127.0.0.1:${port(ordering)}`,
      timeoutMs: 300,
      checkoutTimeoutMs: 300,
    },
    { log, exporter: () => {} },
  );
  await new Promise<void>((r) => bff.listen(0, '127.0.0.1', r));
  bffUrl = `http://127.0.0.1:${port(bff)}/graphql`;
});
after(() => {
  bff.closeAllConnections();
  bff.close();
  catalog.close();
  ordering.closeAllConnections();
  ordering.close();
});
beforeEach(() => {
  seen.length = 0;
  logs.length = 0;
  mode = 'ok';
});

/* eslint-disable @typescript-eslint/no-explicit-any */
type GqlBody = { data?: any; errors?: any[] };
/* eslint-enable @typescript-eslint/no-explicit-any */

async function gql(query: string, variables?: object, headers: Record<string, string> = {}) {
  const res = await fetch(bffUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ query, variables }),
  });
  return { res, body: (await res.json()) as GqlBody };
}
const auth = { authorization: `Bearer ${TOKEN}` };

const CANCEL = `mutation($input: CancelOrderInput!) {
  cancelOrder(input: $input) {
    __typename
    ... on CancelOrderDone { orderId status }
    ... on CancelOrderRejected { code message currentStatus }
  } }`;
const cancel = (orderId = gid, headers: Record<string, string> = auth) => gql(CANCEL, { input: { orderId } }, headers);

describe('Mutation.cancelOrder', () => {
  test("posts to ordering's cancel with the customer's token and returns the new status", async () => {
    const { body } = await cancel();

    assert.equal(body.errors, undefined);
    assert.deepEqual(body.data.cancelOrder, { __typename: 'CancelOrderDone', orderId: gid, status: 'CANCELLED' });
    assert.equal(seen.length, 1);
    assert.equal(seen[0]!.method, 'POST');
    assert.equal(seen[0]!.url, `/ordering/orders/${ORDER_ID}/cancel`);
    assert.equal(seen[0]!.authorization, `Bearer ${TOKEN}`);
    assert.match(seen[0]!.traceparent ?? '', /^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/);
  });

  test('a cancel ordering refuses for the order status is NOT_ALLOWED_NOW with the current status and fixed text', async () => {
    mode = 'conflict';
    const { body } = await cancel();

    assert.equal(body.errors, undefined);
    assert.deepEqual(body.data.cancelOrder, {
      __typename: 'CancelOrderRejected',
      code: 'NOT_ALLOWED_NOW',
      message: 'This order can no longer be cancelled. It has changed.',
      currentStatus: 'IN_PREPARATION',
    });
    assert.ok(!JSON.stringify(body).includes('internal wording'));
  });

  test('a current status the schema has no name for is null, not a guess', async () => {
    mode = 'conflict-unknown';
    const { body } = await cancel();
    assert.equal(body.data.cancelOrder.code, 'NOT_ALLOWED_NOW');
    assert.equal(body.data.cancelOrder.currentStatus, null);
  });

  test('a missing order, and another customer’s (ordering answers 404 for both), is NOT_FOUND', async () => {
    mode = 'missing';
    const { body } = await cancel();
    assert.deepEqual(body.data.cancelOrder, {
      __typename: 'CancelOrderRejected',
      code: 'NOT_FOUND',
      message: 'That order could not be found.',
      currentStatus: null,
    });
  });

  test('an id that does not decode, or is another type of id (a vendor order, a listing), is NOT_FOUND and ordering is not called', async () => {
    for (const bad of ['not-base64!', toGlobalId('VendorOrder', ORDER_ID), toGlobalId('Listing', ORDER_ID), '']) {
      const { body } = await cancel(bad);
      assert.equal(body.data.cancelOrder.code, 'NOT_FOUND', `id ${JSON.stringify(bad)}`);
    }
    assert.equal(seen.length, 0);
  });

  test('a hostile order id cannot change the path sent to ordering', async () => {
    const { body } = await cancel(toGlobalId('Order', '../../vendor/orders?x=1#'));
    assert.equal(body.errors, undefined);
    assert.equal(seen.length, 1);
    assert.equal(new URL(seen[0]!.url, 'http://x').pathname.split('/').length, 5); // /ordering/orders/{one segment}/cancel
    assert.ok(seen[0]!.url.endsWith('/cancel'));
    assert.ok(seen[0]!.url.startsWith('/ordering/orders/..%2F'));
  });

  test('no token: UNAUTHENTICATED and ordering is not called', async () => {
    const { body } = await cancel(gid, {});
    assert.equal(body.errors![0].extensions.code, 'UNAUTHENTICATED');
    assert.equal(seen.length, 0);
  });

  test('ordering rejecting the token is UNAUTHENTICATED', async () => {
    mode = 'unauthorized';
    const { body } = await cancel();
    assert.equal(body.errors![0].extensions.code, 'UNAUTHENTICATED');
  });

  test('a token without the customer role (ordering answers 403) is FORBIDDEN', async () => {
    mode = 'forbidden';
    const { body } = await cancel();
    assert.equal(body.errors![0].extensions.code, 'FORBIDDEN');
  });

  test('a failing ordering is the generic INTERNAL error, with none of its detail and no token in the logs', async () => {
    mode = 'error';
    const { body } = await cancel();
    assert.equal(body.errors![0].extensions.code, 'INTERNAL');
    const text = JSON.stringify(body) + JSON.stringify(logs);
    assert.ok(!text.includes('cosmos.internal'));
    assert.ok(!text.includes(TOKEN));
  });
});
