import { expect } from '@playwright/test';
import { userToken } from '../skeleton/support';
import {
  customerOrderIds,
  ensureQuantityAtLeast,
  newKey,
  readQuantity,
  orderInput,
  placeWithRetries,
  recordMetrics,
  secondsUntil,
  serviceOrderId,
  vendorGlobalId,
  vendorOrderIds,
  type Placement,
} from './support';

const SOURDOUGH = 'listing-sourdough-001';

export interface BatchResult {
  placements: Placement[];
  confirmed: string[];
  unconfirmed: Placement[];
  stockBefore: number;
  stockAfter: number;
  newCustomerOrders: string[];
  secondsToQueueConvergence: number | null;
}

/**
 * The invariants every checkout scenario must keep, however the faults fall: N orders are placed by a client that retries with the same idempotency key.
 * Afterwards: every order the client was told about exists exactly once; no order exists that the client was not told about (a failure leaves nothing
 * behind); the stock fell by exactly the confirmed orders (a failure gives stock back, a retry takes it once); and the vendor's queue converges to
 * hold every confirmed order and nothing else of this run. Data created here only: the orders carry this run's keys, and the counts are differences.
 * Returns the figures the scenario records as resilience metrics.
 */
export async function placeBatchAndCheck(
  name: string,
  count: number,
  options: { assertStock?: boolean } = {},
): Promise<BatchResult> {
  const assertStock = options.assertStock ?? true;
  const customer = await userToken('user-customer-1');
  const vendor = await userToken('vendor-shop-001');

  await ensureQuantityAtLeast(vendor, SOURDOUGH, count + 40); // headroom, so stock never decides the outcome
  const stockBefore = await readQuantity(vendor, SOURDOUGH);
  const ordersBefore = new Set(await customerOrderIds(customer));
  const queueBefore = new Set(await vendorOrderIds(vendor));

  const placements: Placement[] = [];
  for (let i = 0; i < count; i++)
    placements.push(await placeWithRetries(customer, orderInput(SOURDOUGH, newKey(name))));

  const confirmed = placements.filter((p) => p.orderId).map((p) => p.orderId!);
  const unconfirmed = placements.filter((p) => !p.orderId);

  // 1. No duplicate: the client was never given the same order for two different keys, and each confirmed order is in the list exactly once.
  expect(new Set(confirmed).size, 'two different checkouts were given the same order').toBe(confirmed.length);
  const ordersAfter = await customerOrderIds(customer);
  const newCustomerOrders = ordersAfter.filter((id) => !ordersBefore.has(id));
  for (const id of confirmed)
    expect(
      newCustomerOrders.filter((x) => x === id),
      `order ${id} should be listed once`,
    ).toHaveLength(1);

  // 2. No order the client was not told about. An unconfirmed checkout (every attempt failed) must leave no order behind.
  expect(
    newCustomerOrders.filter((id) => !confirmed.includes(id)),
    `orders exist that the client was never told about (attempts: ${JSON.stringify(unconfirmed.map((u) => u.outcomes))})`,
  ).toEqual([]);

  // 3. Stock: it fell by the confirmed orders and by nothing else.
  const stockAfter = await readQuantity(vendor, SOURDOUGH);
  const stockDiscrepancy = confirmed.length - (stockBefore - stockAfter); // orders confirmed whose stock is not held (0 when it holds)
  if (assertStock) expect(stockDiscrepancy, 'stock after must be stock before minus the confirmed orders').toBe(0);

  // 4. The vendor's queue converges: it holds every confirmed order and none that is not ours to explain.
  const want = confirmed.map(vendorGlobalId);
  const secondsToQueueConvergence = await secondsUntil(async () => {
    const queue = new Set(await vendorOrderIds(vendor));
    return want.every((id) => queue.has(id));
  });
  expect(secondsToQueueConvergence, 'the vendor queue never held every confirmed order').not.toBeNull();
  const queueAfter = await vendorOrderIds(vendor);
  const stray = queueAfter.filter((id) => !queueBefore.has(id) && !want.includes(id));
  expect(stray, 'the vendor queue shows orders that were never confirmed').toEqual([]);
  expect(new Set(queueAfter).size, 'an order appears twice in the vendor queue').toBe(queueAfter.length);

  const attemptsPerOrder = placements.map((p) => p.attempts);
  recordMetrics(name, {
    orders: count,
    confirmed: confirmed.length,
    notConfirmedAfterRetries: unconfirmed.length,
    lostOrders: 0, // asserted above: a confirmed order is always found, and an unconfirmed one leaves nothing
    duplicateOrders: 0, // asserted above
    stockBefore,
    stockAfter,
    confirmedOrdersWhoseStockIsNotHeld: stockDiscrepancy,
    confirmedServiceOrderIds: confirmed.map((id) => Buffer.from(id, 'base64').toString('utf8').split(':')[1]),
    outcomesOfUnconfirmedOrders: unconfirmed.map((u) => ({
      orderId: serviceOrderId('user-customer-1', u.key),
      outcomes: u.outcomes,
    })),
    outcomesOfAllAttempts: placements
      .flatMap((p) => p.outcomes)
      .reduce<Record<string, number>>((h, o) => ({ ...h, [o]: (h[o] ?? 0) + 1 }), {}),
    retriesNeeded: { max: Math.max(...attemptsPerOrder) - 1, total: attemptsPerOrder.reduce((a, b) => a + b - 1, 0) },
    secondsToQueueConvergence,
  });
  return { placements, confirmed, unconfirmed, stockBefore, stockAfter, newCustomerOrders, secondsToQueueConvergence };
}
