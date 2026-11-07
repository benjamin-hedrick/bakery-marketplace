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
