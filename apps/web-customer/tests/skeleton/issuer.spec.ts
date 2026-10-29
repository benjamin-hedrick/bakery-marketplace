import { expect, test } from '@playwright/test';

// S1-06 against the real mock issuer container (docker compose): the login page does not reflect what it is sent as markup (open item 32),
// and the issuer only sends a browser back to a registered redirect_uri (D-D). The web app's own callback is the registered one, which
// the login specs already prove works.

const ISSUER = process.env.ISSUER_URL ?? 'http://localhost:5100';
const REGISTERED = 'http://localhost:3000/auth/callback';
const authorize = (redirectUri: string, state = 's') =>
  `${ISSUER}/authorize?response_type=code&client_id=web-customer&redirect_uri=${encodeURIComponent(redirectUri)}` +
  `&state=${encodeURIComponent(state)}&code_challenge=c&code_challenge_method=S256`;

test('the registered callback gets the login page', async ({ request }) => {
  const res = await request.get(authorize(REGISTERED));
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain('Login as Alice Customer (Customer)');
});

test('a redirect_uri that is not registered is refused and not echoed', async ({ request }) => {
  const res = await request.get(authorize('http://evil.example/steal'));
  expect(res.status()).toBe(400);
  expect(await res.text()).not.toContain('evil.example');

  const submit = await request.post(`${ISSUER}/authorize/submit`, {
    form: { userId: 'user-customer-1', redirect_uri: 'http://evil.example/steal', state: 's' },
    maxRedirects: 0,
  });
  expect(submit.status()).toBe(400);
  expect(submit.headers()['location']).toBeUndefined();
});

test('a crafted state cannot inject markup into the login page, and still comes back unchanged', async ({
  request,
}) => {
  const payload = `"><script>alert(1)</script>`;
  const res = await request.get(authorize(REGISTERED, payload));
  const html = await res.text();
  expect(res.status()).toBe(200);
  expect(html).not.toContain('<script>alert(1)</script>');

  const submit = await request.post(`${ISSUER}/authorize/submit`, {
    form: {
      userId: 'user-customer-1',
      redirect_uri: REGISTERED,
      state: payload,
      code_challenge: 'c',
      code_challenge_method: 'S256',
    },
    maxRedirects: 0,
  });
  expect(submit.status()).toBe(302);
  expect(new URL(submit.headers()['location']!).searchParams.get('state')).toBe(payload);
});
