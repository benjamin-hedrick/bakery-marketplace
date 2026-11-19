import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { globalId, userToken } from './support';

// WI-CAT-008 on the real stack: the vendor's listing screens in the vendor's web app (port 3100), through its server, the BFF and the catalog on Cosmos,
// and the customer's pages (port 3000) seeing the result. Each test makes its own listing (docs/testing.md); the seeded vendor Corner Bakery
// (vendor-shop-001) is verified by the seed. Needs the whole local stack and the vendor's web app (scripts/ci/skeleton-smoke.mjs starts them).

const BFF = process.env.BFF_URL ?? 'http://localhost:4100';
const VENDOR_APP = process.env.QUEUE_URL ?? 'http://localhost:3100';
const CUSTOMER_APP = process.env.WEB_URL ?? 'http://localhost:3000';

// Each journey logs in, fills a form and waits for the customer's pages to catch up several times: more than the default 30 s on a cold stack.
test.describe.configure({ timeout: 90_000 });

async function vendorApp(
  browser: Browser,
  who = 'Corner Bakery (owner)',
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ baseURL: VENDOR_APP });
  const page = await context.newPage();
  await page.goto('/listings');
  await page.getByRole('button', { name: 'Log in' }).first().click();
  await page.getByRole('button', { name: `Login as ${who} (Vendor)` }).click();
  await expect(page.getByTestId('user-name')).toHaveText(who);
  return { page, close: () => context.close() };
}

/** The customer's detail page for a listing: its HTTP status (a draft is not on the menu: 404) and, when shown, its price and stock. */
async function customerSees(page: Page, listingGid: string) {
  const response = await page.goto(`${CUSTOMER_APP}/listings/${encodeURIComponent(listingGid)}`);
  if (response?.status() !== 200) return { status: response?.status() ?? 0, price: null, stock: null };
  return {
    status: 200,
    price: await page.getByTestId('detail-price').textContent(),
    stock: await page.getByTestId('stock').getAttribute('data-status'),
  };
}

/** Creates a draft from the form and returns its Listing global id (from the address the form goes to). */
async function createFromForm(page: Page, name: string, opts: { price: string; count?: string; option?: string }) {
  await page.goto('/listings/new');
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Category').fill('Bread');
  await page.getByLabel('Price', { exact: true }).fill(opts.price);
  await page
    .getByRole('group', { name: 'Allergens', exact: true })
    .getByLabel('Gluten (wheat, rye, barley)') // the registry's label, as the catalog seeds it
    .check();
  if (opts.option) {
    await page.getByRole('button', { name: 'Add an option' }).click();
    await page.getByLabel('Option name').fill(opts.option);
    await page.getByLabel('Price difference').fill('0.25');
  }
  if (opts.count) {
    await page.getByLabel('Counted (each order takes from a count)').check();
    await page.getByLabel('Starting count').fill(opts.count);
  }
  await page.getByRole('button', { name: 'Create listing' }).click();
  await expect(page.getByTestId('editor-created')).toBeVisible({ timeout: 15_000 });
  const id = decodeURIComponent(new URL(page.url()).pathname.split('/').at(-1)!);
  expect(Buffer.from(id, 'base64').toString('utf8')).toMatch(/^Listing:listing-[0-9a-f]{32}$/);
  return id;
}

async function save(page: Page) {
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByTestId('editor-notice')).toHaveText('Saved.', { timeout: 15_000 });
}

const row = (page: Page, name: string) => page.getByTestId('listing-row').filter({ hasText: name });

test('a vendor creates, publishes, reprices, sells out and unpublishes a listing, and the customer sees each change', async ({
  browser,
}) => {
  const vendor = await vendorApp(browser);
  const customer = await (await browser.newContext()).newPage();
  const name = `Run Rye ${randomUUID().slice(0, 8)}`;
  try {
    const id = await createFromForm(vendor.page, name, { price: '5.00', count: '6', option: 'Sliced' });
    expect((await customerSees(customer, id)).status).toBe(404); // a draft is not on the menu

    await vendor.page.getByLabel('Published (customers see it)').check();
    await save(vendor.page);
    await expect
      .poll(async () => customerSees(customer, id))
      .toMatchObject({ status: 200, price: '$5.00', stock: 'IN_STOCK' });

    await vendor.page.getByLabel('Price', { exact: true }).fill('5.75');
    await save(vendor.page);
    await expect.poll(async () => (await customerSees(customer, id)).price).toBe('$5.75');

    await vendor.page.goto('/listings');
    await vendor.page.getByRole('button', { name: `Mark ${name} sold out` }).click();
    await expect(row(vendor.page, name).getByTestId('listing-stock')).toHaveText('0 left · Sold out');
    await expect.poll(async () => (await customerSees(customer, id)).stock).toBe('SOLD_OUT');

    await vendor.page.getByRole('button', { name: `Unpublish ${name}` }).click();
    await expect(row(vendor.page, name).getByTestId('listing-status')).toHaveText('Draft');
    await expect.poll(async () => (await customerSees(customer, id)).status).toBe(404);
  } finally {
    await vendor.close();
    await customer.context().close();
  }
});

test('two tabs edit the same listing: the second save is refused and offers the newer copy', async ({ browser }) => {
  const vendor = await vendorApp(browser);
  const name = `Two Tabs ${randomUUID().slice(0, 8)}`;
  try {
    const id = await createFromForm(vendor.page, name, { price: '3.00' });
    const first = vendor.page;
    const second = await first.context().newPage();
    await first.goto(`/listings/${encodeURIComponent(id)}`);
    await second.goto(`/listings/${encodeURIComponent(id)}`);
    await expect(second.getByLabel('Name', { exact: true })).toHaveValue(name);

    await first.getByLabel('Name', { exact: true }).fill(`${name} (first tab)`);
    await save(first);
    await second.getByLabel('Name', { exact: true }).fill(`${name} (second tab)`);
    await second.getByRole('button', { name: 'Save changes' }).click();

    await expect(second.getByTestId('editor-notice')).toContainText('was changed since you opened it');
    await expect(second.getByLabel('Name', { exact: true })).toHaveValue(`${name} (second tab)`); // kept
    await second.getByRole('button', { name: /Load the newer copy/ }).click();
    await expect(second.getByLabel('Name', { exact: true })).toHaveValue(`${name} (first tab)`);
  } finally {
    await vendor.close();
  }
});

test('another vendor’s listing in the address is not found, and is not in their list', async ({ browser }) => {
  const owner = await vendorApp(browser);
  const name = `Not Yours ${randomUUID().slice(0, 8)}`;
  let id = '';
  try {
    id = await createFromForm(owner.page, name, { price: '2.00' });
  } finally {
    await owner.close();
  }
  const other = await vendorApp(browser, 'Homemade Treats (owner)');
  try {
    await other.page.goto(`/listings/${encodeURIComponent(id)}`);
    await expect(other.page.getByTestId('editor-not-found')).toBeVisible();
    await other.page.goto('/listings');
    await expect(other.page.getByTestId('listing-row').filter({ hasText: name })).toHaveCount(0);
  } finally {
    await other.close();
  }
});

test('a stock removal racing a customer’s checkout for the last unit: one wins, and the screen shows the result', async ({
  browser,
}) => {
  const vendor = await vendorApp(browser);
  const name = `Last One ${randomUUID().slice(0, 8)}`;
  try {
    const id = await createFromForm(vendor.page, name, { price: '4.00', count: '1' });
    await vendor.page.getByLabel('Published (customers see it)').check();
    await save(vendor.page);
    await vendor.page.goto('/listings');
    await expect(row(vendor.page, name).getByTestId('listing-stock')).toHaveText('1 left · Low');

    const customerToken = await userToken('user-customer-1');
    const checkout = fetch(`${BFF}/graphql`, {
      method: 'POST',
      headers: { authorization: `Bearer ${customerToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        query: `mutation($input: PlaceOrderInput!) { placeOrder(input: $input) { __typename ... on PlaceOrderRejected { code } } }`,
        variables: {
          input: {
            idempotencyKey: `race-${randomUUID()}`,
            paymentMethodId: 'pm-alice-ok',
            vendorId: 'vendor-shop-001',
            lineItems: [{ listingId: id, modifierIds: [], quantity: 1 }],
            pickupWindow: null,
          },
        },
      }),
    }).then(
      async (r) =>
        ((await r.json()) as { data: { placeOrder: { __typename: string; code?: string } } }).data.placeOrder,
    );
    const removal = vendor.page.getByRole('button', { name: `Remove 1 from ${name}` }).click();
    const [order] = await Promise.all([checkout, removal]);

    await expect(row(vendor.page, name).getByTestId('listing-stock')).toHaveText('0 left · Sold out', {
      timeout: 15_000,
    });
    const message = (await row(vendor.page, name).getByTestId('row-message').textContent()) ?? '';
    const orderWon = order.__typename === 'PlaceOrderSuccess';
    const removalWon = message.includes('0 left');
    expect(orderWon !== removalWon, `order ${JSON.stringify(order)}, screen "${message}"`).toBe(true); // exactly one took the unit
    if (orderWon) expect(message).toContain('The count had changed');
    else expect(['INSUFFICIENT_STOCK', 'LISTING_UNAVAILABLE']).toContain(order.code);
  } finally {
    await vendor.close();
  }
});

test('the vendor’s pages refuse a customer’s login and a write without the app’s own origin', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: VENDOR_APP });
  const page = await context.newPage();
  try {
    await page.goto('/listings');
    await page.getByRole('button', { name: 'Log in' }).first().click();
    await page.getByRole('button', { name: 'Login as Alice Customer (Customer)' }).click();
    await expect(page.getByTestId('listings-forbidden')).toBeVisible({ timeout: 15_000 });

    const refused = await page.request.post('/api/graphql', {
      headers: { origin: 'http://evil.example', 'content-type': 'application/json' },
      data: JSON.stringify({
        query: 'mutation($id: ID!) { adjustListingStock(id: $id, delta: -1) { __typename } }',
        variables: { id: globalId('Listing', 'listing-sourdough-001') },
      }),
    });
    expect(refused.status()).toBe(403);
  } finally {
    await context.close();
  }
});
