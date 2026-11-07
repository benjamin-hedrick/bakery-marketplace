import { expect, test } from '@playwright/test';

// Register 159, ADR-0014 layer 3: what an API route answers by itself is not stored by any cache. The default for every /api response is `no-store`
// (next.config.js, the same rule as in apps/web-customer). The stream's own policy, `no-store, no-transform`, and the BFF's pass-through are the proxy's
// and are covered by the live-queue tests.

test('the refusals the app writes itself are not stored', async ({ request }) => {
  const cases: [string, () => ReturnType<typeof request.post>][] = [
    ['a GraphQL request from no origin', () => request.post('/api/graphql', { data: '{}' })],
    [
      'a GraphQL request that is too large',
      () =>
        request.post('/api/graphql', {
          data: JSON.stringify({ query: 'x'.repeat(70 * 1024) }),
          headers: { origin: 'http://localhost:3100', 'content-type': 'application/json' },
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
