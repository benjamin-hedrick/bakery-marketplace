import { expect, test } from '@playwright/test';
import { userToken } from '../skeleton/support';
import { placeBatchAndCheck } from './invariants';
import { newKey, onlyUnder, orderInput, placeWithRetries, recordMetrics } from './support';

// Chaos scenario lost-confirmation (chaos/scenarios/lost-confirmation.json): the work is done but the answer is lost. The store write succeeds and the caller is
// told it timed out (repository, 20%); the payment is authorized and the caller is told it timed out (payment, 25%); the ordering service answers and the BFF
// never receives it (bffOrdering, 20%). A client that retries with the same idempotency key must end with exactly one order, one stock deduction and a
// queue that agrees. Needs the whole local stack: node scripts/ci/chaos-smoke.mjs lost-confirmation
onlyUnder('lost-confirmation');

test('an order made but whose confirmation was lost: the retry finds it; none lost, none duplicated, the queue agrees', async () => {
  await placeBatchAndCheck('lost-confirmation', 30, { assertStock: false }); // the stock figure is the next test (register 180)
});

// Register 180 (open): when the store write of an order succeeds but its answer is lost, checkout releases the reservation (it thinks the order failed),
// while the order exists, so the stock is given back for an order that stands: stock can be oversold. Expected failure until 180 is decided and fixed.
test('an order whose store write answer was lost still holds its stock (register 180, known gap)', async () => {
  test.fail(true, 'register 180: the reservation is released although the order was stored');
  await placeBatchAndCheck('lost-confirmation-stock', 12);
});

// Register 171, part 1 (open): a payment authorized whose answer was lost is authorized AGAIN by the customer's retry, because IPaymentProcessor has no
// idempotency key and no void. The stub moves no money, but the real processor (PAY-001) would. This test places the orders and records their keys; the
// runner counts the authorizations per order in the ordering service's log once it has stopped (the log is complete only then) and reports a double
// authorization as the known gap until PAY-001 builds the idempotency key and the void. It is also hit by register 179 (a released reservation cannot be
// reused), so not every order recovers; what it asserts is only that the orders were attempted.
test('payment lost-answer orders: placed with retries, keys recorded for the authorization count (register 171)', async () => {
  const customer = await userToken('user-customer-1');
  const keys = Array.from({ length: 25 }, () => newKey('lost-payment'));
  const placements = [];
  for (const key of keys) placements.push(await placeWithRetries(customer, orderInput('listing-sourdough-001', key)));
  recordMetrics('lost-confirmation-payment', {
    customerId: 'user-customer-1',
    keys,
    confirmed: placements.filter((p) => p.orderId).length,
    notRecoveredAfterRetries: placements.filter((p) => !p.orderId).length,
  });
  expect(placements.length).toBe(keys.length);
});
