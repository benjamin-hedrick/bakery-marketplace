#!/usr/bin/env node
// Wakes the deployed dev environment before its suite runs, and records how long each app took to answer (WI-DEP-001, register 228). The apps scale to
// zero when idle (ADR-0020, decision 7), and that stays: this is a demo. A cold start is not hidden either; it is measured and kept as evidence.
//
//   node scripts/ci/deployed-warm-up.mjs --web https://web.<domain> --issuer https://mock-oidc.<domain>
//        [--where agent|lead] [--json out.json] [--step-limit-seconds 300]
//
// Each app wakes only when something calls it, so the steps go in the order the apps call each other, one at a time, and each step's time is the app
// it names (plus any already-warm app in front of it):
//   1. issuer:   the mock issuer's discovery document.
//   2. web:      the web app's own session route with no cookie (nothing behind it is called).
//   3. bff:      `{ __typename }` through the web app's /api/graphql (the BFF answers it itself).
//   4. catalog:  the listings query (BFF to catalog-service, Cosmos and the cache).
//   5. ordering: the anonymous pickup windows of the seeded bakery (BFF to ordering-service).
// The Container Apps ingress holds a request while it starts a replica, so one long request is the usual cold start; an error or a 5xx is retried
// every 5 seconds until the step's limit. "Likely cold" is a reading of the client's numbers only (more than one attempt, or longer than 3 s); the
// platform's own record of each start is in the observe stage (dev-observe.mjs, coldStarts).
// The record holds step names, times and status codes, never an address. Exit code 0 = every step answered, 1 = a step did not, 2 = bad usage.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const VENDOR = 'vendor-shop-001'; // the seeded bakery (tools/BakeryMarketplace.Seed)
export const LISTINGS_QUERY = '{ listings(first: 20) { edges { node { id name } } } }';
export const WINDOWS_QUERY = 'query($vendorId: ID!) { pickupWindows(vendorId: $vendorId) { start } }';
export const COLD_MS = 3000;

const graphql = (web, query, variables) => ({
  url: `${web}/api/graphql`,
  init: {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: web },
    body: JSON.stringify(variables ? { query, variables } : { query }),
  },
});

const parsed = (body) => {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
};
const data = (status, body) => {
  if (status !== 200) return null;
  const p = parsed(body);
  return p && !p.errors ? (p.data ?? null) : null;
};

/** The steps, in the order the apps call each other. `check` decides whether the answer is the app's own (not an error page). */
export const STEPS = [
  {
    name: 'issuer',
    wakes: 'mock-oidc',
    request: (_web, issuer) => ({ url: `${issuer}/.well-known/openid-configuration`, init: {} }),
    check: (status, body) => status === 200 && typeof parsed(body)?.authorization_endpoint === 'string',
  },
  {
    name: 'web',
    wakes: 'web',
    request: (web) => ({ url: `${web}/api/auth/me`, init: {} }),
    check: (status) => status === 200 || status === 401,
  },
  {
    name: 'bff',
    wakes: 'graphql-bff',
    request: (web) => graphql(web, '{ __typename }'),
    check: (status, body) => data(status, body)?.__typename === 'Query',
  },
  {
    name: 'catalog',
    wakes: 'catalog',
    request: (web) => graphql(web, LISTINGS_QUERY),
    check: (status, body) => (data(status, body)?.listings?.edges?.length ?? 0) > 0,
  },
  {
    name: 'ordering',
    wakes: 'ordering',
    request: (web) => graphql(web, WINDOWS_QUERY, { vendorId: VENDOR }),
    check: (status, body) => Array.isArray(data(status, body)?.pickupWindows),
  },
];

/**
 * Calls one step until it answers or the limit passes. Returns when it started, how long until the first good answer, the attempts and what each
 * attempt got (a status code, or the error's name), and whether it looks like a cold start.
 */
export async function warmStep(
  step,
  {
    web,
    issuer,
    http = fetch,
    now = () => performance.now(),
    clock = () => new Date(),
    sleep,
    limitMs,
    requestTimeoutMs,
  },
) {
  const pause = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const startedAt = clock().toISOString();
  const t0 = now();
  const seen = [];
  for (;;) {
    const { url, init } = step.request(web, issuer);
    let status = null;
    let body = '';
    try {
      const res = await http(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(requestTimeoutMs) });
      status = res.status;
      body = await res.text();
    } catch (e) {
      seen.push(e?.name === 'TimeoutError' ? 'timeout' : 'error');
    }
    const good = status !== null && step.check(status, body);
    if (status !== null) seen.push(good ? String(status) : `${status}-not-ready`);
    const ms = Math.round(now() - t0);
    if (good)
      return {
        step: step.name,
        wakes: step.wakes,
        startedAt,
        ok: true,
        ms,
        attempts: seen.length,
        seen,
        likelyCold: seen.length > 1 || ms > COLD_MS,
      };
    if (ms >= limitMs)
      return {
        step: step.name,
        wakes: step.wakes,
        startedAt,
        ok: false,
        ms,
        attempts: seen.length,
        seen,
        likelyCold: true,
      };
    await pause(5000);
  }
}

/** Runs every step in order; a step that never answers stops the run (the apps behind it would not answer either). */
export async function warmUp({ web, issuer, limitMs = 300_000, requestTimeoutMs = 150_000, ...rest }) {
  const steps = [];
  for (const step of STEPS) {
    const result = await warmStep(step, { web, issuer, limitMs, requestTimeoutMs, ...rest });
    steps.push(result);
    if (!result.ok) break;
  }
  return { ok: steps.length === STEPS.length && steps.every((s) => s.ok), steps };
}

/** The markdown table of a run. */
export function table(where, run) {
  const lines = [
    `Deployed warm-up, measured from: ${where}`,
    '| Step | Wakes | Started (UTC) | Answered in ms | Attempts | Seen | Likely cold |',
    '|---|---|---|---:|---:|---|---|',
  ];
  for (const s of run.steps)
    lines.push(
      `| ${s.step} | ${s.wakes} | ${s.startedAt.slice(11, 19)} | ${s.ok ? s.ms : `no answer after ${s.ms}`} | ${s.attempts} | ${s.seen.join(' ')} | ${s.likelyCold ? 'yes' : 'no'} |`,
    );
  const total = run.steps.reduce((sum, s) => sum + s.ms, 0);
  lines.push(`Total ${total} ms${run.ok ? '' : ' (stopped at the first step with no answer)'}.`);
  return lines.join('\n');
}

async function main() {
  const argv = process.argv.slice(2);
  const opt = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
  const web = opt('--web');
  const issuer = opt('--issuer');
  const origin = /^(https:\/\/[^/]+|http:\/\/(localhost|127\.0\.0\.1):\d+)$/;
  const limitSeconds = Number(opt('--step-limit-seconds', '300'));
  if (!origin.test(web ?? '') || !origin.test(issuer ?? '') || !(limitSeconds > 0)) {
    console.error(
      'usage: deployed-warm-up.mjs --web <https origin> --issuer <https origin> [--where agent|lead] [--json out.json] [--step-limit-seconds 300]',
    );
    process.exit(2);
  }
  const where = opt('--where', 'unnamed');
  const run = await warmUp({ web, issuer, limitMs: limitSeconds * 1000 });
  console.log(table(where, run));
  const jsonOut = opt('--json');
  if (jsonOut) writeFileSync(jsonOut, `${JSON.stringify({ where, at: new Date().toISOString(), ...run }, null, 2)}\n`);
  process.exitCode = run.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
