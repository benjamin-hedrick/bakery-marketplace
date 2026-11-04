import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { logInAsVendor, order, pushChange, resetAll, setMock, tagReads } from './helpers';

// WI-QUE-005: an order's allergens on the vendor's card. Against the mock BFF, which serves the list, the live stream and the public allergen
// registry. The card shows them as text with an icon, in the accessible name; an order without allergens shows nothing extra.

test.beforeEach(async () => {
  await resetAll();
});

const card = (page: import('@playwright/test').Page, reference: string) =>
  page.getByTestId('queue-order').filter({ has: page.getByText(reference, { exact: true }) });

test('an order with allergens shows them on its card with the registry’s labels, and one without shows nothing extra', async ({
  page,
}) => {
  await setMock({
    orders: [
      order({ id: 'o1', reference: 'AAA111', status: 'PLACED', allergens: ['tree-nut', 'sesame'] }),
      order({ id: 'o2', reference: 'BBB222', status: 'PLACED' }),
    ],
  });
  await logInAsVendor(page);
  await expect(page.getByTestId('queue-order')).toHaveCount(2);

  await expect(card(page, 'AAA111').getByTestId('allergens')).toHaveText('⚠ Allergy: tree nuts, sesame');
  await expect(card(page, 'BBB222').getByTestId('allergens')).toHaveCount(0);
  await expect(card(page, 'BBB222')).not.toContainText(/allerg/i); // the card never says "no allergies"
});

test('the allergens are part of the card’s accessible name, and the icon is not read out', async ({ page }) => {
  await setMock({ orders: [order({ id: 'o1', reference: 'AAA111', status: 'PLACED', allergens: ['peanut'] })] });
  await logInAsVendor(page);

  await expect(page.getByRole('listitem', { name: 'Order AAA111. Allergy: peanuts' })).toBeVisible();
  await expect(page.getByTestId('allergens').locator('[aria-hidden="true"]')).toHaveText('⚠');
});

test('the labels are read once for the screen, not once per order', async ({ page }) => {
  await setMock({
    orders: ['a', 'b', 'c'].map((x, i) =>
      order({
        id: `o${i}`,
        reference: `${x.toUpperCase()}${x.toUpperCase()}${x.toUpperCase()}111`,
        status: 'PLACED',
        allergens: ['soy'],
      }),
    ),
  });
  await logInAsVendor(page);
  await expect(page.getByTestId('allergens')).toHaveCount(3);

  expect(await tagReads()).toBe(1);
});

test('an id the registry does not know is shown as itself, and nothing is dropped', async ({ page }) => {
  await setMock({
    orders: [order({ id: 'o1', reference: 'AAA111', status: 'PLACED', allergens: ['sesame', 'lupin'] })],
  });
  await logInAsVendor(page);

  await expect(page.getByTestId('allergens')).toHaveText('⚠ Allergy: sesame, lupin');
});

test('when the registry cannot be read the cards show the ids, so no allergen is hidden', async ({ page }) => {
  await setMock({
    tagsMode: 'fail',
    orders: [order({ id: 'o1', reference: 'AAA111', status: 'PLACED', allergens: ['tree-nut'] })],
  });
  await logInAsVendor(page);

  await expect(page.getByTestId('allergens')).toHaveText('⚠ Allergy: tree-nut');
});

test('an order arriving by the stream carries its allergens, and they stay as it moves along to Ready', async ({
  page,
}) => {
  await setMock({ streamMode: 'ok', heartbeatMs: 50, orders: [] });
  await logInAsVendor(page);
  await expect(page.getByTestId('queue-mode')).toHaveText('Live');

  await pushChange(
    order({ id: 'o9', reference: 'NEW999', status: 'PLACED', sequence: 1, allergens: ['dairy', 'egg'] }),
  );
  await expect(page.getByTestId('column-new').getByTestId('allergens')).toHaveText('⚠ Allergy: milk (dairy), eggs');

  await pushChange(
    order({ id: 'o9', reference: 'NEW999', status: 'IN_PREPARATION', sequence: 3, allergens: ['dairy', 'egg'] }),
  );
  await expect(page.getByTestId('column-preparing').getByTestId('allergens')).toHaveText(
    '⚠ Allergy: milk (dairy), eggs',
  );

  await pushChange(
    order({ id: 'o9', reference: 'NEW999', status: 'READY_FOR_FULFILLMENT', sequence: 4, allergens: ['dairy', 'egg'] }),
  );
  await expect(page.getByTestId('column-ready').getByTestId('allergens')).toHaveText('⚠ Allergy: milk (dairy), eggs'); // for the label or the staging
});

test('the marked queue has no automatically detectable accessibility violations', async ({ page }) => {
  await setMock({
    orders: [
      order({ id: 'o1', reference: 'AAA111', status: 'PLACED', allergens: ['tree-nut'] }),
      order({ id: 'o2', reference: 'BBB222', status: 'CONFIRMED' }),
    ],
  });
  await logInAsVendor(page);
  await expect(page.getByTestId('allergens')).toHaveCount(1);

  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
});
