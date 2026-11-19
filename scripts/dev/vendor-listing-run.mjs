#!/usr/bin/env node
// WI-CAT-007 requirement 13: the vendor's listing writes against the real catalog, through the BFF, without a browser. It starts the local stack
// (Compose infrastructure, the seed, then the catalog service, the ordering service and the BFF as host processes, shared with the smoke run in
// scripts/lib/local-stack.mjs), signs in seeded users at the mock issuer, runs the steps below as GraphQL operations, prints each operation's variables
// and answer, checks each answer, and stops the host processes.
//
//   node scripts/dev/vendor-listing-run.mjs            run; Docker is left running
//   node scripts/dev/vendor-listing-run.mjs --down     run, then docker compose down (the data is lost)
//
// Starting state: the seed (tools/BakeryMarketplace.Seed): vendor-shop-001 and vendor-indep-001 verified, user-vendor-1 a vendor that is not verified,
// user-customer-1 a customer. The run makes its own listing with a new idempotency key, so it does not depend on what earlier runs left. It uses only the
// interfaces the product already has (the BFF's operations and the mock issuer's sign-in). Exit code 0 when every step answered as expected.
// Needs Docker, the .NET SDK, Node >= 24 and `npm ci` in services/graphql-bff. Logs: artifacts/vendor-listings/*.log. Ports 4100, 5200 and 5300 must be free.
import { randomUUID } from 'node:crypto';
import { bffUrl, createStack, issuerUrl } from '../lib/local-stack.mjs';
import { userToken } from '../lib/issuer-token.mjs';

const down = process.argv.includes('--down');
const stack = createStack({
  label: 'vendor-listings',
  outDir: 'artifacts/vendor-listings',
  distDir: '.next-vendor-listings',
});

const LISTING_FIELDS = `id name status price { cents } editVersion
  stock { status maxPerOrder availableQuantity lowStockThreshold }`;
const PAYLOAD = `__typename
  ... on ListingWriteSuccess { listing { ${LISTING_FIELDS} } }
  ... on ListingRejected { code message fields { field message } currentEditVersion }`;
const CREATE = `mutation Create($input: ListingInput!, $key: String!) { createListing(input: $input, idempotencyKey: $key) { ${PAYLOAD} } }`;
const UPDATE = `mutation Update($id: ID!, $input: ListingInput!, $v: Int!) {
  updateListing(id: $id, input: $input, expectedEditVersion: $v) { ${PAYLOAD} } }`;
const ADJUST = `mutation Adjust($id: ID!, $delta: Int!) { adjustListingStock(id: $id, delta: $delta) { ${PAYLOAD} } }`;
const MINE = `query Mine($id: ID!) { myListing(id: $id) { ${LISTING_FIELDS} } }`;
const PUBLIC = `query Public($id: ID!) { listing(id: $id) { id name price { cents } stock { status maxPerOrder } } }`;

let failures = 0;
let step = 0;

async function gql(token, query, variables) {
  const res = await fetch(bffUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30000),
  });
  return { status: res.status, body: await res.json() };
}

/** One step: what was sent, the raw answer, and whether it is what the step expects. */
async function run(title, who, token, query, variables, expect) {
  step += 1;
  const answer = await gql(token, query, variables);
  let verdict = 'PASS';
  try {
    expect(answer.body);
  } catch (e) {
    verdict = `FAIL (${e instanceof Error ? e.message : String(e)})`;
    failures += 1;
  }
  console.log(`\n### ${step}. ${title}`);
  console.log(`as: ${who}`);
  console.log(`variables: ${JSON.stringify(variables)}`);
  console.log(`HTTP ${answer.status}: ${JSON.stringify(answer.body)}`);
  console.log(`check: ${verdict}`);
  return answer.body;
}

function check(condition, what) {
  if (!condition) throw new Error(what);
}

const input = (over = {}) => ({
  name: 'Rye Sourdough (vendor listing run)',
  category: 'Bread',
  priceCents: 900,
  modifiers: [{ id: 'mod-seeds', name: 'Seed crust', priceDeltaCents: 100, allergens: ['sesame'] }],
  allergenFlags: ['gluten'],
  status: 'DRAFT',
  stock: { mode: 'COUNTED', availableQuantity: 10, maxPerOrder: 4, lowStockThreshold: 3 },
  ...over,
});

try {
  stack.up();
  await stack.startServices();

  const shop = await userToken(issuerUrl, 'vendor-shop-001');
  const indep = await userToken(issuerUrl, 'vendor-indep-001');
  const unverified = await userToken(issuerUrl, 'user-vendor-1');
  const customer = await userToken(issuerUrl, 'user-customer-1');
  const key = `run-${randomUUID()}`;
  console.log(`\nvendor listing run, ${new Date().toISOString()}; BFF ${bffUrl}; idempotency key ${key}`);

  const created = await run(
    'Create a counted draft with a new key',
    'vendor-shop-001',
    shop,
    CREATE,
    { input: input(), key },
    (b) => {
      const l = b.data.createListing.listing;
      check(b.data.createListing.__typename === 'ListingWriteSuccess', 'created');
      check(
        l.editVersion === 1 && l.status === 'DRAFT' && l.stock.availableQuantity === 10,
        'version 1, draft, 10 counted',
      );
    },
  );
  const id = created.data.createListing.listing.id;

  await run(
    'Repeat the same create (a retry after a timeout)',
    'vendor-shop-001',
    shop,
    CREATE,
    { input: input(), key },
    (b) => {
      check(b.data.createListing.__typename === 'ListingWriteSuccess', 'a success');
      check(b.data.createListing.listing.id === id, 'the same listing');
    },
  );

  await run(
    'The same key with a different listing',
    'vendor-shop-001',
    shop,
    CREATE,
    { input: input({ priceCents: 1 }), key },
    (b) => check(b.data.createListing.code === 'KEY_REUSED', 'KEY_REUSED'),
  );

  await run(
    'Edit with the current edit version (1): price 950',
    'vendor-shop-001',
    shop,
    UPDATE,
    { id, input: input({ priceCents: 950, stock: null }), v: 1 },
    (b) => {
      const l = b.data.updateListing.listing;
      check(l.price.cents === 950 && l.editVersion === 2, 'price 950 at version 2');
    },
  );

  await run(
    'Edit from the old copy (version 1): refused',
    'vendor-shop-001',
    shop,
    UPDATE,
    { id, input: input({ priceCents: 1, stock: null }), v: 1 },
    (b) => {
      check(b.data.updateListing.code === 'CHANGED', 'CHANGED');
      check(b.data.updateListing.currentEditVersion === 2, 'current version 2');
    },
  );

  await run('Adjust the count by -4 (as sales would)', 'vendor-shop-001', shop, ADJUST, { id, delta: -4 }, (b) => {
    const l = b.data.adjustListingStock.listing;
    check(l.stock.availableQuantity === 6 && l.editVersion === 2, 'count 6, version unchanged');
  });

  await run(
    'Change the threshold and the most per order of the counted listing (no quantity sent)',
    'vendor-shop-001',
    shop,
    UPDATE,
    { id, input: input({ priceCents: 950, stock: { mode: 'COUNTED', maxPerOrder: 2, lowStockThreshold: 6 } }), v: 2 },
    (b) => {
      const l = b.data.updateListing.listing;
      check(l.stock.availableQuantity === 6, 'the count kept at 6');
      check(
        l.stock.lowStockThreshold === 6 && l.stock.maxPerOrder === 2 && l.stock.status === 'LOW',
        'threshold 6, at most 2, LOW',
      );
      check(l.editVersion === 3, 'version 3');
    },
  );

  await run(
    'A counted edit that sends a quantity: refused with the catalog’s sentence',
    'vendor-shop-001',
    shop,
    UPDATE,
    { id, input: input({ priceCents: 950, stock: { mode: 'COUNTED', availableQuantity: 50 } }), v: 3 },
    (b) => {
      check(b.data.updateListing.code === 'INVALID', 'INVALID');
      check(
        b.data.updateListing.fields.some(
          (f) => f.field === 'stock.availableQuantity' && f.message === 'Change the quantity with an adjustment.',
        ),
        'the field and sentence',
      );
    },
  );

  await run(
    'Publish as a verified vendor',
    'vendor-shop-001',
    shop,
    UPDATE,
    { id, input: input({ priceCents: 950, status: 'PUBLISHED', stock: null }), v: 3 },
    (b) => {
      const l = b.data.updateListing.listing;
      check(
        l.status === 'PUBLISHED' && l.editVersion === 4 && l.stock.availableQuantity === 6,
        'published at version 4, count kept',
      );
    },
  );

  await run('The published listing as anyone sees it (no token)', 'nobody', undefined, PUBLIC, { id }, (b) => {
    check(b.data.listing?.id === id && b.data.listing.stock.status === 'LOW', 'public, LOW');
  });

  await run(
    'Another vendor edits the listing',
    'vendor-indep-001',
    indep,
    UPDATE,
    { id, input: input({ priceCents: 1, stock: null }), v: 4 },
    (b) => check(b.data.updateListing.code === 'NOT_FOUND', 'NOT_FOUND'),
  );
  await run('Another vendor adjusts the listing', 'vendor-indep-001', indep, ADJUST, { id, delta: 100 }, (b) =>
    check(b.data.adjustListingStock.code === 'NOT_FOUND', 'NOT_FOUND'),
  );
  await run('Another vendor reads the listing as their own', 'vendor-indep-001', indep, MINE, { id }, (b) =>
    check(b.data.myListing === null, 'null'),
  );

  await run('A customer reads it as their own listing', 'user-customer-1', customer, MINE, { id }, (b) =>
    check(b.errors?.[0]?.extensions?.code === 'FORBIDDEN', 'FORBIDDEN'),
  );
  await run('No token', 'nobody', undefined, ADJUST, { id, delta: 1 }, (b) =>
    check(b.errors?.[0]?.extensions?.code === 'UNAUTHENTICATED', 'UNAUTHENTICATED'),
  );

  await run(
    'A vendor that is not verified publishes',
    'user-vendor-1',
    unverified,
    CREATE,
    { input: input({ status: 'PUBLISHED' }), key: `run-${randomUUID()}` },
    (b) => check(b.data.createListing.code === 'VENDOR_NOT_VERIFIED', 'VENDOR_NOT_VERIFIED'),
  );

  await run('The owner reads it back', 'vendor-shop-001', shop, MINE, { id }, (b) => {
    const l = b.data.myListing;
    check(
      l.price.cents === 950 && l.editVersion === 4 && l.stock.availableQuantity === 6,
      'as left by the steps above',
    );
  });

  // Register 210 (resolved by option (a)): a refused value is reported at its position, and the sentence never repeats it.
  await run(
    'An allergen and a tag the catalog does not offer: refused at their positions, the value not repeated (register 210)',
    'vendor-shop-001',
    shop,
    CREATE,
    { input: input({ allergenFlags: ['gluten', '<b>nuts</b>'], tags: ['<b>nuts</b>'] }), key: `run-${randomUUID()}` },
    (b) => {
      check(b.data.createListing.code === 'INVALID', 'INVALID');
      const fields = b.data.createListing.fields.map((f) => f.field);
      check(
        fields.includes('allergenFlags[1]') && fields.includes('tags[0]'),
        'reported at allergenFlags[1] and tags[0]',
      );
      check(!JSON.stringify(b).toLowerCase().includes('nuts</b>'), 'the value is not in the answer');
    },
  );

  console.log(`\n${step} steps, ${failures} failed`);
} catch (e) {
  failures += 1;
  console.error(`the run stopped: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  stack.stopAll();
  if (down) stack.down();
}
process.exit(failures === 0 ? 0 : 1);
