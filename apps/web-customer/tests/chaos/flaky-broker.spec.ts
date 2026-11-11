import { test } from '@playwright/test';
import { placeBatchAndCheck } from './invariants';
import { onlyUnder } from './support';

// Chaos scenario flaky-broker (chaos/scenarios/flaky-broker.json): the event transport fails 30% of publishes, delivers 20% of events twice, reorders 20% and fails
// 30% of handler runs. What must hold: every order is still accepted and stored (the order is stored before its events are published), the vendor's queue converges
// to hold each confirmed order exactly once and nothing else, whatever the order or repetition of the events, and (checked by scripts/ci/chaos-smoke.mjs from the
// notification service's log) a confirmed order gets its notification and no event is sent twice. Needs the whole local stack: node scripts/ci/chaos-smoke.mjs flaky-broker
onlyUnder('flaky-broker');

test('orders placed while the event transport drops, repeats and reorders events: none lost, none duplicated, the vendor queue converges, one notification per event', async () => {
  await placeBatchAndCheck('flaky-broker', 30);
});
