#!/usr/bin/env node
// A load and soak run of the live vendor queue on the real local stack (WI-SEC-005 step 3, register item 129). It starts the stack (Docker, the
// catalog, ordering and BFF as host processes), then:
//   1. LIMITS:   one vendor opens seven streams one after another; ordering keeps five (the newest), so the first two must end and the rest stay open.
//   2. LOAD:     the five streams stay open while a customer places an order every --order-every seconds and --readers workers read the catalog
//                and pickup windows in a loop, for --minutes. Every order must reach every stream (by the stream, or by the list read after a
//                reconnect); the delay from the request being sent to the order arriving is measured per stream.
//   3. RESTART:  at --restart-at (a fraction of the run) the ordering service is stopped for --outage seconds and started again; the streams
//                must end, reopen when ordering is back, and no order placed after it is back may be missed.
//   4. MEMORY:   the working set of the ordering, catalog and BFF processes is sampled every --sample seconds, to see growth.
// A stream whose token has expired (the mock issuer's last an hour) is reopened with a fresh token, as the web app does with a renewed session.
//
//   node scripts/dev/load-test.mjs [--minutes 3] [--order-every 3] [--readers 8] [--restart-at 0.5] [--outage 8] [--sample 30] [--read-pause 0] [--json out.json] [--keep]
//                                      [--bff-rate-limit 100000] [--client-addresses]
//
// Register 137 (counting the BFF's rate limit per client): by default the BFF's backstop is set out of the way (100000 a minute). To show the fix,
// run twice with the backstop at its default, `--bff-rate-limit 600`: without `--client-addresses` every reader and the ordering customer reach the
// BFF with no client header, so they share one counter and the readers use it up (orders are refused: the control); with `--client-addresses`
// each reader and the customer send their own `X-Bakery-Client-Address` (this script's address is a trusted source, `local-stack.mjs`), so the
// customer's counter is the customer's own and no order may be refused outside the outage (the run then exits 1 if one was). The readers
// themselves may be refused: that is the limit working on them. Test tooling that drives the system from outside; no product code changed.
//
// One machine, one process each, an emulator for the database: the numbers are a local data point, not a capacity claim. Exit code 0 when no
// order was missed and the limits held; 1 otherwise. Logs: artifacts/load/*.log.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { bffUrl, createStack, issuerUrl, ports } from '../lib/local-stack.mjs';

const argv = process.argv.slice(2);
const opt = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const minutes = Number(opt('--minutes', '3'));
const orderEvery = Number(opt('--order-every', '3'));
const readers = Number(opt('--readers', '8'));
const restartAt = Number(opt('--restart-at', '0.5'));
const outage = Number(opt('--outage', '8'));
const sampleEvery = Number(opt('--sample', '30'));
const readPause = Number(opt('--read-pause', '0')); // milliseconds a reader waits between rounds
const jsonOut = opt('--json', undefined);
const keep = argv.includes('--keep');
const bffRateLimit = opt('--bff-rate-limit', '100000'); // a minute; the default backstop of the BFF is 600
const perClient = argv.includes('--client-addresses'); // send X-Bakery-Client-Address per reader and for the ordering customer (register 137)

const LISTING = 'listing-sourdough-001';
const globalId = (type, id) => Buffer.from(`${type}:${id}`).toString('base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (xs, p) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))]);
};
const summary = (xs) => ({
  n: xs.length,
  min: pct(xs, 0),
  p50: pct(xs, 50),
  p95: pct(xs, 95),
  p99: pct(xs, 99),
  max: pct(xs, 100),
});

async function userToken(userId) {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const redirectUri = 'http://localhost:3000/api/auth/callback';
  const submit = await fetch(`${issuerUrl}/authorize/submit`, {
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
  const res = await fetch(`${issuerUrl}/token`, {
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

const gql = (query, variables, token, clientAddress) =>
  fetch(bffUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(perClient && clientAddress ? { 'x-bakery-client-address': clientAddress } : {}),
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20000),
  });

const SUBSCRIBE = 'subscription { vendorOrderChanged { id status sequence } }';
const LIST = 'query { vendorOrders(status: ACTIVE, first: 50) { edges { node { id status sequence } } } }';
const PLACE = `mutation($input: PlaceOrderInput!) { placeOrder(input: $input) { __typename
  ... on PlaceOrderSuccess { order { id } } ... on PlaceOrderRejected { code } } }`;
const LISTINGS = '{ listings(first: 20) { edges { node { id name } } } }';
const WINDOWS = '{ pickupWindows(vendorId: "vendor-shop-001") { start end } }';

// ---- a stream client: opens a subscription, reads Server-Sent Events, reopens with a fresh token when it ends -------------------------------

class Screen {
  constructor(name, state) {
    this.name = name;
    this.state = state;
    this.seen = new Set(); // order ids this screen knows (from the stream, or from the list read after a reconnect)
    this.arrivals = new Map(); // order id -> performance.now() of the first arrival
    this.opened = 0;
    this.ended = 0;
    this.failedOpens = 0;
    this.lastEventAt = null;
    this.reopenedAt = [];
    this.stopped = false;
  }

  async run() {
    let attempt = 0;
    while (!this.stopped) {
      const token = await userToken('vendor-shop-001').catch(() => null);
      if (!token) {
        await sleep(1000);
        continue;
      }
      let res;
      try {
        res = await fetch(bffUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'text/event-stream',
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ query: SUBSCRIBE }),
        });
      } catch {
        this.failedOpens++;
        await sleep(Math.min(5000, 500 * 2 ** Math.min(attempt++, 4)));
        continue;
      }
      const established = await this.read(res, token);
      if (!established) {
        this.failedOpens++;
        await sleep(Math.min(5000, 500 * 2 ** Math.min(attempt++, 4)));
      } else attempt = 0;
      if (!this.stopped) await sleep(300);
    }
  }

  /** Reads one stream until it ends. Returns true when the subscription was established (a first event or a heartbeat was seen). */
  async read(res, token) {
    if (res.status !== 200) {
      this.lastRefusal = { status: res.status };
      await res.body?.cancel().catch(() => undefined);
      return false;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let established = false;
    this.stream = reader;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const event = /^event: (\w+)/m.exec(frame)?.[1];
          const data = /^data: (.*)$/m.exec(frame)?.[1];
          const json = event === 'next' && data ? JSON.parse(data) : null;
          if (json?.errors) {
            // A refusal is an error as the first event (the BFF's answer when ordering refuses or is down).
            this.lastRefusal = { code: json.errors[0]?.extensions?.code };
            return false;
          }
          if (event === 'complete') return established;
          // Anything else that is not an error (a comment, a heartbeat, an order) shows the subscription is established.
          if (!established) {
            established = true;
            this.opened++;
            this.reopenedAt.push(Date.now());
            void this.catchUp(token);
          }
          const id = json?.data?.vendorOrderChanged?.id;
          if (id) {
            if (!this.arrivals.has(id)) this.arrivals.set(id, performance.now());
            this.seen.add(id);
            this.lastEventAt = Date.now();
          }
        }
      }
    } catch {
      /* the connection was cut */
    } finally {
      this.ended++;
    }
    return established;
  }

  /** What the real screen does after (re)connecting: read the list, so nothing that happened while it was away is missed. */
  async catchUp(token) {
    try {
      const res = await gql(LIST, {}, token);
      const json = await res.json();
      for (const e of json.data?.vendorOrders?.edges ?? []) {
        this.seen.add(e.node.id);
        if (!this.arrivals.has(e.node.id)) this.arrivals.set(e.node.id, performance.now());
      }
    } catch {
      /* the next reconnect will do it */
    }
  }

  stop() {
    this.stopped = true;
    this.stream?.cancel().catch(() => undefined);
  }
}

// ---- processes' memory ------------------------------------------------------------------------------------------------------------------

function listeningPid(port) {
  const out = spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' }).stdout ?? '';
  const line = out.split('\n').find((l) => l.includes(`:${port} `) && l.includes('LISTENING'));
  return line ? Number(line.trim().split(/\s+/).at(-1)) : null;
}
function workingSetMb(pid) {
  if (!pid) return null;
  const out = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' }).stdout ?? '';
  const kb = Number(/"([\d,.]+) K"/.exec(out)?.[1]?.replace(/[,.]/g, ''));
  return Number.isFinite(kb) ? Math.round(kb / 1024) : null;
}

// ---- the run ------------------------------------------------------------------------------------------------------------------------------

const stack = createStack({ label: 'load', outDir: 'artifacts/load', distDir: '.next-load' });
const startedAt = Date.now();
const report = {
  startedAt: new Date(startedAt).toISOString(),
  options: { minutes, orderEvery, readers, restartAt, outage, sampleEvery, bffRateLimit, perClient },
};
let exitCode = 1;
// The load is the point of this run, not the BFF's own backstop (tested elsewhere), so the backstop is set out of the way for the BFF this script starts,
// unless --bff-rate-limit says otherwise (register 137).
process.env.BFF_RATE_LIMIT_PER_MINUTE = bffRateLimit;

try {
  stack.up();
  await stack.startServices();

  const vendor = await userToken('vendor-shop-001');
  const customer = await userToken('user-customer-1');
  const orderCount = Math.ceil((minutes * 60) / orderEvery) + 50;
  const stockRes = await fetch(`http://localhost:${ports.catalog}/catalog/listings/${LISTING}/stock/adjust`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${vendor}` },
    body: JSON.stringify({ delta: orderCount }),
  });
  stack.log(`stock +${orderCount}: ${stockRes.status}`);
  // warm the path
  await gql(LISTINGS);
  await gql(WINDOWS);

  // ---- 1. limits ----
  // Ordering keeps five streams per vendor; a sixth is accepted and the oldest is ended ("replaced"), so the newest screen always works.
  // Seven are opened one after another; after a moment exactly the first two must have ended and the last five must still be open.
  const probes = [];
  for (let i = 0; i < 7; i++) {
    const t0 = performance.now();
    const res = await fetch(bffUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
        authorization: `Bearer ${await userToken('vendor-shop-001')}`,
      },
      body: JSON.stringify({ query: SUBSCRIBE }),
    });
    const probe = {
      index: i + 1,
      status: res.status,
      openMs: Math.round(performance.now() - t0),
      ended: false,
      endedAfterMs: null,
      reader: res.body.getReader(),
    };
    void (async () => {
      try {
        for (;;) {
          const { done } = await probe.reader.read();
          if (done) break;
        }
      } catch {
        /* cut */
      }
      probe.ended = true;
      probe.endedAfterMs = Math.round(performance.now() - t0);
    })();
    probes.push(probe);
  }
  await sleep(3000);
  const endedIndexes = probes.filter((p) => p.ended).map((p) => p.index);
  report.limits = {
    opened: 7,
    stillOpen: probes.filter((p) => !p.ended).length,
    endedIndexes,
    results: probes.map((p) => ({
      index: p.index,
      status: p.status,
      openMs: p.openMs,
      ended: p.ended,
      endedAfterMs: p.endedAfterMs,
    })),
  };
  stack.log(
    `limits: 7 opened one after another, still open ${report.limits.stillOpen}, ended streams ${JSON.stringify(endedIndexes)}`,
  );
  for (const p of probes) await p.reader.cancel().catch(() => undefined);
  await sleep(2000); // let ordering see the closed streams

  // ---- 2. load (with 3. the restart inside it) ----
  const screens = Array.from({ length: 5 }, (_, i) => new Screen(`screen-${i + 1}`));
  screens.forEach((s) => void s.run());
  await sleep(3000);

  const placed = []; // { id, t0 }
  const orderErrors = [];
  const readSamples = [];
  const readErrors = [];
  const memory = [];
  const ordersPlacedAt = [];
  const runEnd = Date.now() + minutes * 60_000;
  const restartTime = Date.now() + minutes * 60_000 * restartAt;
  let restartDone = false;
  let outageFrom = null;
  let outageTo = null;
  let customerToken = customer;
  let customerTokenAt = Date.now();

  const placeLoop = (async () => {
    while (Date.now() < runEnd) {
      const tick = Date.now();
      if (Date.now() - customerTokenAt > 50 * 60_000) {
        customerToken = await userToken('user-customer-1');
        customerTokenAt = Date.now();
      }
      const t0 = performance.now();
      try {
        const res = await gql(
          PLACE,
          {
            input: {
              idempotencyKey: `load-${randomUUID()}`,
              paymentMethodId: 'pm-alice-ok',
              vendorId: 'vendor-shop-001',
              lineItems: [{ listingId: globalId('Listing', LISTING), modifierIds: ['mod-seeds'], quantity: 1 }],
              pickupWindow: null,
            },
          },
          customerToken,
          '10.20.0.1', // the ordering customer's own client address (sent only with --client-addresses)
        );
        const json = await res.json();
        const result = json.data?.placeOrder;
        if (result?.__typename === 'PlaceOrderSuccess') {
          const serviceId = Buffer.from(result.order.id, 'base64').toString('utf8').split(':')[1];
          placed.push({ id: globalId('VendorOrder', serviceId), t0, at: Date.now() });
        } else
          orderErrors.push({
            at: Date.now(),
            what: result?.code ?? json.errors?.[0]?.extensions?.code ?? `status ${res.status}`,
          });
      } catch (e) {
        orderErrors.push({ at: Date.now(), what: String(e.name) });
      }
      await sleep(Math.max(0, orderEvery * 1000 - (Date.now() - tick)));
    }
  })();

  const readLoop = async (_, index) => {
    const clientAddress = `10.10.0.${index + 1}`; // each reader is a different client (sent only with --client-addresses)
    while (Date.now() < runEnd) {
      for (const q of [LISTINGS, WINDOWS]) {
        const t0 = performance.now();
        try {
          const res = await gql(q, undefined, undefined, clientAddress);
          const json = await res.json();
          if (res.status === 200 && !json.errors) readSamples.push(performance.now() - t0);
          else
            readErrors.push({
              at: Date.now(),
              what: `status ${res.status} ${json.errors?.[0]?.extensions?.code ?? ''}`,
            });
        } catch (e) {
          readErrors.push({ at: Date.now(), what: String(e.name) });
        }
      }
      if (readPause > 0) await sleep(readPause);
    }
  };
  const readWorkers = Array.from({ length: readers }, readLoop);

  const sampler = (async () => {
    while (Date.now() < runEnd) {
      const row = {
        t: Math.round((Date.now() - startedAt) / 1000),
        ordering: workingSetMb(listeningPid(ports.ordering)),
        catalog: workingSetMb(listeningPid(ports.catalog)),
        bff: workingSetMb(listeningPid(ports.bff)),
      };
      memory.push(row);
      await sleep(sampleEvery * 1000);
    }
  })();

  const restarter = (async () => {
    if (!(restartAt > 0 && restartAt < 1)) return;
    while (Date.now() < restartTime) await sleep(500);
    outageFrom = Date.now();
    stack.stopOne('ordering');
    await sleep(outage * 1000);
    stack.startOne('ordering');
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      try {
        if ((await fetch(`http://localhost:${ports.ordering}/health`, { signal: AbortSignal.timeout(2000) })).ok) break;
      } catch {
        /* not yet */
      }
      await sleep(500);
    }
    outageTo = Date.now();
    restartDone = true;
  })();

  await Promise.all([placeLoop, ...readWorkers, sampler, restarter]);
  // give the last orders time to arrive
  await sleep(5000);
  screens.forEach((s) => s.stop());

  // ---- results ----
  const delays = [];
  const missing = [];
  for (const screen of screens) {
    for (const o of placed) {
      const arrived = screen.arrivals.get(o.id);
      if (arrived === undefined)
        missing.push({ screen: screen.name, order: o.id, placedAt: new Date(o.at).toISOString() });
      else delays.push(arrived - o.t0);
    }
  }
  const near = (t) => restartDone && t >= outageFrom - 5000 && t <= outageTo + 25000; // the outage and the half minute it takes to settle
  const steadyDelays = [];
  for (const screen of screens)
    for (const o of placed) {
      const arrived = screen.arrivals.get(o.id);
      if (arrived !== undefined && !near(o.at)) steadyDelays.push(arrived - o.t0);
    }
  const afterRestart = missing.filter((m) => restartDone && Date.parse(m.placedAt) > outageTo + 10_000);
  const duringOutageOrders = orderErrors.filter((e) => outageFrom && e.at >= outageFrom && e.at <= outageTo + 2000);
  report.run = {
    wallSeconds: Math.round((Date.now() - startedAt) / 1000),
    ordersPlaced: placed.length,
    orderErrorsTotal: orderErrors.length,
    orderErrorsDuringOutage: duringOutageOrders.length,
    orderErrorsOutsideOutage: orderErrors.length - duringOutageOrders.length,
    orderErrorSamples: orderErrors.slice(0, 10),
    requestToScreenMs: summary(delays),
    requestToScreenMsOutsideOutageWindow: summary(steadyDelays),
    ordersMissedBySomeScreen: new Set(missing.map((m) => m.order)).size,
    missingTotal: missing.length,
    missingAfterRecovery: afterRestart.length,
    missingSamples: missing.slice(0, 10),
    reads: {
      ...summary(readSamples),
      errors: readErrors.length,
      errorsOutsideOutage: readErrors.filter((e) => !(outageFrom && e.at >= outageFrom && e.at <= outageTo + 2000))
        .length,
      errorSamples: readErrors.slice(0, 5),
      readersConcurrent: readers,
      pauseMs: readPause,
    },
    restart: restartDone
      ? { outageSeconds: Math.round((outageTo - outageFrom) / 1000), requestedOutage: outage }
      : null,
    screens: screens.map((s) => ({
      name: s.name,
      opened: s.opened,
      ended: s.ended,
      failedOpens: s.failedOpens,
      known: s.seen.size,
    })),
    memoryMb: memory,
  };
  stack.log(
    `done: ${placed.length} orders, ${missing.length} missed arrivals (${afterRestart.length} after recovery), request-to-screen p50 ${report.run.requestToScreenMs.p50} ms p95 ${report.run.requestToScreenMs.p95} ms`,
  );

  const limitsHeld =
    report.limits.stillOpen === 5 && JSON.stringify(report.limits.endedIndexes) === JSON.stringify([1, 2]);
  // With --client-addresses (register 137) no order may be refused outside the outage: the customer's own counter must not be used up by the readers.
  const orderRefusals = orderErrors.length - duringOutageOrders.length;
  const ordersNotRefused = !perClient || orderRefusals === 0;
  exitCode = limitsHeld && afterRestart.length === 0 && missing.length === 0 && ordersNotRefused ? 0 : 1;
  report.verdict = {
    limitsHeld,
    nothingMissed: missing.length === 0,
    nothingMissedAfterRecovery: afterRestart.length === 0,
    ordersRefusedOutsideOutage: orderRefusals,
    ...(perClient ? { ordersNotRefused } : {}),
  };
  console.log(JSON.stringify(report, null, 2));
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 2));
} catch (e) {
  console.error(`[load] ERROR: ${e.stack ?? e.message}`);
} finally {
  stack.stopAll();
  if (!keep) stack.down();
}
process.exitCode = exitCode;
