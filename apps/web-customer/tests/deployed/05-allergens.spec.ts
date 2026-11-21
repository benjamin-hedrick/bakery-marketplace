import type { Page } from '@playwright/test';
import { CUSTOMERS, LISTINGS, WEB, addToOrder, expect, logInAs, placeButton, test } from './support';

// Test 9 of the deployed suite (register 218): Nora's seeded tree-nut allergy (tools/BakeryMarketplace.Seed, WI-MOB-002), the preferences container,
// and the checkout's allergy check. The profile page shows what is saved, a change is saved and comes back after a reload, and an order of the walnut
// praline tart (tree nuts on the item and on "Extra praline") is held until she acknowledges. The profile is put back as it was found.
// The tart is this test's own and made to order: it replaced the almond croissant (4 units), which a deployed environment had sold out after four runs
// (the dev run of 2026-11-21 failed here on the missing option checkbox, because a listing that cannot be ordered shows its options read-only).
// Not covered here: what the bakery is told with the order (the order page does not show it; locally it is read through the BFF).

const group = (page: Page, allergen: string) =>
  page.locator(`[data-testid="allergen-group"][data-allergen="${allergen}"]`);

async function setDairy(page: Page, choice: RegExp) {
  await page.goto('/preferences');
  await group(page, 'dairy').getByRole('radio', { name: choice }).check();
  await page.getByRole('button', { name: 'Save my choices' }).click();
  await expect(page.getByTestId('preferences-saved')).toBeVisible();
}

test("9. a saved allergen profile comes back, and an order with a conflict waits for the customer's acknowledgement", async ({
  page,
}) => {
  await page.goto('/preferences');
  await page.getByTestId('login-required').getByRole('button', { name: 'Log in' }).click();
  await logInAs(page, CUSTOMERS.nora);
  await expect(page).toHaveURL(`${WEB}/preferences`);
  await expect(group(page, 'tree-nut').getByRole('radio', { name: /^Allergy/ })).toBeChecked(); // seeded

  const dairyWas = (await group(page, 'dairy')
    .getByRole('radio', { name: /^Avoid/ })
    .isChecked())
    ? /^Avoid/
    : /^Not set/;
  try {
    await setDairy(page, /^Avoid/);
    await page.reload();
    await expect(group(page, 'dairy').getByRole('radio', { name: /^Avoid/ })).toBeChecked(); // stored, not only shown

    await addToOrder(page, LISTINGS.tart, { option: /Extra praline/ });
    await page.getByTestId('cart-link').click();
    await expect(page.getByRole('form', { name: 'Place your order' })).toBeVisible(); // logged in already
    await expect(page.getByTestId('line-allergens')).toContainText('tree nuts');
    await expect(page.getByTestId('conflicts')).toContainText(
      `${LISTINGS.tart} contains tree nuts, which you listed as an allergy`,
    );
    await expect(page.getByTestId('conflicts')).toContainText('which you avoid'); // dairy, a preference
    await expect(placeButton(page)).toBeDisabled();
    await page.getByRole('checkbox', { name: 'I have read this and still want to order' }).check();
    await expect(page.getByTestId('tell-bakery').getByRole('checkbox', { name: 'Tree nuts' })).toBeChecked();
    await expect(page.getByLabel('Pickup time')).toBeEnabled();
    await placeButton(page).click();
    await expect(page).toHaveURL(/\/orders\/.+/);
    await expect(page.getByTestId('order-item')).toContainText(LISTINGS.tart);
  } finally {
    await setDairy(page, dairyWas); // leave the seeded customer as found
  }
});
