import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { logIn, MOCK, stubIssuer } from './helpers';

// WI-TAG-003: the home page narrowed by tags. Against the mock BFF (fixture A: the sourdough is vegan and a local favourite, the croissant is vegetarian and
// autumn, the latte has none). The filter is in the address (?tag=a&tag=b), rendered on the server, anonymous; the chips are links.

const names = (page: Page) => page.getByTestId('listing').getByRole('link');
const filter = (page: Page, label: string) =>
  page.getByTestId('tag-filter').getByRole('link', { name: new RegExp(`^${label}`) });

test('the filter chips are the tags the catalog shows today, never an allergen, as plain links', async ({ page }) => {
  await page.goto('/');

  const labels = await page.getByTestId('tag-filter-link').allInnerTexts();
  expect(labels).toEqual(['Vegan', 'Vegetarian', 'Autumn', 'Local favourite']);
  await expect(page.getByTestId('tag-filter')).not.toContainText('Milk');
  await expect(filter(page, 'Vegan')).toHaveAttribute('href', '/?tag=vegan');
  await expect(page.getByTestId('tag-filter-clear')).toHaveCount(0);
});

test('choosing a tag narrows the list and puts the tag in the address, and choosing it again takes it off', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('listing')).toHaveCount(3);

  await filter(page, 'Vegan').click();

  await expect(page).toHaveURL(/\/\?tag=vegan$/);
  await expect(page.getByTestId('listing')).toHaveCount(1);
  await expect(names(page)).toHaveText([/Country Sourdough/]);
  await expect(filter(page, 'Vegan')).toHaveAttribute('aria-current', 'true');
  await expect(filter(page, 'Vegan')).toContainText('selected');

  await filter(page, 'Vegan').click();
  await expect(page).toHaveURL(/localhost:3000\/$/);
  await expect(page.getByTestId('listing')).toHaveCount(3);
});

test('two tags narrow to the listings that carry both', async ({ page }) => {
  await page.goto('/?tag=vegan&tag=local-favourite');

  await expect(names(page)).toHaveText([/Country Sourdough/]);
  await expect(filter(page, 'Vegan')).toHaveAttribute('aria-current', 'true');
  await expect(filter(page, 'Local favourite')).toHaveAttribute('aria-current', 'true');
  await expect(filter(page, 'Autumn')).not.toHaveAttribute('aria-current', 'true');
});

test('a filter with no result says so and offers to clear it', async ({ page }) => {
  await page.goto('/?tag=vegan&tag=autumn');

  await expect(page.getByTestId('listing')).toHaveCount(0);
  await expect(page.getByTestId('no-match')).toContainText('No listings match these tags.');
  await page.getByTestId('no-match').getByRole('link', { name: 'Clear filters' }).click();
  await expect(page.getByTestId('listing')).toHaveCount(3);
});

test('the filtered page is rendered on the server', async ({ request }) => {
  const html = await (await request.get('/?tag=vegetarian')).text();

  expect(html).toContain('Almond Croissant');
  expect(html).not.toContain('Country Sourdough');
  expect(html).not.toContain('Oat Milk Latte');
});

test('an address that names a tag the catalog refuses (unknown, an allergen) goes back to the whole list, not to an error', async ({
  page,
}) => {
  for (const bad of ['bogus', 'dairy', 'staff-pick']) {
    await page.goto(`/?tag=${bad}`);
    await expect(page).toHaveURL(/localhost:3000\/$/);
    await expect(page.getByTestId('listing')).toHaveCount(3);
  }
});

test('an odd address is tidied: repeats and case are ignored, and things that are not ids send nothing', async ({
  page,
}) => {
  await page.goto('/?tag=VEGAN&tag=vegan&tag=%3Cscript%3E');

  await expect(names(page)).toHaveText([/Country Sourdough/]);
  await expect(filter(page, 'Vegan')).toHaveAttribute('aria-current', 'true');
});

test('a customer’s own conflicts still lie over a filtered list', async ({ page }) => {
  await fetch(`${MOCK}/__control`, {
    method: 'POST',
    body: JSON.stringify({ resetPreferences: true, preferences: { allergies: ['sesame'], avoid: [] } }),
  });
  await stubIssuer(page);
  await page.goto('/?tag=vegan');
  await logIn(page);

  await expect(page.getByTestId('listing')).toHaveCount(1);
  await expect(page.getByTestId('conflict')).toContainText('Seed crust contains sesame');
});

test('the filtered page has no automatically detectable accessibility violations', async ({ page }) => {
  await page.goto('/?tag=vegan');
  await expect(page.getByTestId('tag-filter')).toBeVisible();

  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
});
