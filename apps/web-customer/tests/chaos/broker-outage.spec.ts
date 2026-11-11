import { expect, test } from '@playwright/test';
import { userToken } from '../skeleton/support';
import {
  BFF,
  newKey,
  onlyUnder,
  orderInput,
  placeWithRetries,
  recordMetrics,
  secondsUntil,
  vendorGlobalId,
  vendorOrderIds,
} from './support';

// Chaos scenario broker-outage (chaos/scenarios/broker-outage.json): the event transport is down from 5 s to 30 s after the ordering service starts (the runner
// starts it again just before this spec, so the window falls inside the run). Orders are placed steadily across the window: before it, during it and after it.
// What must hold: an order is accepted whether or not its events can be published (the order is stored first), the order stays readable by its customer
// during the outage, and once the outage ends the vendor's queue catches up to every confirmed order, with nothing extra. Needs the whole local stack:
// node scripts/ci/chaos-smoke.mjs broker-outage
onlyUnder('broker-outage');
test.describe.configure({ mode: 'serial' });

const placed: { orderId: string; atSecond: number }[] = [];
const failed: string[][] = [];
let queueBefore = new Set<string>();

test('orders placed before, during and after an event outage are all accepted and stay readable by their customer', async () => {
  const customer = await userToken('user-customer-1');
  const vendor = await userToken('vendor-shop-001');
  queueBefore = new Set(await vendorOrderIds(vendor));

  const started = Date.now();
  // About 70 s of orders, one every ~1.5 s: well past the 30 s end of the window, whenever in it the spec started.
  while ((Date.now() - started) / 1000 < 70) {
    const p = await placeWithRetries(customer, orderInput('listing-latte-001', newKey('outage'), 1));
    if (p.orderId) placed.push({ orderId: p.orderId, atSecond: Math.round((Date.now() - started) / 1000) });
    else failed.push(p.outcomes);
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Accepted: an outage of the event transport must not turn an order away.
  expect(failed, 'orders that were never accepted although the client retried').toEqual([]);
  expect(placed.length).toBeGreaterThan(10);

  // Readable: the customer reads each order from the order store, not through the events.
  for (const { orderId } of placed) {
    const r = await fetch(`${BFF}/graphql`, {
      method: 'POST',
      headers: { authorization: `Bearer ${customer}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'query($id: ID!) { order(id: $id) { id status } }', variables: { id: orderId } }),
    });
    const body = (await r.json()) as { data?: { order?: { id: string } | null } };
    expect(body.data?.order?.id, `order ${orderId} cannot be read`).toBe(orderId);
  }
  recordMetrics('broker-outage', {
    ordersConfirmed: placed.length,
    ordersNotAccepted: failed.length,
    ordersPlacedInTheFirst40Seconds: placed.filter((p) => p.atSecond <= 40).length,
    confirmedServiceOrderIds: placed.map((p) => Buffer.from(p.orderId, 'base64').toString('utf8').split(':')[1]),
  });
});

// Register 183 (open, needs a decision): an outage parks the outbox of every order whose events failed 5 times (register 74: parking was meant for events that
// can never succeed), and a parked order waits for an operator, so these orders never reach the vendor's queue or the notifications. Stated here as the
// behaviour we want; marked as an expected failure until 183 is decided and fixed (Playwright then flags it the day it is fixed).
test('once the outage is over the vendor queue holds every confirmed order, once (register 182, known gap)', async () => {
  test.fail(true, 'register 182: orders whose events failed during the outage are parked and never published');
  const vendor = await userToken('vendor-shop-001');
  const want = placed.map((p) => vendorGlobalId(p.orderId));
  const seconds = await secondsUntil(async () => {
    const queue = new Set(await vendorOrderIds(vendor));
    return want.every((id) => queue.has(id));
  }, 90);
  const queueAfter = await vendorOrderIds(vendor);
  const missing = want.filter((id) => !queueAfter.includes(id)).length;
  recordMetrics('broker-outage-queue', {
    confirmedOrders: want.length,
    missingFromTheQueueAfter90Seconds: missing,
    secondsToConverge: seconds,
  });
  expect(seconds, `${missing} confirmed orders never reached the vendor queue`).not.toBeNull();
  expect(
    queueAfter.filter((id) => !queueBefore.has(id) && !want.includes(id)),
    'orders in the queue that were never confirmed',
  ).toEqual([]);
  expect(new Set(queueAfter).size, 'an order appears twice in the queue').toBe(queueAfter.length);
});
