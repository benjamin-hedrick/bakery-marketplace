import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page, Request } from '@playwright/test';
import { logIn, MOCK, stubIssuer } from './helpers';

// WI-CUST-008: allergens in the cart and at checkout. Against the mock BFF (fixture A): the almond croissant carries gluten, dairy and tree nuts on the item and
// tree nuts in "Extra almond"; the sourdough carries gluten and has sesame only in "Seed crust"; the latte carries nothing.

const control = (body: object) =>
  fetch(`${MOCK}/__control`, { method: 'POST', body: JSON.stringify(body) }).then((r) => {
    if (!r.ok) throw new Error('the mock BFF did not take the state');
  });
const reads = async () =>
  ((await (await fetch(`${MOCK}/__reads`)).json()) as { preferenceReads: number }).preferenceReads;

const isPlaceOrder = (r: Request) => r.url().includes('/api/graphql') && (r.postData() ?? '').includes('placeOrder');
const inputOf = (r: Request) => JSON.parse(r.postData()!).variables.input as Record<string, unknown>;

async function addToOrder(page: Page, name: string, option?: string) {
  await page.goto('/');
  await page.getByTestId('listing').filter({ hasText: name }).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  if (option) await page.getByLabel(new RegExp(option)).check();
  await page.getByRole('button', { name: 'Add to order' }).click();
  await expect(page.getByTestId('add-notice')).toBeVisible();
}

/** Puts the item in the cart, logs in and opens the checkout. */
async function openCheckout(page: Page, name = 'Almond Croissant', option?: string) {
  await addToOrder(page, name, option);
  await logIn(page);
  await page.getByTestId('cart-link').click();
  await expect(page.getByRole('form', { name: 'Place your order' })).toBeVisible();
}

const place = (page: Page) => page.getByRole('button', { name: 'Place test order' });

test.beforeEach(async ({ page }) => {
  await control({ resetPreferences: true, resetOrders: true });
  await stubIssuer(page);
});

test('every line says what it contains, from the bakery’s own flags, with the registry’s labels', async ({ page }) => {
  await openCheckout(page, 'Almond Croissant', 'Extra almond');

  await expect(page.getByTestId('line-allergens')).toHaveText(
    'Contains gluten (wheat, rye, barley), milk (dairy), tree nuts. Extra almond contains tree nuts',
  );
  // No profile: no allergy section, nothing to acknowledge, and no personalized request was made.
  await expect(page.getByTestId('allergy-section')).toHaveCount(0);
  await expect(place(page)).toBeEnabled();
  expect(await reads()).toBe(0);
});

test('a line with nothing flagged says so plainly and never that it is safe', async ({ page }) => {
  await openCheckout(page, 'Oat Milk Latte');

  await expect(page.getByTestId('line-allergens')).toHaveText('No allergens flagged by the bakery');
  await expect(page.locator('form')).not.toContainText(/\b(is safe|are safe|allergen-free|free of)\b/i);
});

test('an option is named only when it is chosen', async ({ page }) => {
  await openCheckout(page, 'Country Sourdough');
  await expect(page.getByTestId('line-allergens')).toHaveText('Contains gluten (wheat, rye, barley)');
});

test('with a profile, each conflict is named with its line and severity, and a serious one asks to be acknowledged before the button works', async ({
  page,
}) => {
  await control({ preferences: { allergies: ['tree-nut'], avoid: ['dairy'] } });
  await openCheckout(page, 'Almond Croissant', 'Extra almond');

  const conflicts = page.getByTestId('conflict');
  await expect(conflicts).toHaveCount(3);
  await expect(conflicts.nth(0)).toHaveAttribute('data-severity', 'ALLERGY'); // the serious ones first
  await expect(page.getByTestId('conflicts')).toContainText(
    'Almond Croissant contains tree nuts, which you listed as an allergy',
  );
  await expect(page.getByTestId('conflicts')).toContainText(
    'Almond Croissant: Extra almond contains tree nuts, which you listed as an allergy',
  );
  await expect(page.getByTestId('conflicts')).toContainText('Almond Croissant contains milk (dairy), which you avoid');
  await expect(page.getByTestId('personal-reminder')).toContainText('not guaranteed free of your allergens');

  // Blocked until the customer deliberately confirms; confirming changes nothing else.
  await expect(place(page)).toBeDisabled();
  await expect(page.getByTestId('ack-needed')).toBeVisible();
  const ack = page.getByRole('checkbox', { name: 'I have read this and still want to order' });
  await ack.check();
  await expect(place(page)).toBeEnabled();
  await ack.uncheck();
  await expect(place(page)).toBeDisabled();
});

test('the order is placed once the serious conflict is acknowledged, and not before', async ({ page }) => {
  await control({ preferences: { allergies: ['tree-nut'], avoid: [] } });
  const sent: Request[] = [];
  page.on('request', (r) => isPlaceOrder(r) && sent.push(r));
  await openCheckout(page);
  // Wait for the check to have answered: the button is also off while it is still loading, which would pass this for the wrong reason.
  await expect(page.getByTestId('conflict')).toHaveCount(1);

  await expect(place(page)).toBeDisabled();
  await expect(page.getByTestId('ack-needed')).toBeVisible();
  expect(sent).toHaveLength(0);

  await page.getByRole('checkbox', { name: 'I have read this and still want to order' }).check();
  await place(page).click();
  await expect(page).toHaveURL(/\/orders\/.+/);
  expect(sent).toHaveLength(1);
});

test('an avoid alone is a note: no acknowledgement and the button works', async ({ page }) => {
  await control({ preferences: { allergies: [], avoid: ['dairy'] } });
  await openCheckout(page);

  await expect(page.getByTestId('conflict')).toHaveCount(1);
  await expect(page.getByTestId('conflict')).toHaveAttribute('data-severity', 'AVOID');
  await expect(page.getByRole('checkbox', { name: 'I have read this and still want to order' })).toHaveCount(0);
  await expect(place(page)).toBeEnabled();
  // Nothing to tell the bakery: the avoid list is never sent.
  await expect(page.getByTestId('tell-bakery')).toHaveCount(0);
});

test('a cart without a conflict has no acknowledgement even for a customer with an allergy', async ({ page }) => {
  await control({ preferences: { allergies: ['tree-nut'], avoid: [] } });
  await openCheckout(page, 'Oat Milk Latte');

  await expect(page.getByTestId('conflict')).toHaveCount(0);
  await expect(page.getByTestId('personal-reminder')).toBeVisible();
  await expect(place(page)).toBeEnabled();
});

test('when the check cannot be made the form says so, does not call it "no conflicts", and still lets the customer order', async ({
  page,
}) => {
  await control({ preferences: { allergies: ['tree-nut'], avoid: [] } });
  await page.route('**/api/graphql', (route) =>
    route.continue({ headers: { ...route.request().headers(), 'x-cart-check': 'fail' } }),
  );
  await openCheckout(page);

  await expect(page.getByTestId('check-failed')).toContainText('We could not check this order against your allergies');
  await expect(page.getByTestId('conflict')).toHaveCount(0);
  await expect(page.getByTestId('personal-reminder')).toHaveCount(0); // no reassuring text either
  await expect(place(page)).toBeEnabled();
  await place(page).click();
  await expect(page).toHaveURL(/\/orders\/.+/);
});

test('the customer’s allergies are offered to the bakery by default, any can be unticked, and exactly the rest is sent with the order', async ({
  page,
}) => {
  await control({ preferences: { allergies: ['tree-nut', 'sesame'], avoid: ['dairy'] } });
  const sent: Request[] = [];
  page.on('request', (r) => isPlaceOrder(r) && sent.push(r));
  await openCheckout(page, 'Oat Milk Latte'); // no conflict, so nothing to acknowledge

  const tell = page.getByTestId('tell-bakery');
  await expect(tell).toContainText('The bakery will see these allergies with your order.');
  await expect(tell.getByRole('checkbox', { name: 'Tree nuts' })).toBeChecked();
  await expect(tell.getByRole('checkbox', { name: 'Sesame' })).toBeChecked();
  await expect(tell.getByRole('checkbox')).toHaveCount(2); // the avoid list is not offered

  await tell.getByRole('checkbox', { name: 'Sesame' }).uncheck(); // ordering for someone else, say
  await place(page).click();
  await expect(page).toHaveURL(/\/orders\/.+/);

  expect(inputOf(sent[0]!).allergens).toEqual(['tree-nut']);
  expect(JSON.stringify(inputOf(sent[0]!))).not.toContain('dairy');
});

test('with every allergy unticked, or no allergy in the profile, no allergens are sent at all', async ({ page }) => {
  await control({ preferences: { allergies: ['tree-nut'], avoid: ['dairy'] } });
  const sent: Request[] = [];
  page.on('request', (r) => isPlaceOrder(r) && sent.push(r));
  await openCheckout(page, 'Oat Milk Latte');

  await page.getByTestId('tell-bakery').getByRole('checkbox', { name: 'Tree nuts' }).uncheck();
  await place(page).click();
  await expect(page).toHaveURL(/\/orders\/.+/);
  expect('allergens' in inputOf(sent[0]!)).toBe(false);
});

test('a customer with no profile sends no allergens and sees no control for them', async ({ page }) => {
  const sent: Request[] = [];
  page.on('request', (r) => isPlaceOrder(r) && sent.push(r));
  await openCheckout(page, 'Oat Milk Latte');

  await expect(page.getByTestId('tell-bakery')).toHaveCount(0);
  await place(page).click();
  await expect(page).toHaveURL(/\/orders\/.+/);
  expect('allergens' in inputOf(sent[0]!)).toBe(false);
});

test('changing what is told to the bakery after a refused attempt uses a new idempotency key', async ({ page }) => {
  await control({ preferences: { allergies: ['tree-nut', 'sesame'], avoid: [] } });
  const sent: Request[] = [];
  page.on('request', (r) => isPlaceOrder(r) && sent.push(r));
  await page.route('**/api/graphql', (route) => {
    const isOrder = (route.request().postData() ?? '').includes('placeOrder');
    return route.continue({
      headers: { ...route.request().headers(), ...(isOrder ? { 'x-place-order': 'internal' } : {}) },
    });
  });
  await openCheckout(page, 'Oat Milk Latte');

  await place(page).click(); // an unexpected error: the key is kept for a retry of the same order
  await expect(page.getByTestId('checkout-error')).toBeVisible();
  await place(page).click();
  await expect(page.getByTestId('checkout-error')).toBeVisible();
  expect(inputOf(sent[1]!).idempotencyKey).toBe(inputOf(sent[0]!).idempotencyKey);

  await page.getByTestId('tell-bakery').getByRole('checkbox', { name: 'Sesame' }).uncheck();
  await place(page).click();
  await expect(page.getByTestId('checkout-error')).toBeVisible();
  expect(inputOf(sent[2]!).idempotencyKey).not.toBe(inputOf(sent[0]!).idempotencyKey); // different content, different key
});

test('the checkout with conflicts has no automatically detectable accessibility violations', async ({ page }) => {
  await control({ preferences: { allergies: ['tree-nut'], avoid: ['dairy'] } });
  await openCheckout(page, 'Almond Croissant', 'Extra almond');
  await expect(page.getByTestId('conflict')).toHaveCount(3);

  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
});
