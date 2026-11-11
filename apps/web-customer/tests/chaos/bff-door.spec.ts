import { expect, test } from '@playwright/test';
import { userToken } from '../skeleton/support';
import { openHistoryThroughFaults, reloadHistoryRepeatedly } from './browser';
import { placeBatchAndCheck } from './invariants';
import { gql, newKey, onlyUnder, orderInput, placeWithRetries, recordMetrics } from './support';

// Chaos scenario bff-door (chaos/scenarios/bff-door.json): the BFF's own door waits 150 ms, answers 503 for 20% of requests, a non-JSON page for 10% and resets
// the connection for 5%; its calls to the catalog fail 10% of the time (and lose 5% of the answers) and to ordering fail 10% (and lose 10% of the answers).
// What must hold: a failed answer is plainly a failure, never wrong data; a client that retries gets through; a placeOrder whose answer was lost and is retried
// with the same idempotency key gives exactly one order; the customer's page says it could not load and lets them try again. Needs the whole local stack:
// node scripts/ci/chaos-smoke.mjs bff-door
onlyUnder('bff-door');
test.describe.configure({ mode: 'serial' });

const LISTINGS = `{ listings(first: 50) { edges { node { id name } } } }`;

test('orders placed through the BFF door and its service calls: none lost, none duplicated, stock and the vendor queue agree', async () => {
  await placeBatchAndCheck('bff-door', 30);
});

test('a read is either the right data or a plain failure, and a client that retries always gets the data', async () => {
  const customer = await userToken('user-customer-1');
  let failures = 0;
  let injectedAnswers = 0;
  let neededRetry = 0;
  let worstAttempts = 0;
  const failureKinds: Record<string, number> = {};
  const silentWrongAnswers: string[] = [];
  const failuresWithoutCorrelationId: number[] = [];

  for (let i = 0; i < 40; i++) {
    let attempts = 0;
    for (;;) {
      attempts++;
      const r = await gql(customer, LISTINGS);
      if (r.injected?.length) injectedAnswers++;
      const edges = r.body?.data?.listings?.edges as { node: { id: string } }[] | undefined;
      if (r.status === 200 && edges && !r.body?.errors?.length) {
        // A good answer must be the real catalog, not an empty or partial stand-in.
        if (edges.length === 0) silentWrongAnswers.push('200 with no listings and no errors');
        break;
      }
      failures++;
      const kind = r.transportError ?? r.body?.errors?.[0]?.extensions?.code ?? `http-${r.status}`;
      failureKinds[kind] = (failureKinds[kind] ?? 0) + 1;
      // A 200 with data null and no errors would be a silent failure; any answer that is not data must say so.
      if (r.status === 200 && !r.transportError && !r.body?.errors?.length)
        silentWrongAnswers.push('200 without data or errors');
      if (r.body && r.status !== 0 && !r.correlationId) failuresWithoutCorrelationId.push(r.status);
      if (attempts >= 12)
        throw new Error(`the listings could not be read after ${attempts} attempts: ${JSON.stringify(failureKinds)}`);
      await new Promise((res) => setTimeout(res, 100 * attempts));
    }
    if (attempts > 1) neededRetry++;
    worstAttempts = Math.max(worstAttempts, attempts);
  }

  recordMetrics('bff-door-reads', {
    reads: 40,
    failedAnswers: failures,
    readsThatNeededARetry: neededRetry,
    mostAttemptsForOneRead: worstAttempts,
    answersWithAnInjectedFault: injectedAnswers,
    failureKinds,
  });
  expect(injectedAnswers, 'no fault was injected into any answer: the pass would prove nothing').toBeGreaterThan(0);
  expect(silentWrongAnswers, 'answers that looked successful but were not').toEqual([]);
  expect(failuresWithoutCorrelationId, 'failed JSON answers that carry no correlation id (ADR-0016)').toEqual([]);
});

test('a placeOrder whose answer is lost and is retried with the same key gives exactly one order', async () => {
  const customer = await userToken('user-customer-1');
  const placements = [];
  for (let i = 0; i < 15; i++)
    placements.push(await placeWithRetries(customer, orderInput('listing-sourdough-001', newKey('bff-door-key')), 12));
  const retried = placements.filter((p) => p.attempts > 1);
  const orderIds = placements.filter((p) => p.orderId).map((p) => p.orderId!);
  recordMetrics('bff-door-retry', {
    orders: placements.length,
    neededARetry: retried.length,
    notRecoveredAfterRetries: placements.length - orderIds.length,
  });
  expect(orderIds, 'a checkout never succeeded although the client retried with the same key').toHaveLength(
    placements.length,
  );
  expect(new Set(orderIds).size, 'two checkouts were given the same order').toBe(orderIds.length);
});

test('the order history in the browser says when it could not load, offers Try again, and recovers', async ({
  page,
}) => {
  const run = await openHistoryThroughFaults(page);
  const reloads = await reloadHistoryRepeatedly(page, 15); // several loads, so the failure notice is met at least once whatever the keys fall on
  recordMetrics('bff-door-browser', { ...run, reloads });
  expect(
    run.chaosAnswersSeen + reloads.failedThenRecovered,
    'no fault reached the browser: the pass would prove nothing',
  ).toBeGreaterThan(0);
  await expect(page.getByTestId('history-order').first()).toBeVisible();
});
