import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { logIn, stubIssuer } from './helpers';

// WI-QA-001 (row G-E08): an accessibility smoke on each kind of page the customer sees. axe-core checks the rules it can decide
// automatically (WCAG 2.0 and 2.1, levels A and AA): names and labels, contrast, landmarks, headings, language, duplicate ids. It is a
// smoke test: a clean run does not mean the pages are accessible (keyboard use, focus order and screen-reader wording need a person).

test.use({ timezoneId: 'America/New_York', locale: 'en-US' });

async function scan(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  // The message names the rule and the first elements, so a failure says what to fix.
  expect(
    violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} element(s), e.g. ${v.nodes[0]?.target.join(' ')}`),
  ).toEqual([]);
}

test('the listings page has no automatically detectable accessibility violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('listing').first()).toBeVisible();
  await scan(page);
});

test('a listing page, with its options and quantity, has none', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('listing').filter({ hasText: 'Country Sourdough' }).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Country Sourdough' })).toBeVisible();
  await scan(page);
});

test('the checkout page, logged in, has none', async ({ page }) => {
  await stubIssuer(page);
  await page.goto('/');
  await page.getByTestId('listing').filter({ hasText: 'Country Sourdough' }).getByRole('link').click();
  await page.getByRole('button', { name: 'Add to order' }).click();
  await expect(page.getByTestId('add-notice')).toBeVisible();
  await logIn(page);
  await page.getByTestId('cart-link').click();
  await expect(page.getByRole('form', { name: 'Place your order' })).toBeVisible();
  await expect(page.getByLabel('Pickup time')).toBeEnabled();
  await scan(page);
});

test('the order page has none', async ({ page }) => {
  await stubIssuer(page);
  await page.goto('/');
  await page.getByTestId('listing').filter({ hasText: 'Country Sourdough' }).getByRole('link').click();
  await page.getByRole('button', { name: 'Add to order' }).click();
  await expect(page.getByTestId('add-notice')).toBeVisible();
  await logIn(page);
  await page.getByTestId('cart-link').click();
  await page.getByRole('button', { name: 'Place test order' }).click();
  await expect(page.getByTestId('order-status')).toBeVisible();
  await scan(page);
});

test('the listings page in the dark theme has none (colour contrast is checked against the dark palette)', async ({
  browser,
}) => {
  const context = await browser.newContext({ colorScheme: 'dark' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByTestId('listing').first()).toBeVisible();
  await scan(page);
  await context.close();
});
