import { expect, test } from '@playwright/test';
import { globalId, userToken } from '../skeleton/support';
import {
  customerOrderIds,
  gql,
  newKey,
  onlyUnder,
  orderInput,
  placeWithRetries,
  readQuantity,
  recordMetrics,
  secondsUntil,
} from './support';

// Chaos scenario slow-cache (chaos/scenarios/slow-cache.json): the cache Redis under the catalog's listing cache waits 250 ms and fails half of its operations
// (the catalog runs with Cache__Backend=redis for this scenario; the chaos layer wraps that primary store). What must hold (ADR-0002, ADR-0014): a cache failure
// never fails or changes a public read, what a customer sees of a change is stale for no longer than the entry's TTL even when the invalidation itself failed,
// and order and cart data, which is never cached, is never stale. Needs the whole local stack: node scripts/ci/chaos-smoke.mjs slow-cache
onlyUnder('slow-cache');
test.describe.configure({ mode: 'serial' });

const CATALOG = process.env.CATALOG_URL ?? 'http://localhost:5200';
const TTL_SECONDS = 60; // ListingCache:TtlSeconds, ADR-0002
const LATTE = 'listing-croissant-001'; // a seeded listing with a counted stock (4); its stock is put back at the end, as the skeleton journey that also uses it does

const LISTINGS = `{ listings(first: 50) { edges { node { id stock { status } } } } }`;
const STATUS = `query($id: ID!) { listing(id: $id) { stock { status } } }`;

test('public listing reads never fail and never change while the cache fails half the time', async () => {
  const customer = await userToken('user-customer-1');
  const sets: string[] = [];
  let failures = 0;
  for (let i = 0; i < 40; i++) {
    const r = await gql(customer, LISTINGS);
    const edges = r.body?.data?.listings?.edges as { node: { id: string } }[] | undefined;
    if (r.status !== 200 || !edges || r.body?.errors?.length) {
      failures++;
      continue;
    }
    sets.push(
      edges
        .map((e) => e.node.id)
        .sort()
        .join(','),
    );
  }
  recordMetrics('slow-cache-reads', { reads: 40, failedReads: failures, distinctAnswers: new Set(sets).size });
  expect(failures, 'a cache failure failed a read').toBe(0);
  expect(new Set(sets).size, 'the listings changed between reads although nothing changed').toBe(1);
  expect(sets[0]!.length, 'the answer holds no listings').toBeGreaterThan(0);
});

test('a status change reaches the customer within the cache TTL even when the invalidation failed', async () => {
  test.setTimeout(600_000); // each failed invalidation can cost up to the TTL, and the cycles below make several of them likely
  const customer = await userToken('user-customer-1');
  const vendor = await userToken('vendor-shop-001');
  const status = async () =>
    (await gql(customer, STATUS, { id: globalId('Listing', LATTE) })).body?.data?.listing?.stock?.status as
      string | undefined;
  const adjust = (delta: number) =>
    fetch(`${CATALOG}/catalog/listings/${LATTE}/stock/adjust`, {
      method: 'POST',
      headers: { authorization: `Bearer ${vendor}`, 'content-type': 'application/json' },
      body: JSON.stringify({ delta }),
    });

  const have = await readQuantity(vendor, LATTE);
  expect(have, 'the latte has no stock to sell out').toBeGreaterThan(0);
  expect(['IN_STOCK', 'LOW']).toContain(await status());
  // Four sell-out and put-back cycles: each makes two status changes and each change invalidates the cached entry, which fails half the time here, so some of
  // the eight invalidations fail (the chance that none does is under 1%). A failed one leaves the old entry until its TTL; that bound is what is asserted.
  const soldOutAfter: (number | null)[] = [];
  const availableAfter: (number | null)[] = [];
  try {
    for (let cycle = 0; cycle < 4; cycle++) {
      expect((await adjust(-have)).ok, 'the vendor could not sell the stock out').toBe(true);
      soldOutAfter.push(await secondsUntil(async () => (await status()) === 'SOLD_OUT', TTL_SECONDS + 15));
      expect((await adjust(have)).ok, 'the stock was not put back').toBe(true);
      availableAfter.push(await secondsUntil(async () => (await status()) !== 'SOLD_OUT', TTL_SECONDS + 15));
    }
  } finally {
    const now = await readQuantity(vendor, LATTE); // leave the stock as the other journeys expect it
    if (now !== have) await adjust(have - now);
  }
  const all = [...soldOutAfter, ...availableAfter];
  recordMetrics('slow-cache-freshness', {
    ttlSeconds: TTL_SECONDS,
    secondsUntilCustomerSawSoldOut: soldOutAfter,
    secondsUntilCustomerSawItAvailableAgain: availableAfter,
    changesThatTookMoreThanASecond: all.filter((s) => s !== null && s > 1).length,
  });
  expect(all, `a customer still saw the old status ${TTL_SECONDS + 15} s after a change`).not.toContain(null);
});

test('orders are never stale and an authenticated answer is private, no-store', async () => {
  const customer = await userToken('user-customer-1');
  const stale: string[] = [];
  const headers = new Set<string>();
  for (let i = 0; i < 8; i++) {
    const p = await placeWithRetries(customer, orderInput('listing-sourdough-001', newKey('slow-cache')));
    expect(p.orderId, 'an order could not be placed').not.toBeNull();
    // Read at once: no waiting, no retry for staleness. The order was stored before the answer came, and nothing caches the list.
    if (!(await customerOrderIds(customer)).includes(p.orderId!)) stale.push(p.orderId!);
    const r = await gql(customer, `{ orders(first: 5) { edges { node { id } } } }`);
    headers.add(r.cacheControl ?? '(none)');
  }
  recordMetrics('slow-cache-orders', {
    ordersPlaced: 8,
    ordersMissingFromTheListRightAfter: stale.length,
    cacheControlSeen: [...headers],
  });
  expect(stale, 'orders missing from the customer list right after they were placed').toEqual([]);
  for (const h of headers) expect(h, 'an authenticated answer must not be cacheable (ADR-0014)').toMatch(/no-store/);
});
