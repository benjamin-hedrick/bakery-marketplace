// Minimal mock of the GraphQL BFF for WI-PORT-001 (real graphql-js execution, canned data).
// Test hooks (non-production only): `x-fixture: A|B` selects data, `x-delay-ms` delays the response,
// POST /__control {"revision": n} shifts every price by n cents so refetches are observable.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSchema, graphql } from 'graphql';
import { fixtures } from './fixtures.mjs';

const schema = buildSchema(readFileSync(fileURLToPath(new URL('../../../services/graphql-bff/schema/schema.graphql', import.meta.url)), 'utf8'));
let revision = 0;

const money = (cents) => ({ cents, currency: 'USD' });
const shape = (l) => ({
  ...l,
  price: money(l.priceCents + revision),
  modifiers: l.modifiers.map((m) => ({ ...m, priceDelta: money(m.priceDeltaCents) })),
});
const data = (fixture) => (fixtures[fixture] ?? fixtures.A).map(shape);

function rootFor(fixture) {
  return {
    listings: () => {
      const edges = data(fixture).map((node) => ({ cursor: node.id, node }));
      return { edges, pageInfo: { hasNextPage: false, endCursor: edges.at(-1)?.cursor ?? null } };
    },
    listing: ({ id }) => data(fixture).find((l) => l.id === id) ?? null,
    node: ({ id }) => data(fixture).find((l) => l.id === id) ?? null,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = http.createServer(async (req, res) => {
  const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');

  if (req.url === '/__control' && req.method === 'POST') {
    revision = Number(JSON.parse(raw || '{}').revision ?? 0);
    return send(200, { revision });
  }
  if (req.url === '/healthz') return send(200, { ok: true });
  if (req.url !== '/graphql' || req.method !== 'POST') return send(404, { error: 'not found' });

  const delay = Number(req.headers['x-delay-ms'] ?? 0);
  if (delay > 0) await sleep(Math.min(delay, 2000));
  const { query, variables } = JSON.parse(raw);
  const fixture = String(req.headers['x-fixture'] ?? 'A').toUpperCase();
  const result = await graphql({
    schema, source: query, variableValues: variables, rootValue: rootFor(fixture),
    typeResolver: (value) => value.__typename,
  });
  send(200, result);
});

const port = Number(process.env.MOCK_PORT ?? 4000);
server.listen(port, () => console.log(`mock GraphQL on http://localhost:${port}/graphql`));
