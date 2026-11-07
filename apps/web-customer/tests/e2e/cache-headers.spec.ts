import { expect, test } from '@playwright/test';

// WI-PORT-004 (ADR-0014 layer 3): every route sets its own Cache-Control; nothing relies on the framework's default. The pages show stock, so
// they are private and not stored; the GraphQL route is covered by the BFF's and the proxy's own tests.

const listingId = (serviceId: string) => encodeURIComponent(Buffer.from(`Listing:${serviceId}`).toString('base64'));

test('the public listing pages are private and not stored by any cache, found or not', async ({ request }) => {
  for (const path of [
    '/',
    '/?tag=vegan',
    `/listings/${listingId('listing-sourdough-001')}`,
    `/listings/${listingId('listing-nope')}`, // not found
  ]) {
    const res = await request.get(path);
    expect(res.headers()['cache-control'], path).toBe('private, no-store');
  }
});

test('the GraphQL route is not stored either', async ({ request }) => {
  const res = await request.post('/api/graphql', {
    data: { query: '{ listings(first: 1) { edges { node { id } } } }' },
    headers: { origin: 'http://localhost:3000' }, // the route refuses a request that is not from the app's own origin
  });
  expect(res.headers()['cache-control'], `${res.status()} ${await res.text()}`).toContain('no-store');
});

// Register 159: what an API route answers by itself (a refusal, a body that is too large, no such route) is not stored either. The default for every
// /api response is `no-store` (next.config.js); the BFF's own answer above still passes through as the BFF sent it.
test('the refusals the app writes itself are not stored', async ({ request }) => {
  const cases: [string, () => ReturnType<typeof request.post>][] = [
    ['a GraphQL request from no origin', () => request.post('/api/graphql', { data: '{}' })],
    [
      'a GraphQL request that is too large',
      () =>
        request.post('/api/graphql', {
          data: JSON.stringify({ query: 'x'.repeat(70 * 1024) }),
          headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
        }),
    ],
    ['an API route that does not exist', () => request.post('/api/no-such-route', { data: '{}' })],
  ];
  for (const [name, send] of cases) {
    const res = await send();
    // `no-store` for the app's own refusals; Next's own 404 for a route that does not exist says the same and more, so the match is on the directive.
    expect(res.headers()['cache-control'], `${name} (${res.status()})`).toContain('no-store');
  }
});
