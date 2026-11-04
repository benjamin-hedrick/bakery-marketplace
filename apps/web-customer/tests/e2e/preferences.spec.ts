import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { logIn, logOut, MOCK, stubIssuer } from './helpers';

// WI-CUST-005: the allergen profile page. Against the mock BFF, which keeps the one customer's profile and, like the real one, needs a bearer token.

const control = (body: object) =>
  fetch(`${MOCK}/__control`, { method: 'POST', body: JSON.stringify(body) }).then((r) => {
    if (!r.ok) throw new Error('the mock BFF did not take the state');
  });

const group = (page: Page, allergen: string) =>
  page.locator(`[data-testid="allergen-group"][data-allergen="${allergen}"]`);
const choose = (page: Page, allergen: string, label: 'Not set' | 'Avoid' | 'Allergy') =>
  group(page, allergen)
    .getByRole('radio', { name: new RegExp(`^${label}`) })
    .check();

async function openPage(page: Page) {
  await page.goto('/');
  await logIn(page);
  await page.getByTestId('preferences-link').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Your allergies' })).toBeVisible();
  await expect(page.getByTestId('allergen-group')).toHaveCount(9);
}

test.beforeEach(async ({ page }) => {
  await control({ resetPreferences: true });
  await stubIssuer(page);
});

test('a new customer sees every allergen as Not set, the plain wording, and can save at once', async ({ page }) => {
  await openPage(page);

  for (const id of ['dairy', 'egg', 'fish', 'shellfish', 'tree-nut', 'peanut', 'gluten', 'soy', 'sesame']) {
    await expect(group(page, id).getByRole('radio', { name: /^Not set/ })).toBeChecked();
  }
  await expect(page.getByTestId('preferences-note')).toContainText('not guaranteed free of anything');
  await expect(page.locator('main')).not.toContainText(/\bsafe\b/i);

  await page.getByRole('button', { name: 'Save my choices' }).click();
  await expect(page.getByTestId('preferences-saved')).toBeVisible();
});

test('each choice can be set, saved, and is still there after a reload; the labels come from the registry', async ({
  page,
}) => {
  await openPage(page);
  await expect(page.getByRole('group', { name: 'Tree nuts' })).toBeVisible();

  await choose(page, 'tree-nut', 'Allergy');
  await choose(page, 'dairy', 'Avoid');
  await expect(page.getByTestId('preferences-unsaved')).toBeVisible();
  await page.getByRole('button', { name: 'Save my choices' }).click();
  await expect(page.getByTestId('preferences-saved')).toBeVisible();
  await expect(page.getByTestId('preferences-unsaved')).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('allergen-group')).toHaveCount(9);
  await expect(group(page, 'tree-nut').getByRole('radio', { name: /^Allergy/ })).toBeChecked();
  await expect(group(page, 'dairy').getByRole('radio', { name: /^Avoid/ })).toBeChecked();
  await expect(group(page, 'soy').getByRole('radio', { name: /^Not set/ })).toBeChecked();
});

test('one allergen has one choice: changing it replaces the earlier one', async ({ page }) => {
  await control({ preferences: { allergies: ['peanut'], avoid: [] } });
  await openPage(page);
  await expect(group(page, 'peanut').getByRole('radio', { name: /^Allergy/ })).toBeChecked();

  await choose(page, 'peanut', 'Avoid');
  await expect(group(page, 'peanut').getByRole('radio', { name: /^Allergy/ })).not.toBeChecked();
  await page.getByRole('button', { name: 'Save my choices' }).click();
  await expect(page.getByTestId('preferences-saved')).toBeVisible();

  await page.reload();
  await expect(group(page, 'peanut').getByRole('radio', { name: /^Avoid/ })).toBeChecked();
});

test('clearing every choice and saving clears the profile', async ({ page }) => {
  await control({ preferences: { allergies: ['egg'], avoid: ['soy', 'fish'] } });
  await openPage(page);
  await choose(page, 'egg', 'Not set');
  await choose(page, 'soy', 'Not set');
  await choose(page, 'fish', 'Not set');
  await page.getByRole('button', { name: 'Save my choices' }).click();
  await expect(page.getByTestId('preferences-saved')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('allergen-group')).toHaveCount(9);
  await expect(page.getByRole('radio', { name: /^Not set/, checked: true })).toHaveCount(9);
});

test('a failed save says so, is not the saved message, and keeps the choices on the screen', async ({ page }) => {
  await openPage(page);
  await page.route('**/api/graphql', (route) =>
    route.continue({ headers: { ...route.request().headers(), 'x-save-preferences': 'fail' } }),
  );
  await choose(page, 'sesame', 'Allergy');
  await page.getByRole('button', { name: 'Save my choices' }).click();

  await expect(page.getByTestId('preferences-error')).toContainText('Not saved');
  await expect(page.getByTestId('preferences-saved')).toHaveCount(0);
  await expect(group(page, 'sesame').getByRole('radio', { name: /^Allergy/ })).toBeChecked();

  // Nothing was stored; with the fault gone the same choices save.
  await page.unroute('**/api/graphql');
  await page.getByRole('button', { name: 'Save my choices' }).click();
  await expect(page.getByTestId('preferences-saved')).toBeVisible();
});

test('a refused save is reported as not saved and keeps the choices', async ({ page }) => {
  await openPage(page);
  await page.route('**/api/graphql', (route) =>
    route.continue({ headers: { ...route.request().headers(), 'x-save-preferences': 'rejected' } }),
  );
  await choose(page, 'gluten', 'Avoid');
  await page.getByRole('button', { name: 'Save my choices' }).click();

  await expect(page.getByTestId('preferences-rejected')).toContainText('Not saved');
  await expect(page.getByTestId('preferences-saved')).toHaveCount(0);
  await expect(group(page, 'gluten').getByRole('radio', { name: /^Avoid/ })).toBeChecked();
});

test('logging out drops the page, and the next visitor on the device sees no profile', async ({ page }) => {
  await control({ preferences: { allergies: ['tree-nut'], avoid: [] } });
  await openPage(page);
  await expect(group(page, 'tree-nut').getByRole('radio', { name: /^Allergy/ })).toBeChecked();

  await logOut(page);

  await expect(page.getByRole('heading', { level: 1, name: 'Fresh from local bakeries' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Tree nuts');
  await page.goto('/preferences');
  await expect(page.getByTestId('login-required')).toBeVisible();
  await expect(page.getByTestId('allergen-group')).toHaveCount(0);
});

test('a logged-out visitor is asked to log in, and the server HTML holds no profile data', async ({
  page,
  request,
}) => {
  await control({ preferences: { allergies: ['tree-nut'], avoid: ['dairy'] } });
  const html = await (await request.get('/preferences')).text();
  expect(html).not.toContain('Tree nuts');
  expect(html).not.toContain('tree-nut');
  expect(html).not.toContain('allergen-group');

  await page.goto('/preferences');
  await expect(page.getByTestId('login-required')).toBeVisible();
  await expect(page.getByTestId('allergen-group')).toHaveCount(0);
});

test('the page has no automatically detectable accessibility violations, and state is not by colour alone', async ({
  page,
}) => {
  await control({ preferences: { allergies: ['tree-nut'], avoid: ['dairy'] } });
  await openPage(page);
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);

  // Each allergen is a labelled group of three radios whose names carry the choice in words.
  const nuts = page.getByRole('group', { name: 'Tree nuts' });
  await expect(nuts.getByRole('radio')).toHaveCount(3);
  await expect(nuts.getByRole('radio', { name: /^Allergy/ })).toBeChecked();
});
