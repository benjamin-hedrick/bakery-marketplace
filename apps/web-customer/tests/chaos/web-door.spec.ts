import { expect, test } from '@playwright/test';
import { userToken } from '../skeleton/support';
import { openHistoryThroughFaults, reloadHistoryRepeatedly } from './browser';
import { newKey, onlyUnder, orderInput, placeWithRetries, recordMetrics } from './support';

// Chaos scenario web-door (chaos/scenarios/web-door.json): the web server's GraphQL route waits 150 ms, answers 503 for 20% of requests, a non-JSON page for 10%
// and resets the connection for 5%, before the session, the rate limit or the BFF are reached (the BFF itself has no scenario). This is what the browser's own
// calls meet. What must hold: the page never stays blank or stuck, it says it could not load and offers Try again, and trying again works; the faults really
// reached the browser; and a checkout placed through the door never produces a stray order. Needs the whole local stack: node scripts/ci/chaos-smoke.mjs web-door
onlyUnder('web-door');
test.describe.configure({ mode: 'serial' });

test('the order history says when it could not load, offers Try again, and recovers', async ({ page }) => {
  // The customer needs at least one order of their own to see; the BFF has no faults in this scenario, so one placement is enough.
  const customer = await userToken('user-customer-1');
  const placed = await placeWithRetries(customer, orderInput('listing-sourdough-001', newKey('web-door')));
  expect(placed.orderId, 'the order the page should show could not be placed').not.toBeNull();

  const run = await openHistoryThroughFaults(page, 25);
  recordMetrics('web-door-browser', { ...run });
  await expect(page.getByTestId('history-order').first()).toBeVisible();
});

test('the page survives a reloaded history repeatedly, whatever the door does', async ({ page }) => {
  await openHistoryThroughFaults(page, 25);
  // Fifteen loads, so the door's faults are met whatever the requests' numbers fall on; a single load proves nothing about the faults.
  const reloads = await reloadHistoryRepeatedly(page, 15);
  recordMetrics('web-door-reloads', reloads);
  expect(reloads.failedThenRecovered, 'no fault reached the browser: the pass would prove nothing').toBeGreaterThan(0);
});
