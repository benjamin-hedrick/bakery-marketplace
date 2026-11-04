import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createServer, type Logger } from '../src/server.ts';

// WI-TAG-001: the public tag registry, mapped from the catalog with nothing added (ADR-0022, ADR-0013). Public: no token is needed or sent.

const tags = [
  { id: 'dairy', kind: 'allergen', label: 'Milk (dairy)', sortOrder: 10 },
  { id: 'tree-nut', kind: 'allergen', label: 'Tree nuts', sortOrder: 20 },
  { id: 'vegan', kind: 'diet', label: 'Vegan', sortOrder: 30 },
];

interface Seen {
  url: string;
  authorization: string | undefined;
}
const seen: Seen[] = [];
let mode: 'ok' | 'error' | 'badkind' = 'ok';

const reply = (res: http.ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const catalog = http.createServer((req, res) => {
  seen.push({ url: req.url ?? '', authorization: req.headers.authorization });
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname !== '/catalog/tags') return reply(res, 404, {});
  if (mode === 'error') return reply(res, 500, { message: 'secret detail at http://cosmos.internal' });
  if (mode === 'badkind') return reply(res, 200, { items: [{ id: 'x', kind: 'cuisine', label: 'X', sortOrder: 1 }] });
  const kind = url.searchParams.get('kind');
  return reply(res, 200, { items: kind ? tags.filter((t) => t.kind === kind) : tags });
});
const ordering = http.createServer((_req, res) => reply(res, 404, {}));

const logs: Record<string, unknown>[] = [];
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
    { log, exporter: () => {} },
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
  mode = 'ok';
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

const TAGS = `query($kind: TagKind) { tags(kind: $kind) { id kind label } }`;

describe('Query.tags', () => {
  test('maps the registry as sent, with the kind in the schema’s words and the id left as the registry’s own', async () => {
    const { body } = await gql(TAGS);

    assert.equal(body.errors, undefined);
    assert.deepEqual(body.data.tags, [
      { id: 'dairy', kind: 'ALLERGEN', label: 'Milk (dairy)' },
      { id: 'tree-nut', kind: 'ALLERGEN', label: 'Tree nuts' },
      { id: 'vegan', kind: 'DIET', label: 'Vegan' },
    ]);
    assert.equal(seen[0]!.url, '/catalog/tags');
  });

  test('passes the kind to the catalog in its lower-case word', async () => {
    const { body } = await gql(TAGS, { kind: 'ALLERGEN' });

    assert.deepEqual(
      body.data.tags.map((t: { id: string }) => t.id),
      ['dairy', 'tree-nut'],
    );
    assert.equal(seen[0]!.url, '/catalog/tags?kind=allergen');
  });

  test('is public: it works without a token and sends none to the catalog', async () => {
    await gql(TAGS);
    await gql(TAGS, {}, { authorization: 'Bearer header.payload.signature' });

    assert.equal(seen.length, 2);
    assert.ok(seen.every((s) => s.authorization === undefined));
  });

  test('a kind the schema does not have is refused before the catalog is asked', async () => {
    const { body } = await gql(TAGS, { kind: 'CUISINE' });

    assert.ok(body.errors.length > 0);
    assert.equal(seen.length, 0);
  });

  test('a service failure is an internal error that leaks nothing of the service', async () => {
    mode = 'error';

    const { body } = await gql(TAGS);

    assert.equal(body.errors[0].extensions.code, 'INTERNAL');
    assert.doesNotMatch(JSON.stringify(body), /cosmos|secret/);
  });

  test('a kind the BFF has no name for is an internal error, never guessed', async () => {
    mode = 'badkind';

    const { body } = await gql(TAGS);

    assert.equal(body.errors[0].extensions.code, 'INTERNAL');
    assert.doesNotMatch(JSON.stringify(body), /cuisine/i);
  });
});
