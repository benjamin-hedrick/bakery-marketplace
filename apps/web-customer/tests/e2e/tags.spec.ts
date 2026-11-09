import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// WI-TAG-002: the tags of a listing and of its options, as small chips on the browse list and the detail page. Against the mock BFF (fixture A: the sourdough is
// vegan and a local favourite, its seed option is vegan, the croissant is vegetarian and autumn, the latte has none; fixture B has none at all). Which tags show
// is the catalog's decision; the page shows what it is given.

const row = (page: import('@playwright/test').Page, name: string) =>
  page.getByTestId('listing').filter({ hasText: name });

test('the browse list shows each listing’s tags as chips, and a listing without tags shows none', async ({ page }) => {
  await page.goto('/');

  await expect(row(page, 'Country Sourdough').getByTestId('tag')).toHaveText([
    'Vegan, marked by the bakery',
    'Local favourite',
  ]);
  await expect(row(page, 'Almond Croissant').getByTestId('tag')).toHaveText([
    'Vegetarian, marked by the bakery',
    'Autumn',
  ]);
  await expect(row(page, 'Oat Milk Latte').getByTestId('tag')).toHaveCount(0);
  await expect(row(page, 'Oat Milk Latte').getByTestId('tags')).toHaveCount(0); // no empty list either
});

test('a diet tag is read as the bakery’s claim, and a tag is never styled or worded like an allergen warning', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.getByTestId('tag').filter({ hasText: 'Vegan, marked by the bakery' })).toHaveCount(1); // the sourdough only
  const chip = row(page, 'Country Sourdough').getByTestId('tag').first();
  await expect(chip).toHaveCSS('font-weight', '400');
  await expect(row(page, 'Country Sourdough').getByTestId('tags')).not.toContainText('⚠');
  await expect(page.getByTestId('tag').locator('[aria-hidden="true"]')).toHaveCount(0); // no warning icon
  await expect(page.getByTestId('conflict')).toHaveCount(0);
  // The allergen flags are still their own text, not a tag.
  await expect(row(page, 'Almond Croissant')).toContainText(
    'contains gluten (wheat, rye, barley), milk (dairy), tree nuts',
  );
});

test('the detail page says on screen that a diet tag is the bakery’s claim, and shows an option’s tags beside it', async ({
  page,
}) => {
  await page.goto('/');
  await row(page, 'Country Sourdough').getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Country Sourdough' })).toBeVisible();

  await expect(page.getByTestId('tags').first()).toContainText('Vegan (marked by the bakery)');
  await expect(page.getByTestId('tags').first()).toContainText('Local favourite');
  const seeds = page.locator('label').filter({ hasText: 'Seed crust' });
  await expect(seeds.getByTestId('tag')).toHaveCount(1);
  await expect(seeds.getByTestId('tag')).toContainText('Vegan');
  await expect(page.locator('label').filter({ hasText: 'Sliced' }).getByTestId('tag')).toHaveCount(0);
});

test('the tags are in the server-rendered HTML of the public pages', async ({ request }) => {
  const html = await (await request.get('/')).text();

  expect(html).toContain('Local favourite');
  expect(html).toContain('Autumn');
});

test('a catalog without tags (fixture B) shows no chips and nothing leaks from fixture A', async ({ browser }) => {
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-fixture': 'B' } });
  const page = await context.newPage();
  await page.goto('/');

  await expect(row(page, 'Dark Rye Loaf')).toBeVisible();
  await expect(page.getByTestId('tag')).toHaveCount(0);
  await expect(page.getByTestId('listing').filter({ hasText: 'Local favourite' })).toHaveCount(0); // the filter chips list the registry, which is not fixture A's
  await context.close();
});

test('the list and the detail page with tags have no automatically detectable accessibility violations', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('tag').first()).toBeVisible();
  const list = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(list.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);

  await row(page, 'Country Sourdough').getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Country Sourdough' })).toBeVisible();
  const detail = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(detail.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
});
