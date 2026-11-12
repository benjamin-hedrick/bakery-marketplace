import { expect, test } from '@playwright/test';
import { globalId, userToken } from '../skeleton/support';
import { gql, onlyUnder, readQuantity, recordMetrics } from './support';

// Chaos scenario stale-cache (chaos/scenarios/stale-cache.json): every DELETE on the catalog's cache Redis fails and leaves the entry in place, so every
// invalidation fails (the catalog runs with Cache__Backend=redis for this scenario). ADR-0002 accepts that case and `ListingCache` documents it: "a failed
// invalidation is logged; the entry then lives until its TTL". What must hold: from the TTL (plus a margin for the load that follows the expiry) after a change,
// the customer sees the new status. What the spec also records, because it is what happens: when the old status was seen, and whether it came back after the
// new one was seen (the resilient cache's breaker opens on the failed deletes and serves from the store, then closes and serves the primary's old entry again).
// Needs the whole local stack: node scripts/ci/chaos-smoke.mjs stale-cache
onlyUnder('stale-cache');
test.describe.configure({ mode: 'serial' });

const CATALOG = process.env.CATALOG_URL ?? 'http://localhost:5200';
const TTL_SECONDS = 60; // ListingCache:TtlSeconds, ADR-0002
const MARGIN_SECONDS = 15;
const LISTING = 'listing-croissant-001'; // a seeded listing with a counted stock; its stock is put back at the end, as the skeleton journey that also uses it does

test('after a status change whose invalidation failed, the customer sees the new status once the TTL has passed', async () => {
  test.setTimeout(420_000);
  const customer = await userToken('user-customer-1');
  const vendor = await userToken('vendor-shop-001');
  const status = async () =>
    (
      await gql(customer, `query($id: ID!) { listing(id: $id) { stock { status } } }`, {
        id: globalId('Listing', LISTING),
      })
    ).body?.data?.listing?.stock?.status as string | undefined;
  const adjust = (delta: number) =>
    fetch(`${CATALOG}/catalog/listings/${LISTING}/stock/adjust`, {
      method: 'POST',
      headers: { authorization: `Bearer ${vendor}`, 'content-type': 'application/json' },
      body: JSON.stringify({ delta }),
    });

  // The catalog's own start-up invalidations (seeding) fail too under this scenario, and three failures in a row open the resilient cache's breaker for 30 s, during
  // which nothing is stored in Redis. Wait that out, so the entry the change must replace is really in the primary store.
  await new Promise((r) => setTimeout(r, 35_000));

  const have = await readQuantity(vendor, LISTING);
  expect(have, 'the listing has no counted stock to sell out').toBeGreaterThan(0);
  expect(['IN_STOCK', 'LOW']).toContain(await status()); // reads the listing through the cache and fills the entry

  const samples: { at: number; status: string | undefined }[] = [];
  let changedAt = 0;
  try {
    expect((await adjust(-have)).ok, 'the vendor could not sell the stock out').toBe(true);
    changedAt = Date.now();
    // Watch the customer's view for the TTL, the margin and a little more.
    while ((Date.now() - changedAt) / 1000 < TTL_SECONDS + MARGIN_SECONDS + 15) {
      samples.push({ at: (Date.now() - changedAt) / 1000, status: await status() });
      await new Promise((r) => setTimeout(r, 500));
    }
  } finally {
    const now = await readQuantity(vendor, LISTING); // leave the stock as the other journeys expect it
    if (now !== have) await adjust(have - now);
  }

  const isNew = (s: { status?: string }) => s.status === 'SOLD_OUT';
  const stale = samples.filter((s) => !isNew(s));
  const firstNew = samples.find(isNew);
  const lastStale = stale.at(-1);
  const flapped = firstNew !== undefined && stale.some((s) => s.at > firstNew.at); // the old status came back after the new one was seen
  recordMetrics('stale-cache', {
    ttlSeconds: TTL_SECONDS,
    samples: samples.length,
    staleSamples: stale.length,
    secondsOfFirstNewStatus: firstNew?.at ?? null,
    secondsOfFirstStaleSample: stale[0]?.at ?? null,
    secondsOfLastStaleSample: lastStale?.at ?? null,
    theOldStatusCameBackAfterTheNewOne: flapped,
  });

  expect(
    stale.length,
    'the old status was never served after the change: the failed invalidation had no effect, so the pass proves nothing',
  ).toBeGreaterThan(0);
  expect(firstNew, 'the customer never saw the new status').toBeDefined();
  expect(
    samples.filter((s) => s.at > TTL_SECONDS + MARGIN_SECONDS && !isNew(s)),
    `the old status was still served more than ${TTL_SECONDS + MARGIN_SECONDS} s after the change`,
  ).toEqual([]);
});
