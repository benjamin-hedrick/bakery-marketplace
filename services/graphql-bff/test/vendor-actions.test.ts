import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { toGlobalId } from '../src/global-id.ts';
import { createServer, type Logger } from '../src/server.ts';

// WI-QUE-004: the vendor's actions on an order. The BFF maps the enum to ordering's path and forwards the token; ordering decides everything
// else (role, ownership, whether the status allows the action). These tests check the mapping, the forwarding, and that nothing of ordering's
// text or detail reaches the client.

const TOKEN = 'header.payload.signature';
const ORDER_ID = 'order-0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d';
const gid = toGlobalId('VendorOrder', ORDER_ID);

interface Seen {
  method: string;
  url: string;
  authorization: string | undefined;
  traceparent: string | undefined;
}
const seen: Seen[] = [];
let mode:
  'ok' | 'conflict' | 'conflict-unknown' | 'missing' | 'unauthorized' | 'forbidden' | 'error' | 'slow' | 'badstatus' =
  'ok';
let okStatus = 'Confirmed';

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
  if (mode === 'slow') return; // never answers: the BFF's timeout must end the wait
  if (mode === 'missing') return reply(res, 404, { code: 'not_found', message: 'Order not found.' });
  if (mode === 'conflict')
    return reply(res, 409, { code: 'invalid_transition', message: 'internal wording', currentStatus: 'InPreparation' });
  if (mode === 'conflict-unknown') return reply(res, 409, { code: 'invalid_transition', currentStatus: 'Mystery' });
  const status = mode === 'badstatus' ? 'Mystery' : okStatus;
  return reply(res, 200, { id: ORDER_ID, status });
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
  okStatus = 'Confirmed';
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

const ACT = `mutation($input: VendorOrderActionInput!) {
  vendorOrderAction(input: $input) {
    __typename
    ... on VendorOrderActionDone { orderId status }
    ... on VendorOrderActionRejected { code message currentStatus }
  } }`;
const act = (action: string, orderId = gid, headers: Record<string, string> = auth) =>
  gql(ACT, { input: { orderId, action } }, headers);

describe('Mutation.vendorOrderAction', () => {
  const cases: [string, string, string, string][] = [
    ['CONFIRM', 'confirm', 'Confirmed', 'CONFIRMED'],
    ['DECLINE', 'decline', 'Cancelled', 'CANCELLED'],
    ['START_PREPARATION', 'start-preparation', 'InPreparation', 'IN_PREPARATION'],
    ['MARK_READY', 'ready', 'ReadyForFulfillment', 'READY_FOR_FULFILLMENT'],
    ['COMPLETE', 'complete', 'Completed', 'COMPLETED'],
  ];
  for (const [action, segment, wire, status] of cases) {
    test(`${action} posts to ordering's ${segment} with the vendor's token and returns the new status`, async () => {
      okStatus = wire;
      const { body } = await act(action);

      assert.equal(body.errors, undefined);
      assert.deepEqual(body.data.vendorOrderAction, { __typename: 'VendorOrderActionDone', orderId: gid, status });
      assert.equal(seen.length, 1);
      assert.equal(seen[0]!.method, 'POST');
      assert.equal(seen[0]!.url, `/ordering/orders/${ORDER_ID}/${segment}`);
      assert.equal(seen[0]!.authorization, `Bearer ${TOKEN}`);
      assert.match(seen[0]!.traceparent ?? '', /^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/);
    });
  }

  test('an action ordering refuses for the order status is NOT_ALLOWED_NOW with the current status and fixed text', async () => {
    mode = 'conflict';
    const { body } = await act('CONFIRM');

    assert.equal(body.errors, undefined);
    assert.deepEqual(body.data.vendorOrderAction, {
      __typename: 'VendorOrderActionRejected',
      code: 'NOT_ALLOWED_NOW',
      message: 'That cannot be done to this order now. It has changed.',
      currentStatus: 'IN_PREPARATION',
    });
    assert.ok(!JSON.stringify(body).includes('internal wording'));
  });

  test('a current status the schema has no name for is null, not a guess', async () => {
    mode = 'conflict-unknown';
    const { body } = await act('CONFIRM');
    assert.equal(body.data.vendorOrderAction.code, 'NOT_ALLOWED_NOW');
    assert.equal(body.data.vendorOrderAction.currentStatus, null);
  });

  test('a missing order, and another vendor’s (ordering answers 404 for both), is NOT_FOUND', async () => {
    mode = 'missing';
    const { body } = await act('CONFIRM');
    assert.deepEqual(body.data.vendorOrderAction, {
      __typename: 'VendorOrderActionRejected',
      code: 'NOT_FOUND',
      message: 'That order could not be found.',
      currentStatus: null,
    });
  });

  test('an id that does not decode, or is another type of id, is NOT_FOUND and ordering is not called', async () => {
    for (const bad of [
      'not-base64!',
      toGlobalId('Order', ORDER_ID),
      toGlobalId('Listing', ORDER_ID),
      '',
      'VmVuZG9yT3JkZXI6',
    ]) {
      const { body } = await act('CONFIRM', bad);
      assert.equal(body.data.vendorOrderAction.code, 'NOT_FOUND', `id ${JSON.stringify(bad)}`);
    }
    assert.equal(seen.length, 0);
  });

  test('a hostile order id cannot change the path sent to ordering', async () => {
    const { body } = await act('CONFIRM', toGlobalId('VendorOrder', '../../vendor/orders?x=1#'));
    assert.equal(body.errors, undefined);
    assert.equal(seen.length, 1);
    assert.equal(new URL(seen[0]!.url, 'http://x').pathname.split('/').length, 5); // /ordering/orders/{one segment}/confirm
    assert.ok(seen[0]!.url.endsWith('/confirm'));
    assert.ok(seen[0]!.url.startsWith('/ordering/orders/..%2F'));
  });

  test('an action the enum does not have is refused by the schema before anything is sent', async () => {
    const { body } = await act('CANCEL');
    assert.ok(body.errors && body.errors.length > 0);
    assert.equal(seen.length, 0);
  });

  test('no token: UNAUTHENTICATED and ordering is not called', async () => {
    const { body } = await act('CONFIRM', gid, {});
    assert.equal(body.errors![0].extensions.code, 'UNAUTHENTICATED');
    assert.equal(seen.length, 0);
  });

  test('ordering rejecting the token is UNAUTHENTICATED', async () => {
    mode = 'unauthorized';
    const { body } = await act('CONFIRM');
    assert.equal(body.errors![0].extensions.code, 'UNAUTHENTICATED');
  });

  test('a token without the vendor role (ordering answers 403) is FORBIDDEN', async () => {
    mode = 'forbidden';
    const { body } = await act('CONFIRM');
    assert.equal(body.errors![0].extensions.code, 'FORBIDDEN');
  });

  test('a failing ordering is the generic INTERNAL error, with none of its detail and no token in the logs', async () => {
    mode = 'error';
    const { body } = await act('CONFIRM');
    assert.equal(body.errors![0].extensions.code, 'INTERNAL');
    const text = JSON.stringify(body) + JSON.stringify(logs);
    assert.ok(!text.includes('cosmos.internal'));
    assert.ok(!text.includes(TOKEN));
  });

  test('a status ordering sends that the schema has no name for is an internal error, not a guess', async () => {
    mode = 'badstatus';
    const { body } = await act('CONFIRM');
    assert.equal(body.errors![0].extensions.code, 'INTERNAL');
  });

  test('an ordering that never answers ends in a bounded wait with the generic error', async () => {
    mode = 'slow';
    const started = Date.now();
    const { body } = await act('CONFIRM');
    assert.equal(body.errors![0].extensions.code, 'INTERNAL');
    assert.ok(Date.now() - started < 3000);
  });
});
