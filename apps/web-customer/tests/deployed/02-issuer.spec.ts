import { CUSTOMERS, ISSUER, WEB, expect, test } from './support';

// Test 3 of the deployed suite (register 218): the mock issuer's guards on its public address (items 32, 102, ADR-0023): the registered callback gets
// the login page, an unregistered redirect_uri is refused and not echoed, and a crafted state is neither run as markup nor changed. Only the web app's
// callback is registered in dev. A customer is the only role offered without an address allow-list (item 102).

const REGISTERED = `${WEB}/api/auth/callback`;
const authorize = (redirectUri: string, state = 's') =>
  `${ISSUER}/authorize?response_type=code&client_id=web-customer&redirect_uri=${encodeURIComponent(redirectUri)}` +
  `&state=${encodeURIComponent(state)}&code_challenge=c&code_challenge_method=S256`;

test('3. the deployed issuer: the registered callback gets the login page, an unregistered one is refused, a crafted state is inert', async ({
  request,
}) => {
  const page = await request.get(authorize(REGISTERED));
  expect(page.status()).toBe(200);
  const html = await page.text();
  expect(html).toContain(`Login as ${CUSTOMERS.alice} (Customer)`);
  expect(html).not.toMatch(/\((Vendor|Admin)\)/); // Customer only without an allow-list (MockOidc__AllowedRoles, item 102)

  const evil = await request.get(authorize('https://evil.example/steal'));
  expect(evil.status()).toBe(400);
  expect(await evil.text()).not.toContain('evil.example');
  const evilSubmit = await request.post(`${ISSUER}/authorize/submit`, {
    form: { userId: 'user-customer-1', redirect_uri: 'https://evil.example/steal', state: 's' },
    maxRedirects: 0,
  });
  expect(evilSubmit.status()).toBe(400);
  expect(evilSubmit.headers()['location']).toBeUndefined();

  const payload = `"><script>alert(1)</script>`;
  const crafted = await request.get(authorize(REGISTERED, payload));
  expect(crafted.status()).toBe(200);
  expect(await crafted.text()).not.toContain('<script>alert(1)</script>');
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
  const back = new URL(submit.headers()['location']!);
  expect(back.origin + back.pathname).toBe(REGISTERED);
  expect(back.searchParams.get('state')).toBe(payload);

  // The discovery document names the public https issuer and https endpoints: the services fetch the signing keys from jwks_uri and refuse plain http
  // outside local development (item 176). Behind the ingress, which ends TLS, the host must take the scheme from X-Forwarded-Proto (item 226).
  const discovery = await request.get(`${ISSUER}/.well-known/openid-configuration`);
  expect(discovery.status()).toBe(200);
  const metadata = await discovery.json();
  expect(metadata.issuer).toBe(ISSUER);
  for (const key of ['jwks_uri', 'authorization_endpoint', 'token_endpoint'])
    expect(metadata[key], key).toMatch(new RegExp(`^${ISSUER.replace(/[.]/g, '\\.')}/`));
});
