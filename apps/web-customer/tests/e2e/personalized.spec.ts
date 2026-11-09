import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { logIn, MOCK, stubIssuer } from './helpers';

// WI-CUST-006: the customer's own conflicts laid over the public pages after login. Against the mock BFF (fixture A): the almond croissant carries
// gluten, dairy and tree nuts on the item and tree nuts in "Extra almond"; the sourdough carries gluten and has sesame only in "Seed crust"; the
// latte carries nothing.

const control = (body: object) =>
  fetch(`${MOCK}/__control`, { method: 'POST', body: JSON.stringify(body) }).then((r) => {
    if (!r.ok) throw new Error('the mock BFF did not take the state');
  });
const personalizedReads = async () =>
  ((await (await fetch(`${MOCK}/__reads`)).json()) as { preferenceReads: number }).preferenceReads;

const row = (page: Page, name: string) => page.getByTestId('listing').filter({ hasText: name });

// The mock keeps the customer's profile in memory: leave it empty, so a later spec (or a second run against the same mock) does not start with this one's.
test.afterEach(() => control({ resetPreferences: true, resetOrders: true }));

test.beforeEach(async ({ page }) => {
  await control({ resetPreferences: true, resetOrders: true });
  await stubIssuer(page);
});

test('a logged-out customer sees today’s page and the browser makes no personalized request', async ({ page }) => {
  await control({ preferences: { allergies: ['tree-nut'], avoid: [] } });
  await page.goto('/');
  await expect(page.getByTestId('listing')).toHaveCount(3);
  await page.waitForTimeout(500);

  await expect(page.getByTestId('conflict')).toHaveCount(0);
  await expect(page.getByTestId('personal-panel')).toHaveCount(0);
  expect(await personalizedReads()).toBe(0);
});

test('a customer with an empty profile sees no change and no personalized list is asked for', async ({ page }) => {
  await page.goto('/');
  await logIn(page);
  await page.waitForTimeout(500);

  await expect(page.getByTestId('listing')).toHaveCount(3);
  await expect(page.getByTestId('conflict')).toHaveCount(0);
  await expect(page.getByTestId('personal-panel')).toHaveCount(0);
  expect(await personalizedReads()).toBe(0);
});

test('an allergy is marked unmistakably, an avoid more quietly, and an option-only conflict names the option', async ({
  page,
}) => {
  await control({ preferences: { allergies: ['tree-nut', 'sesame'], avoid: ['dairy'] } });
  await page.goto('/');
  await logIn(page);

  const croissant = row(page, 'Almond Croissant');
  await expect(croissant.locator('[data-severity="ALLERGY"]').first()).toContainText(
    'Allergy warning: Contains tree nuts, which you listed as an allergy',
  );
  await expect(croissant.locator('[data-severity="AVOID"]')).toContainText(
    'You avoid this: Contains milk (dairy), which you avoid',
  );
  // The serious mark comes first.
  await expect(croissant.getByTestId('conflict').first()).toHaveAttribute('data-severity', 'ALLERGY');
  // The option that brings in tree nuts is reported separately from the item, as the real catalog does: three marks in all.
  await expect(croissant.getByTestId('conflict')).toHaveCount(3);
  await expect(croissant).toContainText('Extra almond contains tree nuts');

  const sourdough = row(page, 'Country Sourdough');
  await expect(sourdough.getByTestId('conflict')).toHaveCount(1);
  await expect(sourdough.getByTestId('conflict')).toContainText(
    'Seed crust contains sesame, which you listed as an allergy',
  );

  await expect(row(page, 'Oat Milk Latte').getByTestId('conflict')).toHaveCount(0);
});

test('the marks use words and an icon, are part of the link’s accessible name, and the page never says an item is safe', async ({
  page,
}) => {
  await control({ preferences: { allergies: ['tree-nut'], avoid: [] } });
  await page.goto('/');
  await logIn(page);
  await expect(page.getByTestId('conflict')).toHaveCount(2);

  await expect(
    page.getByRole('link', {
      name: /Almond Croissant.*Allergy warning.*Contains tree nuts, which you listed as an allergy/,
    }),
  ).toBeVisible();
  await expect(
    row(page, 'Almond Croissant').getByTestId('conflict').first().locator('[aria-hidden="true"]'),
  ).toHaveText('⚠');

  const reminder = page.getByTestId('personal-reminder');
  await expect(reminder).toContainText('not guaranteed free of your allergens');
  await expect(page.locator('main')).not.toContainText(
    /\b(is safe|are safe|safe for you|allergen-free|matches your)\b/i,
  );
});

test('the hide switch is off by default, hides only items that list the allergen, says how many, and is instant', async ({
  page,
}) => {
  await control({ preferences: { allergies: ['tree-nut', 'sesame'], avoid: [] } });
  await page.goto('/');
  await logIn(page);
  const hide = page.getByRole('checkbox', { name: /Hide items/ });
  await expect(hide).not.toBeChecked();
  await expect(page.getByTestId('listing')).toHaveCount(3);
  const readsBefore = await personalizedReads();

  await hide.check();

  // The croissant lists tree nuts on the item and goes; the sourdough has sesame only in an option and stays, with its mark.
  await expect(page.getByTestId('listing')).toHaveCount(2);
  await expect(row(page, 'Almond Croissant')).toHaveCount(0);
  await expect(row(page, 'Country Sourdough').getByTestId('conflict')).toHaveCount(1);
  await expect(page.getByTestId('hidden-count')).toHaveText('1 item hidden.');
  expect(await personalizedReads()).toBe(readsBefore); // no new request: switching is done on the page

  await hide.uncheck();
  await expect(page.getByTestId('listing')).toHaveCount(3);
  await expect(page.getByTestId('hidden-count')).toHaveText('');
});

test('the “hidden” message takes no room and shows no colour until something is hidden (register 149)', async ({
  page,
}) => {
  await control({ preferences: { allergies: ['tree-nut'], avoid: [] } });
  await page.goto('/');
  await logIn(page);
  const hide = page.getByRole('checkbox', { name: /Hide items/ });
  await expect(hide).toBeVisible();
  const count = page.getByTestId('hidden-count');

  // It is in the page from the start (a screen reader hears it when it fills) but empty, and drawn as nothing: no height, no background.
  await expect(count).toHaveCount(1);
  await expect(count).toHaveText('');
  expect((await count.boundingBox())?.height ?? 0).toBeLessThan(1);
  await expect(count).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  // With something to say it is a message again.
  await hide.check();
  await expect(count).toHaveText('1 item hidden.');
  expect((await count.boundingBox())?.height ?? 0).toBeGreaterThan(10);
  await expect(count).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});

test('the detail page shows the item’s and each option’s conflicts', async ({ page }) => {
  await control({ preferences: { allergies: ['tree-nut'], avoid: ['dairy'] } });
  await page.goto('/');
  await logIn(page);
  await page.getByTestId('listing').filter({ hasText: 'Almond Croissant' }).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Almond Croissant' })).toBeVisible();

  const detail = page.getByTestId('personal-detail');
  await expect(detail.locator('[data-severity="ALLERGY"]')).toContainText(
    'Contains tree nuts, which you listed as an allergy',
  );
  await expect(detail.locator('[data-severity="AVOID"]')).toContainText('Contains milk (dairy), which you avoid');
  await expect(detail.getByTestId('personal-reminder')).toContainText('not guaranteed free of your allergens');

  const option = page.getByText('Extra almond', { exact: false }).locator('xpath=ancestor::label');
  await expect(option.getByTestId('conflict')).toContainText(
    'Extra almond contains tree nuts, which you listed as an allergy',
  );
});

test('a sourdough option-only conflict shows on its option row and not on the item', async ({ page }) => {
  await control({ preferences: { allergies: ['sesame'], avoid: [] } });
  await page.goto('/');
  await logIn(page);
  await page.getByTestId('listing').filter({ hasText: 'Country Sourdough' }).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Country Sourdough' })).toBeVisible();

  await expect(page.getByTestId('personal-detail').getByTestId('conflict')).toHaveCount(0);
  const seeds = page.getByText('Seed crust').locator('xpath=ancestor::label');
  await expect(seeds.getByTestId('conflict')).toContainText('Seed crust contains sesame');
  await expect(page.getByText('Sliced').locator('xpath=ancestor::label').getByTestId('conflict')).toHaveCount(0);
});

test('the server HTML of the public pages is unchanged by a profile', async ({ page, request }) => {
  await control({ preferences: { allergies: ['tree-nut'], avoid: ['dairy'] } });
  await page.goto('/');
  await logIn(page);
  await expect(page.getByTestId('conflict')).toHaveCount(3);

  const html = await (await request.get('/')).text();
  expect(html).toContain('Almond Croissant');
  expect(html).not.toContain('listed as an allergy');
  expect(html).not.toContain('personal-panel');
});

test('a failing personalized request leaves the public page as it was', async ({ page }) => {
  await control({ preferences: { allergies: ['tree-nut'], avoid: [] } });
  await page.route('**/api/graphql', (route) => {
    if ((route.request().postData() ?? '').includes('personalizedListings')) return route.abort();
    return route.continue();
  });
  await page.goto('/');
  await logIn(page);
  await page.waitForTimeout(500);

  await expect(page.getByTestId('listing')).toHaveCount(3);
  await expect(page.getByTestId('conflict')).toHaveCount(0);
});

test('the marked list has no automatically detectable accessibility violations', async ({ page }) => {
  await control({ preferences: { allergies: ['tree-nut', 'sesame'], avoid: ['dairy'] } });
  await page.goto('/');
  await logIn(page);
  await expect(page.getByTestId('conflict')).toHaveCount(4);
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
});
