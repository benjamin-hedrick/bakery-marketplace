import { expect, test } from '@playwright/test';
import { userToken } from './support';

// WI-PREF-001 on the real stack: the customer's allergen profile through the GraphQL BFF, the catalog and the Cosmos `preferences` container
// (created by the catalog at start-up in local development). The mock issuer has one customer, so another customer's profile cannot be
// tried here; that is covered by the catalog's API tests, not by this run.
// Needs the whole local stack (docs/operations/local-dev.md); node scripts/ci/skeleton-smoke.mjs starts it.

const BFF = process.env.BFF_URL ?? 'http://localhost:4100';

async function gql(
  request: import('@playwright/test').APIRequestContext,
  token: string | null,
  query: string,
  variables?: object,
) {
  const res = await request.post(`${BFF}/graphql`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    data: { query, variables },
  });
  return res.json();
}

const READ = '{ preferences { allergies avoid } }';
const SAVE = `mutation($input: SavePreferencesInput!) { savePreferences(input: $input) {
  __typename
  ... on SavePreferencesSuccess { preferences { allergies avoid } }
  ... on SavePreferencesRejected { message fields { field message } } } }`;

test('a customer saves an allergen profile, reads it back, replaces it and clears it, on the real services', async ({
  request,
}) => {
  const token = await userToken('user-customer-1');

  // Start clean, whatever an earlier test in this run left.
  await gql(request, token, SAVE, { input: { allergies: [], avoid: [] } });
  expect((await gql(request, token, READ)).data.preferences).toEqual({ allergies: [], avoid: [] });

  const saved = await gql(request, token, SAVE, { input: { allergies: ['tree-nut', 'sesame'], avoid: ['dairy'] } });
  expect(saved.errors).toBeUndefined();
  expect(saved.data.savePreferences.__typename).toBe('SavePreferencesSuccess');
  expect((await gql(request, token, READ)).data.preferences).toEqual({
    allergies: ['tree-nut', 'sesame'],
    avoid: ['dairy'],
  });

  await gql(request, token, SAVE, { input: { allergies: ['gluten'], avoid: [] } });
  expect((await gql(request, token, READ)).data.preferences).toEqual({ allergies: ['gluten'], avoid: [] });

  await gql(request, token, SAVE, { input: { allergies: [], avoid: [] } });
  expect((await gql(request, token, READ)).data.preferences).toEqual({ allergies: [], avoid: [] });
});

test('an id that is not on offer, and an allergen in both lists, are refused by name and nothing is saved', async ({
  request,
}) => {
  const token = await userToken('user-customer-1');
  await gql(request, token, SAVE, { input: { allergies: ['sesame'], avoid: [] } });

  const unknown = await gql(request, token, SAVE, { input: { allergies: ['tree-nuts'], avoid: [] } });
  const both = await gql(request, token, SAVE, { input: { allergies: ['dairy'], avoid: ['dairy'] } });

  expect(unknown.data.savePreferences.__typename).toBe('SavePreferencesRejected');
  expect(unknown.data.savePreferences.fields[0].field).toBe('allergies');
  expect(unknown.data.savePreferences.fields[0].message).toContain("'tree-nuts'");
  expect(both.data.savePreferences.__typename).toBe('SavePreferencesRejected');
  expect(both.data.savePreferences.fields.map((f: { field: string }) => f.field)).toContain('avoid');
  expect((await gql(request, token, READ)).data.preferences.allergies).toEqual(['sesame']);
  await gql(request, token, SAVE, { input: { allergies: [], avoid: [] } });
});

test('a vendor’s token is refused the profile, and no token gets nothing', async ({ request }) => {
  const vendor = await userToken('vendor-shop-001');

  const read = await gql(request, vendor, READ);
  const write = await gql(request, vendor, SAVE, { input: { allergies: ['sesame'], avoid: [] } });
  const anonymous = await gql(request, null, READ);

  expect(read.errors[0].extensions.code).toBe('FORBIDDEN');
  expect(write.errors[0].extensions.code).toBe('FORBIDDEN');
  expect(anonymous.errors[0].extensions.code).toBe('UNAUTHENTICATED');
});
