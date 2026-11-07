// ORD-011: the app asks the BFF to cancel the customer's order and turns the answer into what customer-core has words for.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { cancelOrder } from '../src/cancel.ts';

type Call = Parameters<typeof cancelOrder>[1] & {};

const answering =
  (data: unknown): Call =>
  async () =>
    data as never;

describe('cancelOrder', () => {
  test('sends the order id with the customer’s login', async () => {
    let seen: { query: string; variables: unknown; options: unknown } | undefined;
    const call: Call = async (query, variables, options) => {
      seen = { query, variables, options };
      return { cancelOrder: { __typename: 'CancelOrderDone', orderId: 'T3JkZXI6eA==', status: 'CANCELLED' } } as never;
    };

    await cancelOrder('T3JkZXI6eA==', call);

    assert.match(seen!.query, /cancelOrder\(input: \$input\)/);
    assert.deepEqual(seen!.variables, { input: { orderId: 'T3JkZXI6eA==' } });
    assert.deepEqual(seen!.options, { authenticated: true });
  });

  test('a cancel that went through is "cancelled"', async () => {
    const done = answering({ cancelOrder: { __typename: 'CancelOrderDone', orderId: 'x', status: 'CANCELLED' } });
    assert.equal(await cancelOrder('x', done), 'cancelled');
  });

  test('an order that is not theirs, or is gone, is "missing"', async () => {
    const missing = answering({
      cancelOrder: { __typename: 'CancelOrderRejected', code: 'NOT_FOUND', currentStatus: null },
    });
    assert.equal(await cancelOrder('x', missing), 'missing');
  });

  test('an order the bakery has moved on is "not_allowed_now"', async () => {
    const late = answering({
      cancelOrder: { __typename: 'CancelOrderRejected', code: 'NOT_ALLOWED_NOW', currentStatus: 'IN_PREPARATION' },
    });
    assert.equal(await cancelOrder('x', late), 'not_allowed_now');
  });

  test('a request that failed, by the network or by the service, is "failed", never a guess that it worked', async () => {
    const down: Call = async () => {
      throw new Error('network down');
    };
    assert.equal(await cancelOrder('x', down), 'failed');
  });
});
