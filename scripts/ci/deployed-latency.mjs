#!/usr/bin/env node
// Latency of the deployed dev environment, measured from outside through its public addresses only (WI-DEP-001, register 218): the pipeline agent runs
// it in the smoke stage, and the lead can run the same command from their machine, as separate runs. The local measurement is
// scripts/dev/measure-latency.mjs; this one cannot call the BFF or the catalog (internal) and has no vendor, so everything goes through the web app.
//
//   node scripts/ci/deployed-latency.mjs --web https://web.<domain> --issuer https://mock-oidc.<domain>
//        [--reads 30] [--orders 10] [--concurrency 5] [--rounds 6] [--json out.json] [--where agent|lead]
//
// Phases, in order:
//   1. first:      one request to the home page, timed alone (after an idle period it includes starting the apps from zero).
//   2. reads:      sequential, one at a time: the server-rendered home page, a server-rendered listing page, and the listings query through the web
//                  app's /api/graphql (anonymous).
//   3. checkout:   the customer logs in the way the browser does (the web app's server login and the mock issuer's form), then places test orders of
//                  the made-to-order latte one at a time through /api/graphql (the first order of the run, then the later ones). Uses no stock.
//   4. concurrent: --rounds rounds of --concurrency requests at once, half home pages and half listings queries, so the numbers show one replica
//                  per app under a little parallel load. Kept under the web app's per-address limits (600 requests and 120 GraphQL queries a minute);
//                  a 429 is counted and reported apart, as the limit working, not as a failure.
// Every response's X-Correlation-Id (when present) is kept in the JSON, to find the requests in the environment's log. Percentiles are nearest-rank.
// Read the numbers as a data point of one replica per app from one machine, including the network path to East US: not a capacity claim.
// Exit code 0 when every request answered as expected, 1 when any failed, 2 on bad usage.
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const LATTE = 'listing-latte-001';
const VENDOR = 'vendor-shop-001';
const ALICE = { userId: 'user-customer-1', paymentMethodId: 'pm-alice-ok' };
const globalId = (type, id) => Buffer.from(`${type}:${id}`).toString('base64');

export const LISTINGS_QUERY = '{ listings(first: 20) { edges { node { id name } } } }';
export const PLACE = `mutation($input: PlaceOrderInput!) { placeOrder(input: $input) { __typename ... on PlaceOrderSuccess { order { id status } } ... on PlaceOrderRejected { code } } }`;

/** Nearest-rank percentile. */
export const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
};

/** The summary rows of the samples: count, failures, rate-limited, p50, p95, max (ms, one decimal). */
export function summarise(samples) {
  return Object.entries(samples).map(([label, xs]) => {
    const ms = xs.filter((x) => !x.limited).map((x) => x.ms);
    const round = (v) => (v === undefined ? null : Math.round(v * 10) / 10);
    return {
      label,
      n: xs.length,
      failed: xs.filter((x) => !x.ok && !x.limited).length,
      limited: xs.filter((x) => x.limited).length,
      p50: round(ms.length ? pct(ms, 50) : undefined),
      p95: round(ms.length ? pct(ms, 95) : undefined),
      max: round(ms.length ? Math.max(...ms) : undefined),
    };
  });
}

/** A minimal cookie jar for one origin: keeps name=value from Set-Cookie, sends them back. */
export function cookieJar() {
  const cookies = new Map();
  return {
    take(response) {
      for (const line of response.headers.getSetCookie?.() ?? []) {
        const [pair] = line.split(';');
        const at = pair.indexOf('=');
        if (at > 0) cookies.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
      }
    },
    header: () => [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
    names: () => [...cookies.keys()],
  };
}

/** The customer's login as the browser does it: the web app's login route, the issuer's form, the web app's callback. Returns the jar. */
export async function logIn(web, issuer, userId, http = fetch) {
  const jar = cookieJar();
  const start = await http(`${web}/api/auth/login?returnTo=%2F`, { redirect: 'manual' });
  jar.take(start);
  const authorize = new URL(start.headers.get('location') ?? '');
  if (`${authorize.origin}` !== issuer || authorize.pathname !== '/authorize')
    throw new Error(`the login did not go to the issuer's authorize page (status ${start.status})`);
  const form = new URLSearchParams({ userId });
  for (const key of ['redirect_uri', 'state', 'code_challenge', 'code_challenge_method', 'client_id', 'scope'])
    if (authorize.searchParams.has(key)) form.set(key, authorize.searchParams.get(key));
  const submit = await http(`${issuer}/authorize/submit`, { method: 'POST', body: form, redirect: 'manual' });
  const callback = submit.headers.get('location');
  if (submit.status !== 302 || !callback?.startsWith(`${web}/api/auth/callback`))
    throw new Error(`the issuer did not send the login back to the web app (status ${submit.status})`);
  const done = await http(callback, { headers: { cookie: jar.header() }, redirect: 'manual' });
  jar.take(done);
  if (done.status !== 302 || !jar.names().some((n) => n.includes('bakery-session')))
    throw new Error(`the web app did not start a session (status ${done.status})`);
  return jar;
}

async function main() {
  const argv = process.argv.slice(2);
  const opt = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
  const web = opt('--web');
  const issuer = opt('--issuer');
  const origin = /^(https:\/\/[^/]+|http:\/\/(localhost|127\.0\.0\.1):\d+)$/;
  if (!origin.test(web ?? '') || !origin.test(issuer ?? '')) {
    console.error(
      'usage: deployed-latency.mjs --web <https origin> --issuer <https origin> [--reads 30] [--orders 10] [--concurrency 5] [--rounds 6] [--json out.json] [--where agent|lead]',
    );
    process.exit(2);
  }
  const reads = Number(opt('--reads', '30'));
  const orders = Number(opt('--orders', '10'));
  const concurrency = Number(opt('--concurrency', '5'));
  const rounds = Number(opt('--rounds', '6'));
  const jsonOut = opt('--json');
  const where = opt('--where', 'unnamed');

  const samples = {};
  const correlation = [];
  const timed = async (label, request, check) => {
    const started = performance.now();
    let res;
    try {
      res = await request();
    } catch (e) {
      (samples[label] ??= []).push({ ms: performance.now() - started, ok: false, limited: false, error: e.message });
      return;
    }
    const body = await res.text();
    const ms = performance.now() - started;
    const limited = res.status === 429;
    const ok = !limited && (await check(res, body));
    const id = res.headers.get('x-correlation-id');
    if (id) correlation.push({ label, status: res.status, correlationId: id });
    (samples[label] ??= []).push({ ms, ok, limited, status: res.status });
  };
  const html = (text) => async (res, body) => res.status === 200 && body.includes(text);
  const json = (pick) => async (res, body) => {
    if (res.status !== 200) return false;
    try {
      const parsed = JSON.parse(body);
      return !parsed.errors && pick(parsed);
    } catch {
      return false;
    }
  };
  const graphql = (query, variables, cookie) => () =>
    fetch(`${web}/api/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: web, ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ query, variables }),
    });
  const listingPage = `${web}/listings/${encodeURIComponent(globalId('Listing', LATTE))}`;
  const hasListings = json((p) => (p.data?.listings?.edges?.length ?? 0) > 0);

  await timed(
    'first: home page (one request, may include a cold start)',
    () => fetch(`${web}/`),
    html('Oat Milk Latte'),
  );
  for (let i = 0; i < reads; i++) {
    await timed('read: home page (server-rendered)', () => fetch(`${web}/`), html('Oat Milk Latte'));
    await timed('read: listing page (server-rendered)', () => fetch(listingPage), html('Oat Milk Latte'));
    await timed('read: listings query (/api/graphql, anonymous)', graphql(LISTINGS_QUERY), hasListings);
  }

  const jar = await logIn(web, issuer, ALICE.userId);
  for (let i = 0; i < orders; i++) {
    const input = {
      idempotencyKey: `deployed-latency-${randomUUID()}`,
      paymentMethodId: ALICE.paymentMethodId,
      vendorId: VENDOR,
      lineItems: [{ listingId: globalId('Listing', LATTE), modifierIds: [], quantity: 1 }],
      pickupWindow: null,
    };
    await timed(
      i === 0 ? 'checkout: first order of the run' : 'checkout: later orders',
      graphql(PLACE, { input }, jar.header()),
      json((p) => p.data?.placeOrder?.__typename === 'PlaceOrderSuccess'),
    );
  }

  for (let r = 0; r < rounds; r++) {
    await Promise.all(
      Array.from({ length: concurrency }, (_, i) =>
        i % 2 === 0
          ? timed(`concurrent (${concurrency} at once): home page`, () => fetch(`${web}/`), html('Oat Milk Latte'))
          : timed(`concurrent (${concurrency} at once): listings query`, graphql(LISTINGS_QUERY), hasListings),
      ),
    );
  }

  const rows = summarise(samples);
  console.log(`Deployed latency, measured from: ${where}`);
  console.log('| Request | n | Failed | 429 | p50 ms | p95 ms | max ms |\n|---|---:|---:|---:|---:|---:|---:|');
  for (const r of rows)
    console.log(
      `| ${r.label} | ${r.n} | ${r.failed} | ${r.limited} | ${r.p50 ?? '-'} | ${r.p95 ?? '-'} | ${r.max ?? '-'} |`,
    );
  if (jsonOut)
    writeFileSync(
      jsonOut,
      `${JSON.stringify({ recordedAt: new Date().toISOString(), where, node: process.version, reads, orders, concurrency, rounds, rows, correlation }, null, 2)}\n`,
    );
  process.exitCode = rows.some((r) => r.failed) ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
