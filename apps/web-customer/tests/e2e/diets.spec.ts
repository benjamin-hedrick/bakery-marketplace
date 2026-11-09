import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page, Request } from '@playwright/test';
import { logIn, MOCK, stubIssuer } from './helpers';

// WI-TAG-004: the diets a customer prefers. A diet is the bakery's claim, so the page shows what the bakery has marked, quietly and in words, and never says an item is
// suitable or not. Against the mock BFF (fixture A): the sourdough is vegan and its seed option is too, but "Sliced" carries no diet tag, so choosing it removes the claim;
// the croissant is vegetarian; the latte has no diet tag.

const control = (body: object) =>
  fetch(`${MOCK}/__control`, { method: 'POST', body: JSON.stringify(body) }).then((r) => {
    if (!r.ok) throw new Error('the mock BFF did not take the state');
  });

const row = (page: Page, name: string) => page.getByTestId('listing').filter({ hasText: name });
const isPlaceOrder = (r: Request) => r.url().includes('/api/graphql') && (r.postData() ?? '').includes('placeOrder');

// The mock keeps the customer's profile in memory: leave it empty, so a later spec (or a second run against the same mock) does not start with this one's.
test.afterEach(() => control({ resetPreferences: true, resetOrders: true }));

test.beforeEach(async ({ page }) => {
  await control({ resetPreferences: true, resetOrders: true });
  await stubIssuer(page);
});

test('the profile page offers the diets from the registry, says they are the bakery’s claims, and saves the choice', async ({
  page,
}) => {
  await page.goto('/');
  await logIn(page);
  await page.getByTestId('preferences-link').click();
  await expect(page.getByTestId('allergen-group')).toHaveCount(9);

  const diets = page.getByTestId('diet-group');
  await expect(diets.getByRole('checkbox')).toHaveCount(2);
  await expect(diets.getByRole('checkbox', { name: 'Vegan' })).not.toBeChecked();
  await expect(page.getByTestId('diet-note')).toContainText("the bakery's own claims");

  await diets.getByRole('checkbox', { name: 'Vegan' }).check();
  await page.getByRole('button', { name: 'Save my choices' }).click();
  await expect(page.getByTestId('preferences-saved')).toBeVisible();

  await page.reload();
  await expect(diets.getByRole('checkbox', { name: 'Vegan' })).toBeChecked();
  await expect(diets.getByRole('checkbox', { name: 'Vegetarian' })).not.toBeChecked();

  await diets.getByRole('checkbox', { name: 'Vegan' }).uncheck();
  await page.getByRole('button', { name: 'Save my choices' }).click();
  await expect(page.getByTestId('preferences-saved')).toBeVisible();
  await page.reload();
  await expect(diets.getByRole('checkbox', { name: 'Vegan' })).not.toBeChecked();
});

test('saving allergens does not touch the diets, and the reverse', async ({ page }) => {
  await control({ preferences: { allergies: [], avoid: [], prefer: ['vegetarian'] } });
  await page.goto('/preferences');
  await logIn(page);

  await page
    .locator('[data-allergen="tree-nut"]')
    .getByRole('radio', { name: /^Allergy/ })
    .check();
  await page.getByRole('button', { name: 'Save my choices' }).click();
  await expect(page.getByTestId('preferences-saved')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('diet-group').getByRole('checkbox', { name: 'Vegetarian' })).toBeChecked();
  await expect(page.locator('[data-allergen="tree-nut"]').getByRole('radio', { name: /^Allergy/ })).toBeChecked();
});

test('a customer who prefers a diet sees the bakery’s claim, or that the bakery has not made one, on each listing, in quiet words', async ({
  page,
}) => {
  await control({ preferences: { allergies: [], avoid: [], prefer: ['vegan'] } });
  await page.goto('/');
  await logIn(page);

  await expect(row(page, 'Country Sourdough').getByTestId('diet-note')).toHaveText('Vegan, marked by the bakery.');
  await expect(row(page, 'Almond Croissant').getByTestId('diet-note')).toHaveText('Not marked vegan by the bakery.');
  await expect(row(page, 'Oat Milk Latte').getByTestId('diet-note')).toHaveText('Not marked vegan by the bakery.');
  // Nothing like an allergen warning, and nothing that says an item is or is not suitable.
  await expect(page.getByTestId('conflict')).toHaveCount(0);
  await expect(row(page, 'Almond Croissant').getByTestId('diet-note')).toHaveCSS('font-weight', '400');
  await expect(
    page.getByTestId('diet-note').filter({ hasText: /\b(is not vegan|isn’t vegan|suitable|safe)\b/i }),
  ).toHaveCount(0);
  await expect(page.getByTestId('listing')).toHaveCount(3); // a preference hides nothing by itself
});

test('the switch that shows only what the bakery has marked is off by default, hides nothing else, counts, and is instant', async ({
  page,
}) => {
  await control({ preferences: { allergies: [], avoid: [], prefer: ['vegan'] } });
  await page.goto('/');
  await logIn(page);
  const only = page.getByRole('checkbox', { name: /Show only items the bakery has marked for my diets/ });
  await expect(only).not.toBeChecked();
  await expect(page.getByTestId('listing')).toHaveCount(3);

  await only.check();

  await expect(page.getByTestId('listing')).toHaveCount(1);
  await expect(row(page, 'Country Sourdough')).toBeVisible();
  await expect(page.getByTestId('hidden-count')).toHaveText('2 items hidden.');

  await only.uncheck();
  await expect(page.getByTestId('listing')).toHaveCount(3);
});

test('a customer with no preferred diet sees no diet notes and no such switch', async ({ page }) => {
  await control({ preferences: { allergies: ['sesame'], avoid: [] } });
  await page.goto('/');
  await logIn(page);
  await expect(page.getByTestId('conflict')).toHaveCount(1);

  await expect(page.getByTestId('diet-note')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /marked for my diets/ })).toHaveCount(0);
});

test('on the detail page an option that would remove the bakery’s claim is named, and an option that carries the tag is not', async ({
  page,
}) => {
  await control({ preferences: { allergies: [], avoid: [], prefer: ['vegan'] } });
  await page.goto('/');
  await logIn(page);
  await row(page, 'Country Sourdough').getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Country Sourdough' })).toBeVisible();

  const note = page.getByTestId('diet-notes');
  await expect(note).toContainText('Vegan, marked by the bakery.');
  await expect(page.getByTestId('diet-option-note')).toHaveCount(1);
  await expect(page.getByTestId('diet-option-note')).toContainText(
    "Sliced is not marked vegan, so adding it removes the bakery's vegan claim",
  );
  await expect(note).not.toContainText('Seed crust');
});

test('in the cart each line is held to the rule with the options actually chosen, quietly, and nothing blocks', async ({
  page,
}) => {
  await control({ preferences: { allergies: [], avoid: [], prefer: ['vegan'] } });
  await page.goto('/');
  await row(page, 'Country Sourdough').getByRole('link').click();
  await page.getByRole('checkbox', { name: /Sliced/ }).check();
  await page.getByRole('button', { name: 'Add to order' }).click();
  await expect(page.getByTestId('add-notice')).toBeVisible();
  await page.goto('/');
  await row(page, 'Country Sourdough').getByRole('link').click();
  await page.getByRole('checkbox', { name: /Seed crust/ }).check();
  await page.getByRole('button', { name: 'Add to order' }).click();
  await expect(page.getByTestId('add-notice')).toBeVisible();
  await logIn(page);
  await page.getByTestId('cart-link').click();
  await expect(page.getByRole('form', { name: 'Place your order' })).toBeVisible();

  const notes = page.getByTestId('diet-note');
  await expect(notes).toHaveCount(1); // the seed-crust line carries the tag all the way and has nothing to say
  await expect(notes).toHaveText('Country Sourdough with Sliced is not marked vegan by the bakery.');
  await expect(page.getByTestId('conflict')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Place test order' })).toBeEnabled(); // advice only
});

test('a line whose item the bakery has not marked says so in the cart', async ({ page }) => {
  await control({ preferences: { allergies: [], avoid: [], prefer: ['vegan'] } });
  await page.goto('/');
  await row(page, 'Oat Milk Latte').getByRole('link').click();
  await page.getByRole('button', { name: 'Add to order' }).click();
  await expect(page.getByTestId('add-notice')).toBeVisible();
  await logIn(page);
  await page.getByTestId('cart-link').click();

  await expect(page.getByTestId('diet-note')).toHaveText('Oat Milk Latte is not marked vegan by the bakery.');
});

test('the preferred diets are never sent to the bakery with an order, only the allergies the customer leaves ticked', async ({
  page,
}) => {
  await control({ preferences: { allergies: ['tree-nut'], avoid: [], prefer: ['vegan'] } });
  const sent: Request[] = [];
  page.on('request', (r) => isPlaceOrder(r) && sent.push(r));
  await page.goto('/');
  await row(page, 'Oat Milk Latte').getByRole('link').click();
  await page.getByRole('button', { name: 'Add to order' }).click();
  await expect(page.getByTestId('add-notice')).toBeVisible();
  await logIn(page);
  await page.getByTestId('cart-link').click();
  await expect(page.getByTestId('tell-bakery')).toBeVisible();

  await page.getByRole('button', { name: 'Place test order' }).click();
  await expect(page).toHaveURL(/\/orders\/.+/);

  const input = JSON.parse(sent[0]!.postData()!).variables.input as { allergens?: string[] };
  expect(input.allergens).toEqual(['tree-nut']);
  expect(JSON.stringify(input)).not.toContain('vegan');
});

test('the marked list and the profile page have no automatically detectable accessibility violations', async ({
  page,
}) => {
  await control({ preferences: { allergies: [], avoid: [], prefer: ['vegan'] } });
  await page.goto('/');
  await logIn(page);
  await expect(page.getByTestId('diet-note').first()).toBeVisible();
  const list = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(list.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);

  await page.getByTestId('preferences-link').click();
  await expect(page.getByTestId('diet-group')).toBeVisible();
  const profile = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(profile.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
});
