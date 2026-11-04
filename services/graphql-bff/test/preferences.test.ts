import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createServer, type Logger } from '../src/server.ts';

// WI-PREF-001: the caller's allergen profile through the BFF. Quasi-health data (NFR 3.7): passed to the catalog with the caller's token, mapped
// without rules of its own, and never logged or exported.

const TOKEN = 'header.payload.signature';

interface Seen {
  method: string;
  url: string;
  authorization: string | undefined;
  body: string;
}
const seen: Seen[] = [];
let mode: 'ok' | 'rejected' | 'unknown422' | 'unauthorized' | 'forbidden' | 'error' = 'ok';
let stored = { allergies: ['tree-nut'], avoid: ['dairy'] };

const reply = (res: http.ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const catalog = http.createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = Buffer.concat(chunks).toString('utf8');
  seen.push({ method: req.method ?? '', url: req.url ?? '', authorization: req.headers.authorization, body });
  if (req.url !== '/catalog/preferences') return reply(res, 404, {});
  if (mode === 'unauthorized') return reply(res, 401, {});
  if (mode === 'forbidden') return reply(res, 403, {});
  if (mode === 'error') return reply(res, 500, { message: 'secret detail at http://cosmos.internal' });
  if (req.method === 'PUT') {
    if (mode === 'rejected') {
      return reply(res, 422, {
        code: 'validation_failed',
        message: 'The preferences are invalid.',
        errors: {
          allergies: ["'nuts' is not an allergen in the list. Use one of: dairy, egg."],
          avoid: ['x'.repeat(500)],
        },
      });
    }
    if (mode === 'unknown422') return reply(res, 422, { code: 'something_else' });
    stored = JSON.parse(body) as typeof stored;
  }
  return reply(res, 200, { ...stored, updatedAt: '2026-11-04T12:00:00+00:00' });
});
const ordering = http.createServer((_req, res) => reply(res, 404, {}));

const logs: Record<string, unknown>[] = [];
const spans: unknown[] = [];
const log: Logger = { info: (e) => logs.push(e), error: (e) => logs.push(e) };
let bff: http.Server;
let bffUrl: string;

before(async () => {
  await new Promise<void>((r) => catalog.listen(0, '127.0.0.1', r));
  await new Promise<void>((r) => ordering.listen(0, '127.0.0.1', r));
  const port = (s: http.Server) => (s.address() as AddressInfo).port;
  bff = createServer(
    {
      port: 0,
      catalogUrl: `http://127.0.0.1:${port(catalog)}`,
      orderingUrl: `http://127.0.0.1:${port(ordering)}`,
      timeoutMs: 300,
      checkoutTimeoutMs: 300,
      testHooks: false,
    },
    { log, exporter: (s) => spans.push(s) },
  );
  await new Promise<void>((r) => bff.listen(0, '127.0.0.1', r));
  bffUrl = `http://127.0.0.1:${port(bff)}/graphql`;
});
after(() => {
  bff.close();
  catalog.close();
  ordering.close();
});
beforeEach(() => {
  seen.length = 0;
  logs.length = 0;
  spans.length = 0;
  mode = 'ok';
  stored = { allergies: ['tree-nut'], avoid: ['dairy'] };
});

/* eslint-disable @typescript-eslint/no-explicit-any */
type GqlBody = { data?: any; errors: any[] }; // `errors` is absent on success; tests assert that explicitly
/* eslint-enable @typescript-eslint/no-explicit-any */

async function gql(query: string, variables?: object, headers: Record<string, string> = {}) {
  const res = await fetch(bffUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ query, variables }),
  });
  return { res, body: (await res.json()) as GqlBody };
}
const auth = { authorization: `Bearer ${TOKEN}` };

const READ = `query { preferences { allergies avoid } }`;
const SAVE = `mutation($input: SavePreferencesInput!) { savePreferences(input: $input) {
  __typename
  ... on SavePreferencesSuccess { preferences { allergies avoid } }
  ... on SavePreferencesRejected { message fields { field message } } } }`;
const input = { allergies: ['sesame', 'tree-nut'], avoid: ['dairy'] };

describe('Query.preferences', () => {
  test('maps the profile, asks the catalog for the caller’s own, and forwards the caller’s token', async () => {
    const { body, res } = await gql(READ, {}, auth);

    assert.equal(body.errors, undefined);
    assert.deepEqual(body.data.preferences, { allergies: ['tree-nut'], avoid: ['dairy'] });
    assert.deepEqual(
      seen.map((s) => [s.method, s.url, s.authorization]),
      [['GET', '/catalog/preferences', `Bearer ${TOKEN}`]],
    );
    assert.match(res.headers.get('cache-control') ?? '', /no-store/);
  });

  test('needs a token: without one nothing is asked of the catalog', async () => {
    const { body } = await gql(READ);

    assert.equal(body.errors[0].extensions.code, 'UNAUTHENTICATED');
    assert.equal(seen.length, 0);
  });

  test('a token the catalog refuses is UNAUTHENTICATED and one whose role is not a customer’s is FORBIDDEN', async () => {
    mode = 'unauthorized';
    const refused = await gql(READ, {}, auth);
    mode = 'forbidden';
    const wrongRole = await gql(READ, {}, auth);

    assert.equal(refused.body.errors[0].extensions.code, 'UNAUTHENTICATED');
    assert.equal(wrongRole.body.errors[0].extensions.code, 'FORBIDDEN');
  });

  test('a service failure is an internal error that leaks nothing of the service', async () => {
    mode = 'error';

    const { body } = await gql(READ, {}, auth);

    assert.equal(body.errors[0].extensions.code, 'INTERNAL');
    assert.doesNotMatch(JSON.stringify(body), /cosmos|secret/);
  });
});

describe('Mutation.savePreferences', () => {
  test('sends exactly the two lists to the catalog as a PUT with the caller’s token, and returns what was saved', async () => {
    const { body } = await gql(SAVE, { input }, auth);

    assert.equal(body.errors, undefined);
    assert.deepEqual(body.data.savePreferences, { __typename: 'SavePreferencesSuccess', preferences: input });
    assert.equal(seen.length, 1);
    assert.equal(seen[0]!.method, 'PUT');
    assert.equal(seen[0]!.authorization, `Bearer ${TOKEN}`);
    assert.deepEqual(JSON.parse(seen[0]!.body), input);
  });

  test('two empty lists are a valid save (they clear the profile)', async () => {
    const { body } = await gql(SAVE, { input: { allergies: [], avoid: [] } }, auth);

    assert.deepEqual(body.data.savePreferences.preferences, { allergies: [], avoid: [] });
  });

  test('a refusal comes back as a typed rejection with fixed text and shortened field messages, not as an error', async () => {
    mode = 'rejected';

    const { body } = await gql(SAVE, { input }, auth);

    assert.equal(body.errors, undefined);
    const rejected = body.data.savePreferences;
    assert.equal(rejected.__typename, 'SavePreferencesRejected');
    assert.equal(rejected.message, 'Your allergies could not be saved as entered.');
    assert.equal(rejected.fields[0].field, 'allergies');
    assert.match(rejected.fields[0].message, /'nuts' is not an allergen/);
    assert.ok(rejected.fields[1].message.length <= 200);
    assert.doesNotMatch(JSON.stringify(rejected), /The preferences are invalid/); // the service’s own sentence is not passed on
  });

  test('a 422 that is not the catalog’s validation body is an internal error, never guessed', async () => {
    mode = 'unknown422';

    const { body } = await gql(SAVE, { input }, auth);

    assert.equal(body.errors[0].extensions.code, 'INTERNAL');
  });

  test('needs a token: without one nothing is sent', async () => {
    const { body } = await gql(SAVE, { input });

    assert.equal(body.errors[0].extensions.code, 'UNAUTHENTICATED');
    assert.equal(seen.length, 0);
  });

  test('a token the catalog refuses is UNAUTHENTICATED and a vendor’s is FORBIDDEN', async () => {
    mode = 'unauthorized';
    const refused = await gql(SAVE, { input }, auth);
    mode = 'forbidden';
    const wrongRole = await gql(SAVE, { input }, auth);

    assert.equal(refused.body.errors[0].extensions.code, 'UNAUTHENTICATED');
    assert.equal(wrongRole.body.errors[0].extensions.code, 'FORBIDDEN');
  });

  test('the input has no customer: only the two lists are accepted', async () => {
    const { body } = await gql(SAVE, { input: { ...input, customerId: 'someone-else' } }, auth);

    assert.ok(body.errors.length > 0);
    assert.equal(seen.length, 0);
  });
});

describe('the profile is not recorded', () => {
  test('no allergen id reaches a log line or an exported span, for a read, a save, a refusal and a failure', async () => {
    await gql(READ, {}, auth);
    await gql(SAVE, { input }, auth);
    mode = 'rejected';
    await gql(SAVE, { input }, auth);
    mode = 'error';
    await gql(SAVE, { input }, auth);
    mode = 'unauthorized';
    await gql(READ, {}, auth);

    const recorded = JSON.stringify({ logs, spans });
    assert.ok(logs.length > 0 && spans.length > 0); // something was recorded, so the check is meaningful
    for (const secret of ['sesame', 'tree-nut', 'dairy', 'nuts', 'allergies', 'avoid']) {
      assert.doesNotMatch(recorded, new RegExp(secret, 'i'), `${secret} was recorded`);
    }
  });
});
