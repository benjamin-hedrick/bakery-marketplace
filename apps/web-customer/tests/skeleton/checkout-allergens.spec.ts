import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { userToken } from './support';

// WI-CUST-008 on the real stack: the seeded almond croissant against a tree-nut allergy. The customer's profile is saved through the BFF, then in the
// browser: the cart line says what it contains, the check names the conflict, the order cannot be placed until the customer acknowledges it, and the
// order that is placed carries the allergy the customer chose to tell the bakery (read back through the BFF). The mock issuer has one customer.
// Needs the whole local stack (docs/operations/local-dev.md); node scripts/ci/skeleton-smoke.mjs starts it.

const BFF = process.env.BFF_URL ?? 'http://localhost:4100';

test.describe.configure({ mode: 'serial' });

async function saveProfile(request: APIRequestContext, allergies: string[], avoid: string[]) {
  const token = await userToken('user-customer-1');
  const res = await request.post(`${BFF}/graphql`, {
    headers: { authorization: `Bearer ${token}` },
    data: {
      query: 'mutation($input: SavePreferencesInput!) { savePreferences(input: $input) { __typename } }',
      variables: { input: { allergies, avoid } },
    },
  });
  expect((await res.json()).data.savePreferences.__typename).toBe('SavePreferencesSuccess');
}

test.afterAll(async ({ request }) => saveProfile(request, [], [])); // leave the profile as the other files expect it

test('a customer allergic to tree nuts is warned about the croissant, must acknowledge, and the bakery is told with the order', async ({
  page,
  request,
}) => {
  await saveProfile(request, ['tree-nut'], ['dairy']);

  await page.goto('/');
  await page.getByTestId('listing').filter({ hasText: 'Almond Croissant' }).getByRole('link').click();
  await page.getByLabel(/Extra almond/).check();
  await page.getByRole('button', { name: 'Add to order' }).click();
  await expect(page.getByTestId('add-notice')).toContainText('Added to your order');
  await page.getByTestId('cart-link').click();
  await page.getByTestId('login-required').getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/localhost:5100\/authorize/);
  await page.getByRole('button', { name: 'Login as Alice Customer (Customer)' }).click();
  await expect(page.getByRole('form', { name: 'Place your order' })).toBeVisible();

  // What the line contains, from the real catalog's flags and registry labels.
  await expect(page.getByTestId('line-allergens')).toContainText('tree nuts');
  await expect(page.getByTestId('line-allergens')).toContainText('Extra almond contains tree nuts');

  // The real check names the conflicts and holds the button until the customer acknowledges.
  await expect(page.getByTestId('conflicts')).toContainText(
    'Almond Croissant contains tree nuts, which you listed as an allergy',
  );
  await expect(page.getByTestId('conflicts')).toContainText('which you avoid');
  const place = page.getByRole('button', { name: 'Place test order' });
  await expect(place).toBeDisabled();
  await page.getByRole('checkbox', { name: 'I have read this and still want to order' }).check();
  await expect(page.getByTestId('tell-bakery').getByRole('checkbox', { name: 'Tree nuts' })).toBeChecked();

  await place.click();
  await expect(page).toHaveURL(/\/orders\/.+/);

  // The order carries the allergy.
  const orderGid = decodeURIComponent(new URL(page.url()).pathname.split('/').pop()!);
  const token = await userToken('user-customer-1');
  const read = await request.post(`${BFF}/graphql`, {
    headers: { authorization: `Bearer ${token}` },
    data: { query: 'query($id: ID!) { order(id: $id) { allergens } }', variables: { id: orderGid } },
  });
  expect((await read.json()).data.order.allergens).toEqual(['tree-nut']);
});

test('a cart with no conflict for the same customer (tree nuts, dairy) has nothing to acknowledge, and an option not chosen is not named', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('listing').filter({ hasText: 'Country Sourdough' }).getByRole('link').click();
  await page.getByRole('button', { name: 'Add to order' }).click();
  await page.getByTestId('cart-link').click();
  await page.getByTestId('login-required').getByRole('button', { name: 'Log in' }).click();
  await page.getByRole('button', { name: 'Login as Alice Customer (Customer)' }).click();
  await expect(page.getByRole('form', { name: 'Place your order' })).toBeVisible();

  await expect(page.getByTestId('line-allergens')).not.toContainText('sesame');
  await expect(page.getByTestId('conflict')).toHaveCount(0); // the profile (tree nuts, dairy) has no conflict with a plain sourdough
  await expect(page.getByRole('button', { name: 'Place test order' })).toBeEnabled();
});
