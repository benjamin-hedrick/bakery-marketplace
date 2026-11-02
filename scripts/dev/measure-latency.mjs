#!/usr/bin/env node
// A repeatable latency measurement of the slice-1 stack, against a RUNNING stack (start it with `node scripts/dev/demo.mjs`).
// It sends sequential requests (one at a time, so this measures latency, not throughput or capacity) and prints p50, p95 and max:
//   - the BFF listings query (browse), the server-rendered home page, and the BFF pickup-windows query (reads);
//   - checkout: the first order of the run, then warm ones (each a real test order of one Country Sourdough as Alice Customer).
// The warm checkouts consume stock: the script first adds stock to the listing as the vendor, so the run does not sold it out.
//
//   node scripts/dev/measure-latency.mjs [--reads 50] [--orders 20] [--json out.json]
//
// One machine, one process each, no concurrency, no network between the parts: read the numbers as a local data point, not a capacity
// claim. Percentiles are nearest-rank. Exit code 0 when every request answered as expected.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const opt = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const reads = Number(opt('--reads', '50'));
const orders = Number(opt('--orders', '20'));
const jsonOut = opt('--json', undefined);
const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const BFF = process.env.BFF_URL ?? 'http://localhost:4100/graphql';
const ISSUER = process.env.ISSUER_URL ?? 'http://localhost:5100';
const CATALOG = process.env.CATALOG_URL ?? 'http://localhost:5200';
const LISTING = 'listing-sourdough-001';
const globalId = (type, id) => Buffer.from(`${type}:${id}`).toString('base64');

/** A real access token from the mock issuer by the Authorization Code + PKCE exchange, without a browser. */
async function userToken(userId) {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const redirectUri = `${WEB}/api/auth/callback`;
  const submit = await fetch(`${ISSUER}/authorize/submit`, {
    method: 'POST',
    redirect: 'manual',
    body: new URLSearchParams({
      userId,
      redirect_uri: redirectUri,
      state: 's',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }),
  });
  const code = new URL(submit.headers.get('location')).searchParams.get('code');
  const res = await fetch(`${ISSUER}/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  return (await res.json()).access_token;
}

const gql = (query, variables, token) =>
  fetch(BFF, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query, variables }),
  });

async function time(label, fn, samples, check) {
  const started = performance.now();
  const res = await fn();
  const ms = performance.now() - started;
  const ok = await check(res);
  (samples[label] ??= []).push({ ms, ok });
  return ok;
}

const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
};

const samples = {};
const vendor = await userToken('vendor-shop-001');
const customer = await userToken('user-customer-1');

// Stock for the orders: the vendor adds it to their own listing.
await fetch(`${CATALOG}/catalog/listings/${LISTING}/stock/adjust`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${vendor}` },
  body: JSON.stringify({ delta: orders + 5 }),
});

const LISTINGS = '{ listings(first: 20) { edges { node { id name price { cents } stock { status } } } } }';
const WINDOWS = '{ pickupWindows(vendorId: "vendor-shop-001") { start end } }';
const PLACE = `mutation($input: PlaceOrderInput!) { placeOrder(input: $input) { __typename ... on PlaceOrderSuccess { order { id status } } ... on PlaceOrderRejected { code } } }`;
const order = () => ({
  idempotencyKey: `latency-${randomUUID()}`,
  vendorId: 'vendor-shop-001',
  lineItems: [{ listingId: globalId('Listing', LISTING), modifierIds: [], quantity: 1 }],
  pickupWindow: null,
});
const isJsonOk = async (res) => res.status === 200 && !(await res.json()).errors;

for (let i = 0; i < reads; i++) {
  await time('browse: BFF listings query', () => gql(LISTINGS), samples, isJsonOk);
  await time(
    'browse: home page (server-rendered)',
    () => fetch(`${WEB}/`),
    samples,
    async (r) => r.status === 200 && (await r.text()).includes('Country Sourdough'),
  );
  await time('read: BFF pickup windows', () => gql(WINDOWS), samples, isJsonOk);
}
for (let i = 0; i < orders; i++) {
  await time(
    i === 0 ? 'checkout: first order of the run' : 'checkout: later orders',
    () => gql(PLACE, { input: order() }, customer),
    samples,
    async (r) => r.status === 200 && (await r.json()).data?.placeOrder?.__typename === 'PlaceOrderSuccess',
  );
}

const rows = Object.entries(samples).map(([label, xs]) => {
  const ms = xs.map((x) => x.ms);
  return {
    label,
    n: xs.length,
    failed: xs.filter((x) => !x.ok).length,
    p50: pct(ms, 50),
    p95: pct(ms, 95),
    max: Math.max(...ms),
  };
});
console.log('| Request | n | Failed | p50 ms | p95 ms | max ms |\n|---|---:|---:|---:|---:|---:|');
for (const r of rows)
  console.log(
    `| ${r.label} | ${r.n} | ${r.failed} | ${r.p50.toFixed(1)} | ${r.p95.toFixed(1)} | ${r.max.toFixed(1)} |`,
  );
if (jsonOut)
  writeFileSync(
    jsonOut,
    JSON.stringify({ recordedAt: new Date().toISOString(), node: process.version, reads, orders, rows }, null, 2),
  );
process.exitCode = rows.some((r) => r.failed) ? 1 : 0;
