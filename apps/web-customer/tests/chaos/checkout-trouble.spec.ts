import { expect, test } from '@playwright/test';
import { userToken } from '../skeleton/support';
import { placeBatchAndCheck } from './invariants';
import { newKey, onlyUnder, orderInput, placeWithRetries, recordMetrics } from './support';

// Chaos scenario checkout-trouble (chaos/scenarios/checkout-trouble.json): payment declines 20% with 800 ms latency, catalog unavailable or refusing 10% each,
// repository conflicts 10%, broadcast drops 30%. What must hold: no order is lost or duplicated, a failed checkout leaves nothing and gives its stock back,
// and the vendor queue converges. Needs the whole local stack: node scripts/ci/chaos-smoke.mjs checkout-trouble
// That the faults really happened is checked by that script once the services have stopped (their log files, the journal, are complete only then).
onlyUnder('checkout-trouble');

test('orders placed through payment, catalog, repository and broadcast faults: none lost, none duplicated, stock and the vendor queue agree', async () => {
  await placeBatchAndCheck('checkout-trouble', 30);
});

// Register 179: after a checkout failed and gave its stock back, a retry with the SAME idempotency key used to get CONFLICT for 30 days (the catalog refused to
// reuse the released reservation). The catalog now reserves again for the same lines; this keeps that true: a careful client's retries recover.
test('a client that retries with the same idempotency key recovers from a decline or an unavailable service (register 179)', async () => {
  const customer = await userToken('user-customer-1');
  const placements = [];
  for (let i = 0; i < 12; i++)
    placements.push(await placeWithRetries(customer, orderInput('listing-sourdough-001', newKey('recover'))));
  const notRecovered = placements.filter((p) => !p.orderId);
  recordMetrics('checkout-trouble-recovery', {
    orders: placements.length,
    neededARetry: placements.filter((p) => p.attempts > 1).length,
    notRecoveredAfterRetries: notRecovered.length,
    outcomesOfNotRecovered: notRecovered.map((p) => p.outcomes),
  });
  expect(notRecovered, 'orders that never succeeded although the client retried with the same key').toHaveLength(0);
});
