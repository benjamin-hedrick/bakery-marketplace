import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { adjustStock, quantity, userToken } from './support';

// WI-CUST-005 and WI-CUST-006 on the real stack: the allergen profile page and the conflicts laid over the seeded catalog, through Next.js, the
// GraphQL BFF, the catalog service and Cosmos. The seed has the almond croissant (tree nuts on the item and in "Extra almond", dairy on the item)
// and the sourdough (sesame only in "Add seeds"). The mock issuer has one customer, so two customers cannot be told apart here.
// Needs the whole local stack (docs/operations/local-dev.md); node scripts/ci/skeleton-smoke.mjs starts it.

const BFF = process.env.BFF_URL ?? 'http://localhost:4100';

test.describe.configure({ mode: 'serial' });

/** Puts a few croissants back, so the journey does not depend on what earlier runs of the same stack left (the seed has 4). */
async function restockCroissant(request: import('@playwright/test').APIRequestContext) {
  const vendor = await userToken('vendor-shop-001');
  // Only when a kept stack has used the croissants up: a fresh one keeps the seed's stock, which other journeys count on.
  if ((await quantity(request, vendor, 'listing-croissant-001')) < 2)
    await adjustStock(request, vendor, 'listing-croissant-001', 4);
}

/** Clears the one customer's profile, so this file leaves the others as it found them. */
async function clearProfile(request: import('@playwright/test').APIRequestContext) {
  const token = await userToken('user-customer-1');
  const res = await request.post(`${BFF}/graphql`, {
    headers: { authorization: `Bearer ${token}` },
    data: {
      query: 'mutation { savePreferences(input: { allergies: [], avoid: [] }) { __typename } }',
    },
  });
  expect((await res.json()).data.savePreferences.__typename).toBe('SavePreferencesSuccess');
}

async function logIn(page: Page, who: 'Alice Customer (Customer)' | 'Corner Bakery (owner) (Vendor)') {
  await expect(page).toHaveURL(/localhost:5100\/authorize/);
  await page.getByRole('button', { name: `Login as ${who}` }).click();
}

const group = (page: Page, allergen: string) =>
  page.locator(`[data-testid="allergen-group"][data-allergen="${allergen}"]`);

test.beforeAll(async ({ request }) => {
  await clearProfile(request);
  await restockCroissant(request);
});
test.afterAll(async ({ request }) => clearProfile(request));

test('a customer sets an allergy in the browser, it comes back after a reload, and the seeded catalog is marked from it', async ({
  page,
}) => {
  await page.goto('/preferences');
  await page.getByTestId('login-required').getByRole('button', { name: 'Log in' }).click();
  await logIn(page, 'Alice Customer (Customer)');

  await expect(page.getByTestId('allergen-group')).toHaveCount(9);
  await expect(page.getByRole('radio', { name: /^Not set/, checked: true })).toHaveCount(9);
  await group(page, 'tree-nut')
    .getByRole('radio', { name: /^Allergy/ })
    .check();
  await group(page, 'sesame')
    .getByRole('radio', { name: /^Allergy/ })
    .check();
  await group(page, 'dairy')
    .getByRole('radio', { name: /^Avoid/ })
    .check();
  await page.getByRole('button', { name: 'Save my choices' }).click();
  await expect(page.getByTestId('preferences-saved')).toBeVisible();

  await page.reload();
  await expect(group(page, 'tree-nut').getByRole('radio', { name: /^Allergy/ })).toBeChecked();
  await expect(group(page, 'dairy').getByRole('radio', { name: /^Avoid/ })).toBeChecked();

  // The public page, then marked from the stored profile.
  await page.goto('/');
  const croissant = page.getByTestId('listing').filter({ hasText: 'Almond Croissant' });
  await expect(croissant.locator('[data-severity="ALLERGY"]').first()).toContainText(
    'Contains tree nuts, which you listed as an allergy',
  );
  await expect(croissant.locator('[data-severity="AVOID"]')).toContainText('Contains milk (dairy), which you avoid');
  await expect(croissant).toContainText('Extra almonds contains tree nuts');
  await expect(page.getByTestId('listing').filter({ hasText: 'Country Sourdough' })).toContainText(
    'Add seeds contains sesame',
  );

  // Hiding removes the items that list an allergen themselves, and only those.
  await page.getByRole('checkbox', { name: /Hide items/ }).check();
  await expect(croissant).toHaveCount(0);
  await expect(page.getByTestId('listing').filter({ hasText: 'Country Sourdough' })).toHaveCount(1);
  await expect(page.getByTestId('hidden-count')).toContainText('hidden');

  // The detail page shows the item's and the option's conflicts.
  await page.getByRole('checkbox', { name: /Hide items/ }).uncheck();
  await croissant.getByRole('link').click();
  await expect(page.getByTestId('personal-detail').getByTestId('conflict').first()).toContainText('Contains tree nuts');
  await expect(page.locator('label').filter({ hasText: 'Extra almonds' }).getByTestId('conflict')).toContainText(
    'Extra almonds contains tree nuts',
  );
});

test('clearing the profile in the browser removes the marks', async ({ page }) => {
  await page.goto('/preferences');
  await page.getByTestId('login-required').getByRole('button', { name: 'Log in' }).click();
  await logIn(page, 'Alice Customer (Customer)');
  await expect(group(page, 'tree-nut').getByRole('radio', { name: /^Allergy/ })).toBeChecked();

  for (const id of ['tree-nut', 'sesame', 'dairy'])
    await group(page, id)
      .getByRole('radio', { name: /^Not set/ })
      .check();
  await page.getByRole('button', { name: 'Save my choices' }).click();
  await expect(page.getByTestId('preferences-saved')).toBeVisible();

  await page.goto('/');
  await expect(page.getByTestId('listing').first()).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('conflict')).toHaveCount(0);
  await expect(page.getByTestId('personal-panel')).toHaveCount(0);
});

test('a vendor’s login is refused the profile page, which shows no choices, and the public page is unchanged', async ({
  page,
}) => {
  await page.goto('/preferences');
  await page.getByTestId('login-required').getByRole('button', { name: 'Log in' }).click();
  await logIn(page, 'Corner Bakery (owner) (Vendor)');

  await expect(page.getByTestId('preferences-failed')).toBeVisible();
  await expect(page.getByTestId('allergen-group')).toHaveCount(0);

  await page.goto('/');
  await expect(page.getByTestId('listing').first()).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('conflict')).toHaveCount(0);
});
