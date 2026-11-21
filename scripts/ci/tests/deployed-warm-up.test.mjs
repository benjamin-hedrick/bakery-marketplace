import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { COLD_MS, STEPS, VENDOR, table, warmStep, warmUp } from '../deployed-warm-up.mjs';

const WEB = 'https://web.example.test';
const ISSUER = 'https://mock-oidc.example.test';

/** A fetch whose answers come from a list per URL (and body for /api/graphql); each call advances a fake clock by `ms`. */
function fakeNetwork(script) {
  const state = { t: 0, calls: [] };
  const http = async (url, init) => {
    const query = init?.body ? JSON.parse(init.body).query : null;
    const key = query ? `${url} ${query}` : url;
    state.calls.push({ url, init, key });
    const queue = script[key];
    if (!queue || queue.length === 0) throw new Error(`no answer scripted for ${key}`);
    const next = queue.length > 1 ? queue.shift() : queue[0];
    state.t += next.ms ?? 10;
    if (next.throw) throw Object.assign(new Error(next.throw), { name: next.throw });
    return { status: next.status, text: async () => next.body ?? '' };
  };
  return {
    state,
    http,
    now: () => state.t,
    clock: () => new Date(Date.UTC(2026, 10, 21, 17, 0, 0) + state.t),
    sleep: async (ms) => (state.t += ms),
  };
}

const ok = {
  issuer: { status: 200, body: JSON.stringify({ issuer: ISSUER, authorization_endpoint: `${ISSUER}/authorize` }) },
  web: { status: 401, body: '' },
  bff: { status: 200, body: JSON.stringify({ data: { __typename: 'Query' } }) },
  catalog: { status: 200, body: JSON.stringify({ data: { listings: { edges: [{ node: { id: 'x', name: 'y' } }] } } }) },
  ordering: { status: 200, body: JSON.stringify({ data: { pickupWindows: [] } }) },
};
const keyOf = (step) => {
  const { url, init } = step.request(WEB, ISSUER);
  return init.body ? `${url} ${JSON.parse(init.body).query}` : url;
};
const all = (overrides = {}) => Object.fromEntries(STEPS.map((s) => [keyOf(s), overrides[s.name] ?? [ok[s.name]]]));
const opts = (net, extra = {}) => ({
  web: WEB,
  issuer: ISSUER,
  http: net.http,
  now: net.now,
  clock: net.clock,
  sleep: net.sleep,
  limitMs: 60_000,
  requestTimeoutMs: 30_000,
  ...extra,
});

describe('the steps', () => {
  test('wake the apps in the order they call each other, and reach no internal address', () => {
    assert.deepEqual(
      STEPS.map((s) => s.wakes),
      ['mock-oidc', 'web', 'graphql-bff', 'catalog', 'ordering'],
    );
    for (const s of STEPS) assert.ok([WEB, ISSUER].some((o) => s.request(WEB, ISSUER).url.startsWith(`${o}/`)));
  });

  test("the GraphQL steps send the web app's own origin (its proxy's check) and the seeded bakery", () => {
    const ordering = STEPS.find((s) => s.name === 'ordering').request(WEB, ISSUER);
    assert.equal(ordering.init.headers.origin, WEB);
    assert.deepEqual(JSON.parse(ordering.init.body).variables, { vendorId: VENDOR });
  });

  test("an error answer is not the app's own: a GraphQL error, an error page, a redirect", () => {
    const [issuer, web, bff, catalog] = STEPS;
    assert.equal(issuer.check(200, '<html>'), false);
    assert.equal(web.check(302, ''), false);
    assert.equal(web.check(503, ''), false);
    assert.equal(bff.check(200, JSON.stringify({ errors: [{ message: 'x' }], data: null })), false);
    assert.equal(catalog.check(200, JSON.stringify({ data: { listings: { edges: [] } } })), false);
  });
});

describe('a step', () => {
  test('a quick first answer is warm', async () => {
    const net = fakeNetwork(all());
    const r = await warmStep(STEPS[0], opts(net));
    assert.deepEqual(
      { ok: r.ok, attempts: r.attempts, seen: r.seen, likelyCold: r.likelyCold },
      { ok: true, attempts: 1, seen: ['200'], likelyCold: false },
    );
    assert.equal(r.startedAt, '2026-11-21T17:00:00.000Z');
  });

  test('one long answer (the ingress holding the request while a replica starts) is a cold start', async () => {
    const net = fakeNetwork(all({ issuer: [{ ...ok.issuer, ms: COLD_MS + 1 }] }));
    const r = await warmStep(STEPS[0], opts(net));
    assert.equal(r.ok, true);
    assert.equal(r.ms, COLD_MS + 1);
    assert.equal(r.likelyCold, true);
  });

  test('errors and not-ready answers are retried every 5 seconds until the app answers, and each is recorded', async () => {
    const catalog = STEPS.find((s) => s.name === 'catalog');
    const notReady = { status: 200, body: JSON.stringify({ errors: [{ message: 'unavailable' }] }) };
    const net = fakeNetwork(all({ catalog: [{ throw: 'TimeoutError' }, notReady, { status: 503 }, ok.catalog] }));
    const r = await warmStep(catalog, opts(net));
    assert.deepEqual(r.seen, ['timeout', '200-not-ready', '503-not-ready', '200']);
    assert.equal(r.attempts, 4);
    assert.equal(r.ok, true);
    assert.equal(r.likelyCold, true);
    assert.equal(r.ms, 4 * 10 + 3 * 5000);
  });

  test('a step that never answers stops at its limit', async () => {
    const net = fakeNetwork(all({ issuer: [{ status: 503 }] }));
    const r = await warmStep(STEPS[0], opts(net, { limitMs: 20_000 }));
    assert.equal(r.ok, false);
    assert.ok(r.ms >= 20_000);
  });

  test('each request carries a timeout and follows no redirect', async () => {
    const net = fakeNetwork(all());
    await warmStep(STEPS[0], opts(net));
    assert.equal(net.state.calls[0].init.redirect, 'manual');
    assert.ok(net.state.calls[0].init.signal instanceof AbortSignal);
  });
});

describe('a run', () => {
  test('every step in order; the record and table hold no address', async () => {
    const net = fakeNetwork(all());
    const run = await warmUp(opts(net));
    assert.equal(run.ok, true);
    assert.deepEqual(
      run.steps.map((s) => s.step),
      ['issuer', 'web', 'bff', 'catalog', 'ordering'],
    );
    const text = table('lead', run) + JSON.stringify(run);
    assert.doesNotMatch(text, /example\.test/);
    assert.match(table('lead', run), /^Deployed warm-up, measured from: lead\n\| Step \| Wakes \|/);
  });

  test('stops at the first step with no answer: the apps behind it would not answer either', async () => {
    const net = fakeNetwork(all({ bff: [{ status: 502 }] }));
    const run = await warmUp(opts(net, { limitMs: 10_000 }));
    assert.equal(run.ok, false);
    assert.deepEqual(
      run.steps.map((s) => [s.step, s.ok]),
      [
        ['issuer', true],
        ['web', true],
        ['bff', false],
      ],
    );
    assert.match(table('agent', run), /no answer after/);
    assert.match(table('agent', run), /stopped at the first step with no answer/);
  });
});
